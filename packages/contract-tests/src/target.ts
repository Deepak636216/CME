/**
 * Which server the contract tests run against.
 *
 * - default: the mock, started in-process on a random port at 600× speed (so deltas arrive every second);
 * - CONTRACT_BASE_URL=https://… : any running server (the Worker under `wrangler dev`, staging, …).
 *   CONTRACT_CONTROL=mock adds the /mock/* controls when that server is a mock; otherwise tests that need
 *   to trigger events on demand are skipped.
 */
import type { AddressInfo } from "node:net";
import { API_PREFIX, checkServerMessage, type ServerMessage } from "@cme/shared";

export interface Control {
  /** Make the server raise a test alert now; resolves with its id. */
  testAlert(): Promise<string>;
}

export interface Target {
  base: string;
  /** null when this server can't be driven (e.g. production). */
  control: Control | null;
  /** The server must 404 on mock-only routes (true for the real backend). */
  isMock: boolean;
  close(): Promise<void>;
}

const mockControl = (base: string): Control => ({
  testAlert: async () => (await (await fetch(`${base}/mock/alert`, { method: "POST", body: "{}" })).json()).id,
});

export async function startTarget(): Promise<Target> {
  const url = process.env.CONTRACT_BASE_URL;
  if (url) {
    const base = url.replace(/\/$/, "");
    const isMock = process.env.CONTRACT_CONTROL === "mock";
    return { base, isMock, control: isMock ? mockControl(base) : null, close: async () => {} };
  }
  const { startMockServer } = await import("@cme/mock/server");
  const { loadFixtures } = await import("@cme/mock/fixtures");
  const mock = startMockServer({ port: 0, fixtures: loadFixtures(), speed: 600 });
  await new Promise((r) => mock.server.once("listening", r));
  const base = `http://127.0.0.1:${(mock.server.address() as AddressInfo).port}`;
  return { base, isMock: true, control: mockControl(base), close: async () => mock.close() };
}

/** How long to wait for stream traffic. A real-time server sends a delta about once a minute: use ~150000. */
export const WAIT_MS = Number(process.env.CONTRACT_WAIT_MS ?? 8000);

export const api = (t: Target, path: string) => `${t.base}${API_PREFIX}${path}`;

/** A raw WebSocket on /stream that records every message and checks each against the contract schemas. */
export class Stream {
  readonly messages: ServerMessage[] = [];
  readonly invalid: string[] = [];
  private ws: WebSocket;
  readonly opened: Promise<void>;

  constructor(t: Target, since?: number) {
    this.ws = new WebSocket(`${t.base.replace(/^http/, "ws")}${API_PREFIX}/stream${since === undefined ? "" : `?since=${since}`}`);
    this.opened = new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error("socket failed to open"));
    });
    this.ws.onmessage = (ev) => {
      const r = checkServerMessage(JSON.parse(String(ev.data)));
      if (r.ok) this.messages.push(r.value);
      else if (r.error !== "unknown") this.invalid.push(r.error);
    };
  }

  /** Sequenced messages only (snapshot, delta, alert). */
  get sequenced() {
    return this.messages.filter((m): m is Exclude<ServerMessage, { type: "ping" }> => m.type !== "ping");
  }

  send(m: unknown) {
    this.ws.send(JSON.stringify(m));
  }

  async until<T>(what: string, get: () => T | undefined | false, ms = WAIT_MS): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
      const v = get();
      if (v) return v;
      if (Date.now() > end) throw new Error(`timed out waiting for: ${what}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  close() {
    this.ws.close();
  }
}
