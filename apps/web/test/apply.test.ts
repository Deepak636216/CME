import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyWind, emptyXray, type Alert, type Flare, type LiveState } from "@cme/shared";
import { createLiveStore } from "../src/store/live.ts";
import { applyAlert, applyDelta, applySnapshot, toLiveState } from "../src/stream/apply.ts";

const NOW = 1_800_000_000;
const clock = { now: NOW, speed: 1, mode: "live" as const, scenario: null };
const xray = (ts: number[]) => ({ t: ts, long: ts.map(() => 1e-6), short: ts.map(() => 1e-7) });
const flare = (id: string, cls: string, endAt: number | null = null): Flare => ({
  id, beginAt: NOW - 600, peakAt: null, endAt, cls, peakFlux: 1e-5, status: "rising", regionNo: null, lat: null, lon: null,
});
const alert = (id: string, raisedAt: number, clearedAt: number | null = null): Alert => ({
  id, rule: "FLARE_M", level: "watch", title: id, message: "", refType: "flare", refId: "f", raisedAt, clearedAt,
});

function state(over: Partial<LiveState> = {}): LiveState {
  return {
    seq: 10, clock, xray: xray([NOW - 120, NOW - 60]), wind: emptyWind(),
    regions: [], flares: [flare("f1", "C1.0")], cmes: [], alerts: [], feeds: [], ...over,
  };
}

test("snapshot fills the store; delta appends series, upserts lists, replaces regions", () => {
  const store = createLiveStore();
  applySnapshot(store, state(), "ws");
  assert.equal(store.getState().seq, 10);
  assert.equal(store.getState().xray.length, 2);

  const region = { regionNo: 1, observedOn: "", lat: 0, lon: 0, location: "N00W00", areaMsh: 10, magClass: null, spotCount: 1, pM: null, pX: null };
  applyDelta(store, 11, {
    clock: { ...clock, now: NOW + 60 },
    xray: xray([NOW]),
    flares: [flare("f1", "M2.0"), flare("f2", "C3.0")],
    regions: [region],
  });
  const s = store.getState();
  assert.equal(s.seq, 11);
  assert.equal(s.xray.lastT, NOW);
  assert.deepEqual(s.flares.map((f) => `${f.id}:${f.cls}`), ["f1:M2.0", "f2:C3.0"]);
  assert.deepEqual(s.regions, [region]);
  assert.equal(s.clock!.now, NOW + 60);
});

test("delta prunes old flares and alerts, but keeps list identity when nothing changes", () => {
  const store = createLiveStore();
  applySnapshot(store, state({
    flares: [flare("old", "C1", NOW - 8 * 86400), flare("new", "C2")],
    alerts: [alert("stale", NOW - 2 * 86400, NOW - 2 * 86400), alert("active", NOW - 3 * 86400)],
  }), "ws");
  applyDelta(store, 11, { clock });
  assert.deepEqual(store.getState().flares.map((f) => f.id), ["new"]);
  assert.deepEqual(store.getState().alerts.map((a) => a.id), ["active"]);

  const flares = store.getState().flares;
  applyDelta(store, 12, { clock });
  assert.equal(store.getState().flares, flares, "same array when nothing was dropped");
});

test("a snapshot that overlaps keeps the longer history; a time jump starts over", () => {
  const store = createLiveStore();
  applySnapshot(store, state({ xray: xray([NOW - 300, NOW - 240, NOW - 180]) }), "ws");
  applySnapshot(store, state({ xray: xray([NOW - 180, NOW - 120]) }), "rest");
  assert.deepEqual(Array.from(store.getState().xray.view().t), [NOW - 300, NOW - 240, NOW - 180, NOW - 120]);

  applySnapshot(store, state({ xray: xray([NOW - 999_999]) }), "rest"); // e.g. mock reset
  assert.deepEqual(Array.from(store.getState().xray.view().t), [NOW - 999_999]);
  applySnapshot(store, state({ xray: emptyXray() }), "rest");
  assert.equal(store.getState().xray.length, 0);
});

test("cached snapshots are painted without trusting their seq; alerts upsert", () => {
  const store = createLiveStore();
  applySnapshot(store, state(), "cache", false);
  assert.equal(store.getState().seq, null);
  assert.equal(toLiveState(store.getState()), null, "nothing to cache until the server spoke");

  applySnapshot(store, state(), "ws");
  applyAlert(store, 11, alert("a1", NOW));
  applyAlert(store, 12, alert("a1", NOW, NOW + 60));
  assert.equal(store.getState().alerts.length, 1);
  assert.equal(store.getState().alerts[0].clearedAt, NOW + 60);
  assert.equal(toLiveState(store.getState())!.seq, 12);
});
