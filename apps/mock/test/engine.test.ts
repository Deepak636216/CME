import { test } from "node:test";
import assert from "node:assert/strict";
import type { Alert, ServerMessage } from "@cme/shared";
import { Engine } from "../src/engine.ts";
import { loadFixtures } from "../src/fixtures.ts";
import { listScenarios, loadScenario } from "../src/scenario.ts";

const fixtures = loadFixtures();

/** Run a scenario in fast simulated time; collect every message. */
function play(name: string, hours: number) {
  const e = new Engine({ fixtures });
  const msgs: ServerMessage[] = [];
  e.subscribe((m) => msgs.push(m));
  e.startScenario(name);
  const t0 = e.simNow();
  for (let t = t0; t < t0 + hours * 3600; t += 60) e.tick(t);
  const alerts = msgs.filter((m): m is Extract<ServerMessage, { type: "alert" }> => m.type === "alert").map((m) => m.data);
  return { e, msgs, alerts, t0 };
}

test("backfill gives 7 days of history and a valid snapshot", () => {
  const e = new Engine({ fixtures });
  const s = e.state();
  const now = e.simNow();
  assert.ok(s.xray.t.length > 300, "6 h of X-ray points");
  assert.ok(s.wind.t.length > 300, "6 h of wind points");
  assert.ok(now - s.xray.t.at(-1)! < 200, "newest X-ray is about a minute old");
  const week = e.history("xray", now - 7 * 86400, now, "5m");
  assert.ok(week.t.length > 1500, `7 d at 5 min: ${week.t.length}`);
  assert.ok(s.feeds.every((f) => !f.stale), "no feed stale at start");
  assert.ok(JSON.stringify(s).length < 400_000, "snapshot stays small");
});

test("every scenario file loads", () => {
  for (const s of listScenarios()) assert.ok(loadScenario(s.name).events.length > 0, s.name);
});

test("big-storm: X flare, Earth-directed CME, then strong Bz at arrival", () => {
  const { e, alerts, msgs } = play("big-storm", 60);
  const rules = alerts.map((a: Alert) => a.rule);
  assert.ok(rules.includes("FLARE_M") && rules.includes("FLARE_X"), `rules: ${rules}`);
  assert.ok(rules.includes("CME_EARTH"));
  assert.ok(rules.includes("BZ_SOUTH"), "the arrival drives Bz south");

  const cme = e.events(["cme"], 0).cmes!.find((c) => c.id.startsWith("C-c1"))!;
  assert.ok(cme.earthDirected && cme.forecast?.eta, "CME has an ETA");
  const transitH = (cme.forecast!.eta! - cme.launchAt) / 3600;
  assert.ok(transitH > 15 && transitH < 48, `transit ${transitH} h`); // DBM with the default gamma
  const bz = alerts.find((a) => a.rule === "BZ_SOUTH")!;
  assert.ok(Math.abs(bz.raisedAt - cme.forecast!.eta!) < 3 * 3600, "Bz alert lines up with the ETA");

  const flare = e.events(["flare"], 0).flares!.find((f) => f.id.startsWith("F-f1"))!;
  assert.equal(flare.status, "ended");
  assert.equal(flare.cls, "X2.4");
  assert.equal(flare.regionNo, 9001);

  const seqs = msgs.filter((m) => "seq" in m).map((m) => (m as { seq: number }).seq);
  assert.deepEqual(seqs, seqs.map((_, i) => seqs[0] + i), "seq has no gaps");
});

test("side-cme: no Earth alert for a CME that misses", () => {
  const { alerts, e } = play("side-cme", 6);
  assert.ok(!alerts.some((a) => a.rule === "CME_EARTH" && a.refId.startsWith("C-c1")));
  const cme = e.events(["cme"], 0).cmes!.find((c) => c.id.startsWith("C-c1"))!;
  assert.equal(cme.earthDirected, false);
  assert.equal(cme.forecast?.eta, null);
});

test("m-flare-only: M alert only, no X alert", () => {
  const { alerts } = play("m-flare-only", 2);
  const flareAlerts = alerts.filter((a) => a.refId.startsWith("F-f1"));
  assert.deepEqual(flareAlerts.map((a) => a.rule), ["FLARE_M"]);
});

test("feed-outage: RTSW goes stale, raises an alert, then recovers", () => {
  const { e, alerts, msgs } = play("feed-outage", 2);
  assert.ok(alerts.some((a) => a.rule === "FEED_STALE" && a.refId === "rtsw"));
  const cleared = msgs.some((m) => m.type === "delta" && m.data.alerts?.some((a) => a.id === "FEED_STALE:rtsw" && a.clearedAt));
  assert.ok(cleared, "stale alert clears after recovery");
  assert.ok(e.health().feeds.every((f) => !f.stale));
});

test("resume: missed messages are replayed, too old means snapshot", () => {
  const { e } = play("busy-sun", 1);
  const s = e.seq;
  assert.deepEqual(e.messagesSince(s), []);
  assert.equal(e.messagesSince(s - 3)!.length, 3);
  assert.equal(e.messagesSince(-5), null);
  assert.equal(e.messagesSince(s + 10), null);
});

test("test alert is sent at once and clears itself after 10 minutes", () => {
  const e = new Engine({ fixtures });
  e.tick();
  const msgs: ServerMessage[] = [];
  e.subscribe((m) => msgs.push(m));
  const a = e.testAlert();
  assert.equal(msgs.length, 1, "sent without waiting for a tick");
  assert.equal(msgs[0].type, "alert");
  assert.equal(a.rule, "TEST");
  assert.ok(e.state().alerts.some((x) => x.id === a.id && x.clearedAt === null));
  e.tick(a.raisedAt + 700);
  assert.ok(e.state().alerts.find((x) => x.id === a.id)?.clearedAt, "cleared");
});
