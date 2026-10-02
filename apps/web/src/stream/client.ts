import { API_PREFIX, isServerMessage, type Alert, type ClientMessage, type LiveState, type ServerMessage } from "@cme/shared";
import type { Conn, LiveStore } from "../store/live.ts";
import { applyAlert, applyDelta, applySnapshot, toLiveState } from "./apply.ts";

export interface StateCache {
  load(): Promise<LiveState | null>;
  save(state: LiveState): Promise<void>;
}

export interface LiveStreamOptions {
  store: LiveStore;
  /** "" = same origin (browser). Tests pass "http://localhost:<port>". */
  baseUrl?: string;
  cache?: StateCache;
  WebSocketImpl?: typeof WebSocket;
  fetchImpl?: typeof fetch;
  /** Reconnect delay: base × 2^(failures−1), capped, with jitter. */
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /** Switch to polling GET /state after this many WS attempts in a row that got no message. */
  pollAfterFailures?: number;
  pollMs?: number;
  /** Reconnect when nothing (not even a ping, every 15 s) has arrived for this long. */
  silenceMs?: number;
  /** Reconnect from scratch if a requested resync snapshot doesn't come. */
  resyncTimeoutMs?: number;
  cacheEveryMs?: number;
  random?: () => number;
  /** Called for each new `alert` message, after it is in the store (toast / sound / notification). */
  onAlert?: (alert: Alert) => void;
}

type Timer = ReturnType<typeof setTimeout>;

/**
 * Keeps the live store in step with the server (docs/design/frontend section 3):
 *
 * - Boot: paint the IndexedDB copy, then GET /state, then open WS /stream?since=<seq>.
 * - Every sequenced message must be seq + 1. A gap sends {"type":"resync"} and drops messages until the
 *   snapshot arrives; a duplicate (seq ≤ current) is ignored.
 * - On close: reconnect with backoff, resuming with ?since=<seq> so the server replays what was missed.
 * - After 3 failed attempts in a row: also poll GET /state every 30 s until the socket is back.
 *
 * No React in here, so it runs unchanged under node:test against the mock server.
 */
export class LiveStream {
  private readonly o: Required<Omit<LiveStreamOptions, "cache" | "onAlert">> &
    Pick<LiveStreamOptions, "cache" | "onAlert">;
  private ws: WebSocket | null = null;
  private stopped = true;
  private opened = false; // the current socket connected
  private awaitingSnapshot = false;
  private dirty = false; // store changed since the last cache save
  private reconnectTimer: Timer | null = null;
  private silenceTimer: Timer | null = null;
  private resyncTimer: Timer | null = null;
  private pollTimer: Timer | null = null;
  private cacheTimer: Timer | null = null;
  private pollAbort: AbortController | null = null;

  constructor(opts: LiveStreamOptions) {
    this.o = {
      baseUrl: "",
      WebSocketImpl: globalThis.WebSocket,
      fetchImpl: globalThis.fetch.bind(globalThis),
      backoffBaseMs: 500,
      backoffMaxMs: 30_000,
      pollAfterFailures: 3,
      pollMs: 30_000,
      silenceMs: 40_000,
      resyncTimeoutMs: 10_000,
      cacheEveryMs: 30_000,
      random: Math.random,
      ...opts,
    };
  }

  async start(): Promise<void> {
    if (!this.stopped) return;
    this.stopped = false;
    this.setConn({ status: "connecting" });

    const cached = await this.o.cache?.load().catch(() => null);
    if (this.stopped) return;
    // Paint only: the cached seq may belong to another server run, so never resume from it.
    if (cached && this.o.store.getState().seq === null) applySnapshot(this.o.store, cached, "cache", false);

    await this.fetchState();
    if (this.stopped) return;
    this.connect();
    if (this.o.cache) this.cacheTimer = setInterval(() => void this.saveCache(), this.o.cacheEveryMs);
  }

  stop(): void {
    this.stopped = true;
    for (const t of [this.reconnectTimer, this.silenceTimer, this.resyncTimer]) if (t) clearTimeout(t);
    for (const t of [this.pollTimer, this.cacheTimer]) if (t) clearInterval(t);
    this.reconnectTimer = this.silenceTimer = this.resyncTimer = this.pollTimer = this.cacheTimer = null;
    this.pollAbort?.abort();
    this.dropSocket();
    void this.saveCache();
  }

  /** Reconnect now (e.g. the browser's `online` event) instead of waiting out the backoff. */
  reconnectNow(): void {
    if (this.stopped || this.ws?.readyState === 1 /* OPEN */) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.dropSocket();
    this.connect();
  }

  /** Write the current state to the cache, if it changed. Also called on stop() and page hide. */
  async saveCache(): Promise<void> {
    if (!this.o.cache || !this.dirty) return;
    const s = toLiveState(this.o.store.getState());
    if (!s) return;
    this.dirty = false;
    await this.o.cache.save(s).catch(() => {
      this.dirty = true;
    });
  }

  // ---- WebSocket -------------------------------------------------------------

  private connect(): void {
    if (this.stopped) return;
    const seq = this.o.store.getState().seq;
    const since = seq !== null && !this.awaitingSnapshot ? `?since=${seq}` : "";
    this.awaitingSnapshot = false;
    this.opened = false;

    let ws: WebSocket;
    try {
      ws = new this.o.WebSocketImpl(`${this.wsBase()}${API_PREFIX}/stream${since}`);
    } catch {
      this.onClose();
      return;
    }
    this.ws = ws;
    // Live as soon as the socket opens: a quiet server (real-time speed) may not send anything for a minute.
    ws.onopen = () => this.ws === ws && this.markOpen();
    ws.onmessage = (ev) => this.onMessage(ev.data);
    // Either event ends this socket, once. Browsers send close after error, Node's WebSocket may not;
    // never call ws.close() from onerror (it can re-fire error).
    const ended = () => this.ws === ws && this.onClose();
    ws.onclose = ended;
    ws.onerror = ended;
    this.armSilence();
  }

  private onMessage(raw: unknown): void {
    let m: unknown;
    try {
      m = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!isServerMessage(m)) return;

    this.armSilence();
    this.markOpen();
    this.setConn({ lastMessageAt: Date.now() / 1000 });
    this.handle(m);
  }

  private markOpen(): void {
    if (this.opened) return;
    this.opened = true;
    this.stopPolling();
    this.setConn({ status: "live", failures: 0 });
  }

  private handle(m: ServerMessage): void {
    const store = this.o.store;
    if (m.type === "ping") {
      this.send({ type: "pong", ts: m.ts });
      return;
    }
    if (m.type === "snapshot") {
      const afterGap = this.resyncTimer !== null;
      if (this.resyncTimer) clearTimeout(this.resyncTimer);
      this.resyncTimer = null;
      applySnapshot(store, m.data, "ws");
      if (afterGap) this.setConn({ resyncs: store.getState().conn.resyncs + 1 });
      this.dirty = true;
      return;
    }

    const seq = store.getState().seq;
    if (this.resyncTimer || seq === null) return; // waiting for a snapshot
    if (m.seq <= seq) return; // duplicate / already applied
    if (m.seq !== seq + 1) {
      this.requestResync();
      return;
    }
    if (store.getState().conn.source !== "ws") this.setConn({ source: "ws" });
    if (m.type === "delta") applyDelta(store, m.seq, m.data);
    else {
      applyAlert(store, m.seq, m.data);
      this.o.onAlert?.(m.data);
    }
    this.dirty = true;
  }

  private requestResync(): void {
    this.setConn({ gaps: this.o.store.getState().conn.gaps + 1 });
    this.send({ type: "resync" });
    this.resyncTimer = setTimeout(() => {
      // no snapshot came: reconnect without ?since so the server must send one
      this.resyncTimer = null;
      this.awaitingSnapshot = true;
      this.ws?.close();
    }, this.o.resyncTimeoutMs);
  }

  private onClose(): void {
    this.ws = null;
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    if (this.resyncTimer) {
      clearTimeout(this.resyncTimer);
      this.resyncTimer = null;
      this.awaitingSnapshot = true;
    }
    if (this.stopped) return;

    const failures = this.opened ? 1 : this.o.store.getState().conn.failures + 1;
    this.setConn({ failures, status: this.pollTimer ? "polling" : "reconnecting" });
    if (failures >= this.o.pollAfterFailures) this.startPolling();

    const exp = Math.min(this.o.backoffMaxMs, this.o.backoffBaseMs * 2 ** (failures - 1));
    const delay = exp * (0.5 + this.o.random() * 0.5);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  /** A connection that stays open but silent (half-open TCP, sleeping laptop) is treated as closed. */
  private armSilence(): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => {
      if (!this.ws) return;
      this.dropSocket();
      this.onClose();
    }, this.o.silenceMs);
  }

  /** Close the socket without triggering onClose (the caller decides what happens next). */
  private dropSocket(): void {
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    ws.close();
  }

  private send(m: ClientMessage): void {
    if (this.ws?.readyState === 1 /* OPEN */) this.ws.send(JSON.stringify(m));
  }

  // ---- REST ------------------------------------------------------------------

  private startPolling(): void {
    if (this.pollTimer || this.stopped) return;
    this.setConn({ status: "polling" });
    void this.fetchState();
    this.pollTimer = setInterval(() => void this.fetchState(), this.o.pollMs);
  }

  private stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  /** GET /state into the store. Failures are fine: the socket or the next poll will catch up. */
  private async fetchState(): Promise<void> {
    this.pollAbort?.abort();
    const ctrl = (this.pollAbort = new AbortController());
    const timeout = setTimeout(() => ctrl.abort(), 5000); // boot must not wait long before trying the socket
    try {
      const res = await this.o.fetchImpl(`${this.o.baseUrl}${API_PREFIX}/state`, { signal: ctrl.signal });
      if (!res.ok) return;
      const s = (await res.json()) as LiveState;
      if (this.stopped || ctrl.signal.aborted) return;
      const cur = this.o.store.getState().seq;
      if (this.opened && cur !== null && s.seq <= cur) return; // the socket is already ahead
      applySnapshot(this.o.store, s, "rest");
      this.dirty = true;
    } catch {
      /* offline, timed out or aborted */
    } finally {
      clearTimeout(timeout);
    }
  }

  // ---- helpers ---------------------------------------------------------------

  private wsBase(): string {
    if (this.o.baseUrl) return this.o.baseUrl.replace(/^http/, "ws");
    return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
  }

  private setConn(patch: Partial<Conn>): void {
    const cur = this.o.store.getState().conn;
    this.o.store.setState({ conn: { ...cur, ...patch } });
  }
}
