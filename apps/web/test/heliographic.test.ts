import { test } from "node:test";
import assert from "node:assert/strict";
import { facesEarth, flareStrength, helioToLocal, rotatedLon, spotRadius } from "../src/lib/heliographic.ts";

const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

test("disc centre faces Earth (+Z); west is +X, north is +Y", () => {
  assert.deepEqual(helioToLocal(0, 0).map((v) => Math.round(v * 1e9) / 1e9), [0, 0, 1]);
  near(helioToLocal(0, 90)[0], 1, 1e-12, "W90 on the west limb");
  near(helioToLocal(90, 0)[1], 1, 1e-12, "north pole");
  const p = helioToLocal(14, -8); // N14E08: a little north and east (left) of centre
  assert.ok(p[0] < 0 && p[1] > 0 && p[2] > 0.9);
  near(Math.hypot(...p), 1, 1e-12, "on the unit sphere");
});

test("the Sun turns ~13.2° a day toward the west limb", () => {
  near(rotatedLon(-46, 0, 86_400), -32.8, 0.05, "E46 a day later");
  near(rotatedLon(170, 0, 86_400), -176.8, 0.05, "wraps past 180");
  assert.ok(facesEarth(83) && !facesEarth(95));
});

test("spot size from area: 820 MSH is about 2.3° across in radius", () => {
  near((spotRadius(820) * 180) / Math.PI, 2.32, 0.01, "big-storm region 9001");
  assert.equal(spotRadius(-5), 0);
});

test("flare strength grows with class on a log scale", () => {
  near(flareStrength(1e-6), 0.25, 1e-9, "C1");
  near(flareStrength(1e-5), 0.5, 1e-9, "M1");
  near(flareStrength(2.4e-4), 0.845, 0.001, "X2.4");
  assert.equal(flareStrength(1e-2), 1);
  assert.equal(flareStrength(0), 0);
});
