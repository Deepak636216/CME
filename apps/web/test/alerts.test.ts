import { test } from "node:test";
import assert from "node:assert/strict";
import type { Alert, Flare } from "@cme/shared";
import { alertList, alertTarget, isFresh, pruneAcks, shouldToast, unread } from "../src/lib/alerts.ts";

const T = 1_780_000_000;
const alert = (id: string, over: Partial<Alert> = {}): Alert => ({
  id, rule: "FLARE_M", level: "watch", title: id, message: "", refType: "flare", refId: "f1",
  raisedAt: T, clearedAt: null, ...over,
});

test("a new alert pops up once, unless it is over or already read", () => {
  const a = alert("A");
  assert.equal(shouldToast(a, new Set(), []), true);
  assert.equal(shouldToast(a, new Set(["A"]), []), false, "read");
  assert.equal(shouldToast(a, new Set(), [a]), false, "already on screen");
  assert.equal(shouldToast(alert("B", { clearedAt: T + 60 }), new Set(), []), false, "already over");
});

test("unread counts only active alerts not yet read", () => {
  const list = [alert("A"), alert("B"), alert("C", { clearedAt: T + 1 })];
  assert.deepEqual(unread(list, new Set(["B"])).map((a) => a.id), ["A"]);
});

test("sound and notifications only for alerts raised in the last 30 min", () => {
  assert.equal(isFresh(alert("A"), T + 29 * 60), true);
  assert.equal(isFresh(alert("A"), T + 31 * 60), false);
});

test("bell list: active warnings, then active watches, then recently cleared; old cleared ones drop off", () => {
  const list = alertList(
    [
      alert("watch-old"),
      alert("cleared", { clearedAt: T + 100, raisedAt: T + 50 }),
      alert("warning", { level: "warning", raisedAt: T - 500 }),
      alert("watch-new", { raisedAt: T + 10 }),
      alert("ancient", { clearedAt: T - 90_000, raisedAt: T - 95_000 }),
    ],
    T + 200,
  );
  assert.deepEqual(list.map((a) => a.id), ["warning", "watch-new", "watch-old", "cleared"]);
});

test("Show me: flares open their region (or the Sun), CMEs the CME, Bz the L1 card, feeds the status page", () => {
  const flares = [{ id: "f1", regionNo: 4366 }, { id: "f2", regionNo: null }] as Flare[];
  assert.deepEqual(alertTarget(alert("A"), flares), { select: { kind: "region", regionNo: 4366 } });
  assert.deepEqual(alertTarget(alert("A", { refId: "f2" }), flares), { select: { kind: "sun" } });
  assert.deepEqual(alertTarget(alert("A", { refType: "cme", refId: "c9" }), flares), { select: { kind: "cme", id: "c9" } });
  assert.deepEqual(alertTarget(alert("A", { refType: "wind" }), flares), { select: { kind: "l1" } });
  assert.deepEqual(alertTarget(alert("A", { refType: "feed" }), flares), { path: "/status" });
  assert.equal(alertTarget(alert("A", { rule: "TEST", refType: "test" }), flares), null);
});

test("the read list keeps ids of current alerts and only the newest others", () => {
  const acks = ["old1", "old2", "old3", "A"];
  assert.deepEqual(pruneAcks(acks, [alert("A")], 3), ["old2", "old3", "A"]);
  assert.deepEqual(pruneAcks(acks, [alert("A")], 1), ["A"]);
});
