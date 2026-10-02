import { test } from "node:test";
import assert from "node:assert/strict";
import { AU_KM, DONKI_R0_KM, dbmForecast } from "@cme/physics";
import type { Cme } from "@cme/shared";
import { activeCmes, cmeDirection, cmeFrontKm, cmePhase, cmeSpeedAt } from "../src/lib/cme.ts";

const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
const LAUNCH = 1_800_000_000;
function cme(over: Partial<Cme> = {}): Cme {
  const base = { id: "c1", launchAt: LAUNCH, speed: 1900, lat: 12, lon: -4, halfAngle: 70, earthDirected: true, flareId: null };
  const f = dbmForecast({ v0: base.speed, w: 400, launchAt: base.launchAt });
  return { ...base, forecast: { computedAt: LAUNCH, eta: f.eta, arrivalSpeed: f.arrivalSpeed, gamma: 0.2e-7, w: 400 }, ...over };
}

test("direction: lat/lon 0,0 is straight at Earth; west is to the right seen from Earth; north is up", () => {
  const earth: [number, number, number] = [1, 0, 0];
  assert.deepEqual(cmeDirection(0, 0, earth).map((v) => +v.toFixed(12)), [1, 0, 0]);
  const west = cmeDirection(0, 90, earth); // seen from Earth (+X) looking at the Sun, up = +Y, right = −Z
  near(west[2], -1, 1e-12, "west limb");
  near(cmeDirection(90, 0, earth)[1], 1, 1e-12, "north");
});

test("the front reaches 1 AU at the forecast ETA (same DBM as the server)", () => {
  const c = cme();
  near(cmeFrontKm(c, c.forecast!.eta!)! / AU_KM, 1, 1e-4, "front at ETA");
  near(cmeFrontKm(c, LAUNCH)!, DONKI_R0_KM, 1, "21.5 Rs at the DONKI time");
  assert.ok(cmeSpeedAt(c, c.forecast!.eta!) < 1900 && cmeSpeedAt(c, c.forecast!.eta!) > 400, "drag slows a fast CME toward the wind speed");
  near(cmeSpeedAt(c, c.forecast!.eta!), c.forecast!.arrivalSpeed!, 1, "arrival speed matches the forecast");
});

test("visible from the flare site until well past Earth; phases follow the ETA", () => {
  const c = cme();
  assert.equal(cmeFrontKm(c, LAUNCH - 3 * 3600), null, "not erupted yet");
  assert.ok(cmeFrontKm(c, LAUNCH - 600)! < DONKI_R0_KM, "extrapolated back toward the Sun");
  assert.equal(cmePhase(c, LAUNCH - 600), "erupting");
  assert.equal(cmePhase(c, LAUNCH + 3600), "in transit");
  assert.equal(cmePhase(c, c.forecast!.eta! - 3600), "arriving");
  assert.equal(cmePhase(c, c.forecast!.eta! + 60), "passed Earth");
  assert.equal(cmePhase(cme({ earthDirected: false, lon: 55 }), LAUNCH + 3600), "missing Earth");
  assert.equal(cmeFrontKm(c, LAUNCH + 20 * 86_400), null, "long gone");
});

test("active CMEs: Earth-directed first, then newest", () => {
  const a = cme({ id: "a", earthDirected: false, launchAt: LAUNCH + 100 });
  const b = cme({ id: "b" });
  const old = cme({ id: "old", launchAt: LAUNCH - 30 * 86_400 });
  assert.deepEqual(activeCmes([a, old, b], LAUNCH + 3600).map((c) => c.id), ["b", "a"]);
});
