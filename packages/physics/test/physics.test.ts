import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AU_KM, classFromFlux, dbmAt, dbmForecast, dbmTransitTime, fluxFromClass, isEarthDirected, newell, parseLocation,
} from "../src/index.ts";

test("DBM: fast CME slows toward the wind speed", () => {
  const p = { v0: 1500, w: 400 };
  const a = dbmAt(86400, p);
  assert.ok(a.v < 1500 && a.v > 400);
  assert.ok(dbmAt(2 * 86400, p).v < a.v);
});

test("DBM: slow CME speeds up toward the wind speed", () => {
  const a = dbmAt(86400, { v0: 300, w: 450 });
  assert.ok(a.v > 300 && a.v < 450);
});

test("DBM: transit times are realistic", () => {
  const fast = dbmTransitTime({ v0: 2000, w: 400 })! / 3600;
  const slow = dbmTransitTime({ v0: 500, w: 400 })! / 3600;
  assert.ok(fast > 20 && fast < 40, `fast ${fast} h`);
  assert.ok(slow > 70 && slow < 110, `slow ${slow} h`);
  const t = dbmTransitTime({ v0: 1000, w: 400 })!;
  assert.ok(Math.abs(dbmAt(t, { v0: 1000, w: 400 }).r - AU_KM) < 1000);
});

test("DBM forecast returns eta after launch", () => {
  const f = dbmForecast({ v0: 1200, w: 420, launchAt: 1_000_000 });
  assert.ok(f.eta! > 1_000_000 && f.arrivalSpeed! < 1200);
});

test("Newell: zero for northward Bz, large for southward", () => {
  assert.equal(newell(400, 0, 5), 0);
  assert.ok(newell(400, 0, -10) > newell(400, 0, -2));
  assert.ok(newell(700, 0, -10) > newell(400, 0, -10));
});

test("flare class round trip", () => {
  assert.equal(classFromFlux(2.5e-6), "C2.5");
  assert.equal(classFromFlux(1.2e-4), "X1.2");
  assert.equal(classFromFlux(9.96e-6), "M1.0", "rounds up into the next class, never C10.0");
  assert.equal(classFromFlux(9.94e-6), "C9.9");
  assert.equal(classFromFlux(2.84e-3), "X28.4", "X is open-ended and keeps its decimal");
  assert.equal(classFromFlux(5e-9), "A0.5", "below A1.0 stays A");
  assert.equal(fluxFromClass("M3.4"), 3.4e-5);
  assert.equal(classFromFlux(fluxFromClass("X2.1")), "X2.1");
});

test("location parsing: west positive", () => {
  assert.deepEqual(parseLocation("N20E46"), { lat: 20, lon: -46 });
  assert.deepEqual(parseLocation("S09W57"), { lat: -9, lon: 57 });
  assert.equal(parseLocation("S13W0*"), null);
});

test("earth-directed cone", () => {
  assert.ok(isEarthDirected(10, -5, 45));
  assert.ok(!isEarthDirected(14, 40, 30));
});
