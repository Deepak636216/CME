import { test } from "node:test";
import assert from "node:assert/strict";
import type { Flare } from "@cme/shared";
import { areaInEarths, daysToWestLimb, elongation, flareCounts, magClassMeaning } from "../src/lib/info.ts";

const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

test("region area in Earths: 820 millionths of a hemisphere ≈ 4.9 Earth surfaces", () => {
  near(areaInEarths(820), 4.89, 0.02, "820 MSH");
  near(areaInEarths(0), 0, 0, "none");
});

test("magnetic classes in plain words; days to the west limb", () => {
  assert.match(magClassMeaning("BGD")!, /most flare-prone/);
  assert.equal(magClassMeaning(null), null);
  near(daysToWestLimb(-8)!, 7.42, 0.01, "N14W08 → W90");
  assert.equal(daysToWestLimb(95), null);
});

test("elongation: a planet counter-clockwise of the Sun (seen from Earth) is east of it, in the evening sky", () => {
  const earth: [number, number, number] = [1, 0, 0];
  // Sun is at −X from Earth. Counter-clockwise about +Y from −X is toward +Z (y × … : (−1,0,0) → (0,0,+1)).
  const east = elongation([0.7, 0, 0.3], earth);
  const west = elongation([0.7, 0, -0.3], earth);
  assert.equal(east.sky, "evening");
  assert.equal(west.sky, "morning");
  near(east.deg, 45, 1e-9, "45°");
});

test("flares in the last 24 h by class", () => {
  const f = (cls: string, beginAt: number) => ({ cls, beginAt } as Flare);
  assert.deepEqual(flareCounts([f("C2.0", 100_000), f("M1.0", 90_000), f("X1.0", 1), f("B5.0", 100_000)], 100_000), { C: 1, M: 1, X: 0 });
});
