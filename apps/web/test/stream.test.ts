/**
 * LiveStream against the real mock server (in-process, random port), including its chaos faults.
 * The mock runs at 600× so a delta arrives every second.
 */
import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { LiveState } from "@cme/shared";
import { startMockServer } from "../../mock/src/server.ts";
import { loadFixtures } from "../../mock/src/fixtures.ts";
import { createLiveStore, type LiveStore } from "../src/store/live.ts";
import { LiveStream, type LiveStreamOptions } from "../src/stream/client.ts";

let mock: ReturnType<typeof startMockServer>;
let base: string;

before(async () => {
  mock = startMockServer({ port: 0, fixtures: loadFixtures(), speed: 600 });
  await new Promise((r) => mock.server.once("listening", r));
  base = `http://127.0.0.1:${(mock.server.address() as AddressInfo).port}`;
});
after(() => mock.close());

const running: LiveStream[] = [];
afterEach(async () => {
  running.splice(0).forEach((s) => s.stop());
  await chaos({});
});

const chaos = (c: Record<string, number>) =>
  fetch(`${base}/mock/chaos`, { method: "POST", body: JSON.stringify(c) }).then((r) => r.json());

async function waitFor(what: string, ok: () => boolean, ms = 8000) {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) assert.fail(`timed out waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** A WebSocket class that records every URL it was opened with. */
function recordingWs(urls: string[], allow: () => boolean = () => true): typeof WebSocket {
  return class extends WebSocket {
    constructor(url: string | URL) {
      urls.push(String(url));
      super(allow() ? url : "ws://127.0.0.1:1/refused");
    }
  };
}

function open(opts: Partial<LiveStreamOptions> = {}) {
  const store = createLiveStore();
  const stream = new LiveStream({ store, baseUrl: base, backoffBaseMs: 20, backoffMaxMs: 100, random: () => 1, ...opts });
  running.push(stream);
  return { store, stream };
}

const caughtUp = (store: LiveStore) => () =>
  store.getState().seq === mock.engine.seq && store.getState().conn.status === "live";

test("boot: GET /state, then the socket resumes from that seq and deltas apply in order", async () => {
  const urls: string[] = [];
  const { store, stream } = open({ WebSocketImpl: recordingWs(urls) });
  await stream.start();
  assert.equal(store.getState().conn.source, "rest", "painted from GET /state before the socket");
  assert.match(urls[0], /\/api\/v1\/stream\?since=\d+$/);

  const seq0 = store.getState().seq!;
  await waitFor("3 deltas", () => store.getState().seq! >= seq0 + 3);
  await waitFor("caught up", caughtUp(store));
  const s = store.getState();
  assert.equal(s.conn.source, "ws");
  assert.equal(s.conn.gaps, 0);
  assert.equal(s.xray.lastT, mock.engine.state().xray.t.at(-1));
  assert.ok(s.xray.length > 300 && s.wind.length > 300, "6 h of series");
  stream.stop();
});

test("a seq gap triggers a resync, and the store ends up equal to the server", async () => {
  const { store, stream } = open();
  await stream.start();
  await chaos({ skipEveryN: 3 });
  await waitFor("gap detected and resynced", () => store.getState().conn.resyncs >= 1);
  await chaos({});
  await waitFor("caught up", caughtUp(store));

  const server = mock.engine.state();
  const s = store.getState();
  assert.ok(s.conn.gaps >= 1);
  assert.equal(s.xray.lastT, server.xray.t.at(-1));
  assert.deepEqual(s.flares.map((f) => f.id).sort(), server.flares.map((f) => f.id).sort());
  assert.deepEqual(s.feeds.map((f) => `${f.id}:${f.stale}`), server.feeds.map((f) => `${f.id}:${f.stale}`));
  stream.stop();
});

test("a dropped socket reconnects with ?since and catches up without a snapshot", async () => {
  const urls: string[] = [];
  const sockets: WebSocket[] = [];
  const Base = recordingWs(urls);
  const { store, stream } = open({
    WebSocketImpl: class extends Base {
      constructor(url: string | URL) {
        super(url);
        sockets.push(this);
      }
    },
  });
  await stream.start();
  await waitFor("live", caughtUp(store));
  const seqAtDrop = store.getState().seq!;

  sockets[0].close(); // like a network blip
  await waitFor("reconnected", () => urls.length === 2);
  assert.ok(urls[1].endsWith(`?since=${seqAtDrop}`) || Number(urls[1].split("since=")[1]) > seqAtDrop);
  await waitFor("caught up", () => store.getState().seq! > seqAtDrop + 1 && caughtUp(store)());
  assert.equal(store.getState().conn.resyncs, 0);
  assert.equal(store.getState().conn.gaps, 0);
  stream.stop();
});

test("after 3 failed attempts it polls GET /state, and stops polling when the socket is back", async () => {
  let allow = false;
  const { store, stream } = open({ WebSocketImpl: recordingWs([], () => allow), pollMs: 300 });
  await stream.start();
  await waitFor("polling", () => store.getState().conn.status === "polling");
  const seq0 = store.getState().seq!;
  await waitFor("data keeps flowing over REST", () => store.getState().seq! > seq0);
  assert.equal(store.getState().conn.source, "rest");

  allow = true;
  await waitFor("live again", caughtUp(store));
  assert.equal(store.getState().conn.failures, 0);
  stream.stop();
});

test("a cached state paints first, but its seq is never used to resume", async () => {
  const cached = (await fetch(`${base}/api/v1/state`).then((r) => r.json())) as LiveState;
  cached.seq = 999_999; // from another server run
  const urls: string[] = [];
  let saved: LiveState | null = null;
  let goOffline!: () => void;
  const offline = new Promise<never>((_, reject) => (goOffline = () => reject(new Error("offline"))));
  const { store, stream } = open({
    cache: { load: async () => cached, save: async (s) => void (saved = s) },
    fetchImpl: () => offline, // GET /state hangs until the cache paint was checked, then fails
    WebSocketImpl: recordingWs(urls),
  });

  const starting = stream.start();
  await waitFor("painted from cache", () => store.getState().conn.source === "cache");
  assert.equal(store.getState().seq, null);
  goOffline();
  await starting;
  assert.ok(urls[0].endsWith("/api/v1/stream"), `no ?since: ${urls[0]}`);
  await waitFor("live from a snapshot", caughtUp(store));

  stream.stop(); // saves on stop
  await waitFor("saved", () => saved !== null);
  assert.equal(saved!.seq, store.getState().seq);
});

test("a silent socket (half-open connection) is dropped and replaced", async () => {
  const urls: string[] = [];
  const { store, stream } = open({ WebSocketImpl: recordingWs(urls), silenceMs: 300 });
  await chaos({ latencyMs: 2000 }); // nothing arrives for 2 s
  await stream.start();
  await waitFor("second attempt", () => urls.length >= 2, 3000);
  await chaos({});
  await waitFor("live", caughtUp(store));
  stream.stop();
});

test("the badge goes live when the socket opens, even if the server is quiet", async () => {
  const { store, stream } = open();
  await chaos({ latencyMs: 3000 }); // like real-time speed: nothing for a while after connecting
  await stream.start();
  await waitFor("live before any message", () => store.getState().conn.status === "live", 2000);
  assert.equal(store.getState().conn.lastMessageAt, null);
  assert.equal(store.getState().conn.source, "rest");
});

test("a test alert reaches an open page in under 1 s (PLAN phase 4)", async () => {
  const got: { id: string; at: number }[] = [];
  const { store, stream } = open({ onAlert: (a) => got.push({ id: a.id, at: Date.now() }) });
  await stream.start();
  await waitFor("caught up", caughtUp(store));
  const sent = Date.now();
  const a = await fetch(`${base}/mock/alert`, { method: "POST", body: "{}" }).then((r) => r.json());
  await waitFor("alert delivered", () => got.some((g) => g.id === a.id), 1000);
  const ms = got.find((g) => g.id === a.id)!.at - sent;
  assert.ok(ms < 1000, `delivered in ${ms} ms`);
  assert.ok(store.getState().alerts.some((x) => x.id === a.id && x.clearedAt === null), "in the store too");
});
