import { test } from "node:test";
import assert from "node:assert/strict";
import {
  L1_DISTANCE_AU, earthAxes, eclipticLongitude, l1Position, orbitPath, planetPosition, positionsAt, subsolarPoint, type Vec3,
} from "../src/lib/ephemeris.ts";

const unix = (iso: string) => Date.parse(iso) / 1000;
const near = (a: number, b: number, tol: number, what: string) =>
  assert.ok(Math.abs(a - b) <= tol, `${what}: ${a.toFixed(4)} vs ${b} (±${tol})`);
// J2000 ecliptic vs the equinox of 2026: precession moves longitudes by about 0.36°
const PRECESSION_2026 = 0.36;

test("Earth is opposite the Sun's equinox point at the March equinox: on the −X axis", () => {
  const e = planetPosition("earth", unix("2026-03-20T14:45:36Z"));
  near(eclipticLongitude(e), 180 - PRECESSION_2026, 0.05, "longitude");
  assert.ok(e[0] < -0.99 && Math.abs(e[2]) < 0.01, `scene position ${e}`);
  near(Math.abs(e[1]), 0, 1e-4, "Earth stays in the ecliptic plane (y ≈ 0)");
});

test("Earth is on +Z at the June solstice (longitude 270°)", () => {
  const e = planetPosition("earth", unix("2026-06-21T08:25:00Z"));
  near(eclipticLongitude(e), 270 - PRECESSION_2026, 0.05, "longitude");
  assert.ok(e[2] > 1, `scene z ${e[2]}`);
});

test("Earth–Sun distance: perihelion in early January, aphelion in early July", () => {
  near(Math.hypot(...planetPosition("earth", unix("2026-01-03T17:00:00Z"))), 0.98330, 0.0002, "perihelion");
  near(Math.hypot(...planetPosition("earth", unix("2026-07-06T18:00:00Z"))), 1.01664, 0.0002, "aphelion");
});

test("planets orbit counter-clockwise seen from above (+Y), inner ones faster", () => {
  const t = unix("2026-10-02T00:00:00Z");
  const rate = (id: "mercury" | "venus" | "earth") => {
    const d = eclipticLongitude(planetPosition(id, t + 86_400)) - eclipticLongitude(planetPosition(id, t));
    return ((d + 540) % 360) - 180; // degrees per day, signed
  };
  const [me, ve, ea] = [rate("mercury"), rate("venus"), rate("earth")];
  near(ea, 0.9856, 0.04, "Earth deg/day");
  assert.ok(me > ve && ve > ea && ea > 0, `rates ${me} ${ve} ${ea}`);
  // counter-clockwise from +Y: the cross product of r and v points up
  const a = planetPosition("earth", t);
  const b = planetPosition("earth", t + 86_400);
  assert.ok(a[2] * b[0] - a[0] * b[2] > 0, "angular momentum along +Y");
});

test("orbit sizes match the known semi-major axes", () => {
  const t = unix("2026-10-02T00:00:00Z");
  const mean = (p: Float32Array) => {
    let s = 0;
    for (let i = 0; i < p.length; i += 3) s += Math.hypot(p[i], p[i + 1], p[i + 2]);
    return s / (p.length / 3);
  };
  near(mean(orbitPath("mercury", t)), 0.387, 0.01, "Mercury");
  near(mean(orbitPath("venus", t)), 0.723, 0.005, "Venus");
  near(mean(orbitPath("earth", t)), 1.0, 0.005, "Earth");
  const p = orbitPath("earth", t, 64);
  assert.deepEqual(Array.from(p.slice(0, 3)), Array.from(p.slice(-3)), "path is closed");
});

test("L1 is 1.5 million km sunward of Earth, on the Sun–Earth line", () => {
  const { earth, l1 } = positionsAt(unix("2026-10-02T00:00:00Z"));
  const gap: Vec3 = [earth[0] - l1[0], earth[1] - l1[1], earth[2] - l1[2]];
  near(Math.hypot(...gap), L1_DISTANCE_AU, 1e-9, "Earth–L1 distance");
  near(Math.hypot(...l1), Math.hypot(...earth) - L1_DISTANCE_AU, 1e-9, "on the line");
  near(eclipticLongitude(l1), eclipticLongitude(earth), 1e-9, "same direction");
  assert.deepEqual(l1Position([2, 0, 0]), [2 - L1_DISTANCE_AU, 0, 0]);
});

test("Earth's spin: the Sun is overhead where it should be (equinox and solstice)", () => {
  // 20 Mar 2026 12:00 UTC: just before the equinox, equation of time ≈ −7.4 min → Sun overhead ≈ 1.85° E
  const eq = subsolarPoint(unix("2026-03-20T12:00:00Z"));
  near(eq.lat, -0.04, 0.1, "equinox latitude");
  near(eq.lon, 1.85, 0.3, "equinox longitude");
  // 21 Jun 2026 08:25 UTC, the solstice: overhead on the Tropic of Cancer, ≈ 54.2° E (equation of time ≈ −1.7 min)
  const so = subsolarPoint(unix("2026-06-21T08:25:00Z"));
  near(so.lat, 23.44, 0.05, "solstice latitude");
  near(so.lon, 54.17, 0.3, "solstice longitude");
});

test("Earth's axes form a right-handed orthonormal frame, north tilted 23.44° from ecliptic north", () => {
  const { x, y, z } = earthAxes(unix("2026-10-02T00:00:00Z"));
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  for (const v of [x, y, z]) near(Math.hypot(...v), 1, 1e-9, "unit");
  near(dot(x, y), 0, 1e-9, "x⊥y");
  near(dot(y, z), 0, 1e-9, "y⊥z");
  const cross: Vec3 = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  near(dot(cross, z), 1, 1e-9, "right-handed");
  near((Math.acos(y[1]) * 180) / Math.PI, 23.44, 0.02, "obliquity");
});
