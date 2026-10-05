import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLiveState, checkServerMessage, emptyWind, emptyXray, type LiveState } from "../src/index.ts";

const state = (): LiveState => ({
  seq: 5,
  clock: { now: 1_790_000_000, speed: 1, mode: "live", scenario: null },
  xray: { t: [1, 2], long: [1e-6, null], short: [1e-7, 2e-7] },
  wind: emptyWind(),
  regions: [],
  flares: [],
  cmes: [],
  alerts: [],
  feeds: [],
});
const msg = (data: unknown) => ({ type: "snapshot", seq: 5, ts: 1, data });
const error = (x: unknown) => {
  const r = checkServerMessage(x);
  return r.ok ? null : r.error;
};

test("a valid snapshot passes, with null for a missing sample", () => {
  assert.equal(error(msg(state())), null);
  assert.equal(error({ type: "ping", ts: 1 }), null);
  assert.equal(error({ type: "delta", seq: 6, ts: 1, data: {} }), null, "an empty delta is fine");
});

test("unknown message types are reported as unknown (ignored, so the server can add new ones)", () => {
  assert.equal(error({ type: "hello", protocol: 1 }), "unknown");
  assert.equal(error(null), "unknown");
});

test("broken data is rejected with the path of the problem", () => {
  const s = state();
  s.xray.long = [1e-6]; // shorter than t
  assert.match(error(msg(s))!, /xray.*length/);

  const back = state();
  back.xray.t = [2, 1];
  assert.match(error(msg(back))!, /backwards/);

  assert.match(error({ type: "delta", seq: 6, ts: 1, data: { xray: { t: [1], long: ["x"], short: [1] } } })!, /xray\.long\.0/);
  assert.match(error({ type: "delta", seq: -1, ts: 1, data: {} })!, /seq/);
  assert.match(error({ type: "delta", seq: 1.5, ts: 1, data: {} })!, /seq/);
  assert.match(error({ type: "snapshot", seq: 1, ts: 1 })!, /data/);
});

test("enums, required fields and list caps are enforced", () => {
  const alert = { id: "a", rule: "SOLAR_PANIC", level: "watch", title: "", message: "", refType: "flare", refId: "f", raisedAt: 1, clearedAt: null };
  assert.match(error({ type: "alert", seq: 1, ts: 1, data: alert })!, /rule/);
  const { title: _t, ...noTitle } = { ...alert, rule: "FLARE_M" };
  assert.match(error({ type: "alert", seq: 1, ts: 1, data: noTitle })!, /title/);

  const s = state();
  s.feeds = Array.from({ length: 21 }, () => ({
    id: "rtsw", label: "", cadenceS: 60, staleAfterS: 300, lastOkAt: null, dataTs: null, error: null, stale: true,
  }));
  assert.match(error(msg(s))!, /feeds/);
});

test("a clock must run forwards", () => {
  const s = state();
  s.clock.speed = 0;
  assert.equal(checkLiveState(s).ok, false);
  assert.equal(checkLiveState({ ...state(), xray: emptyXray() }).ok, true);
});
