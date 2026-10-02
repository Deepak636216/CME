import { test } from "node:test";
import assert from "node:assert/strict";
import { clockNote, formatClock, formatDuration, latest, lightSeconds, windSeconds } from "../src/lib/travel.ts";

test("sunlight takes 8 min 19 s to cross 1 AU", () => {
  assert.equal(formatDuration(lightSeconds(1)), "8 min 19 s");
  assert.equal(formatDuration(lightSeconds(1.0009)), "8 min 19 s");
  assert.equal(Math.round(lightSeconds(1)), 499);
});

test("solar wind: about 4.3 days to Earth at 400 km/s, about an hour from L1", () => {
  assert.equal(formatDuration(windSeconds(149_597_870.7, 400)), "4.3 days");
  assert.equal(formatDuration(windSeconds(1.5e6, 400)), "63 min"); // 3750 s
  assert.equal(formatDuration(windSeconds(1.5e6, 800)), "31 min");
});

test("durations read naturally across ranges", () => {
  assert.deepEqual([42, 125, 3599, 5400, 9000, 40_000, 200_000].map(formatDuration), ["42 s", "2 min 5 s", "60 min", "90 min", "2.5 h", "11 h", "2.3 days"]);
});

test("latest() skips gaps (NaN) at the end of a series", () => {
  assert.equal(latest(new Float64Array([400, 410, NaN])), 410);
  assert.equal(latest([]), null);
});

test("the clock is UTC and says when time isn't real", () => {
  assert.equal(formatClock(Date.parse("2026-10-02T13:42:07Z") / 1000), "Fri 2 Oct 2026 · 13:42:07 UTC");
  const live = { now: 0, speed: 1, mode: "live" as const, scenario: null };
  assert.equal(clockNote(live), "");
  assert.equal(clockNote({ ...live, mode: "mock-replay" }), "mock data");
  assert.equal(clockNote({ ...live, mode: "mock-scenario", scenario: "big-storm", speed: 60 }), "scenario big-storm · ×60");
});
