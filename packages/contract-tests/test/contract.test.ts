/**
 * The /api/v1 contract (docs/design/contract/DETAILED_DESIGN.md §2.2 and §7), as tests any server must pass.
 * Every message and response is also checked against the shared schemas.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import {
  checkLiveState, eventsResponseSchema, healthResponseSchema, historyResponseSchema, STATE_WINDOW_S, type LiveState,
} from "@cme/shared";
import { api, startTarget, Stream, type Target } from "../src/target.ts";

let t: Target;
const streams: Stream[] = [];
before(async () => {
  t = await startTarget();
});
after(async () => {
  streams.forEach((s) => s.close());
  await t.close();
});

const stream = (since?: number) => {
  const s = new Stream(t, since);
  streams.push(s);
  return s;
};
const getJson = async (path: string) => {
  const r = await fetch(api(t, path));
  return { status: r.status, body: await r.json() };
};
const state = async (): Promise<LiveState> => {
  const { status, body } = await getJson("/state");
  assert.equal(status, 200);
  const c = checkLiveState(body);
  assert.ok(c.ok, `GET /state: ${!c.ok && c.error}`);
  return c.value;
};
const consecutive = (seqs: number[]) => seqs.every((s, i) => i === 0 || s === seqs[i - 1] + 1);

test("GET /state: valid LiveState, series in time order within the 6 h window", async () => {
  const s = await state();
  for (const series of [s.xray, s.wind]) {
    assert.ok(series.t.length > 0, "has data");
    assert.ok(series.t.at(-1)! - series.t[0] <= STATE_WINDOW_S, "6 h window");
  }
  assert.ok(s.feeds.length > 0, "feed status present");
});

test("stream without ?since starts with a snapshot, then consecutive seqs", async () => {
  const s = stream();
  const first = await s.until("first message", () => s.sequenced[0]);
  assert.equal(first.type, "snapshot");
  await s.until("3 more messages", () => s.sequenced.length >= 4);
  assert.ok(consecutive(s.sequenced.map((m) => m.seq)), `seqs: ${s.sequenced.map((m) => m.seq)}`);
  assert.deepEqual(s.invalid, []);
});

test("resume with ?since=n replays exactly n+1, n+2, … (no snapshot)", async () => {
  const a = stream();
  await a.until("a few messages", () => a.sequenced.length >= 4);
  const n = a.sequenced[1].seq;
  const b = stream(n);
  await b.until("replay", () => b.sequenced.length >= 2);
  assert.notEqual(b.sequenced[0].type, "snapshot");
  assert.equal(b.sequenced[0].seq, n + 1);
  assert.ok(consecutive(b.sequenced.map((m) => m.seq)));
  assert.deepEqual(b.invalid, []);
});

test("?since the server can't replay (ahead of it, e.g. after a server restart) gets a snapshot", async () => {
  const s = stream((await state()).seq + 1_000_000);
  const first = await s.until("first message", () => s.sequenced[0]);
  assert.equal(first.type, "snapshot");
});

test("{type:'resync'} is answered with a snapshot", async () => {
  const s = stream();
  await s.opened;
  await s.until("first snapshot", () => s.sequenced.length >= 1);
  s.send({ type: "resync" });
  await s.until("second snapshot", () => s.sequenced.filter((m) => m.type === "snapshot").length >= 2);
});

test("a test alert reaches an open socket in under 1 s and is in /state", async (ctx) => {
  if (!t.control) return ctx.skip("this server can't be driven (set CONTRACT_CONTROL)");
  const s = stream();
  await s.until("connected", () => s.sequenced.length >= 1);
  const sent = Date.now();
  const id = await t.control.testAlert();
  await s.until("alert", () => s.messages.some((m) => m.type === "alert" && m.data.id === id), 1000);
  assert.ok(Date.now() - sent < 1000);
  assert.ok((await state()).alerts.some((a) => a.id === id && a.clearedAt === null));
});

test("GET /history: valid columnar series inside the requested range; bad queries get 400", async () => {
  const now = (await state()).clock.now;
  for (const series of ["xray", "wind"]) {
    const { status, body } = await getJson(`/history?series=${series}&res=5m&from=${Math.round(now - 86400)}&to=${Math.round(now)}`);
    assert.equal(status, 200);
    const h = historyResponseSchema.safeParse(body);
    assert.ok(h.success, `history ${series}`);
    const ts = h.data.data.t;
    assert.ok(ts.length > 200, `${series}: ${ts.length} points for 24 h at 5 min`);
    assert.ok(ts[0] >= now - 86400 - 300 && ts.at(-1)! <= now + 60, "inside the range");
  }
  for (const q of ["series=sun", "series=xray&res=1h", "series=xray&from=abc"]) {
    assert.equal((await getJson(`/history?${q}`)).status, 400, q);
  }
});

test("GET /events: filters by type, valid shapes", async () => {
  const { status, body } = await getJson("/events?type=flare,cme");
  assert.equal(status, 200);
  assert.ok(eventsResponseSchema.safeParse(body).success);
  assert.ok(Array.isArray(body.flares) && Array.isArray(body.cmes));
  assert.equal(body.alerts, undefined, "alerts not asked for");
});

test("GET /health: clock and feed status", async () => {
  const { status, body } = await getJson("/health");
  assert.equal(status, 200);
  assert.ok(healthResponseSchema.safeParse(body).success);
});

test("mock-only routes don't exist on a real backend", async (ctx) => {
  if (t.isMock) return ctx.skip("this is the mock");
  const r = await fetch(`${t.base}/mock/reset`, { method: "POST", body: "{}" });
  assert.equal(r.status, 404);
});
