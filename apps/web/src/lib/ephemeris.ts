import { Body, HelioVector, MakeTime, RotateVector, Rotation_EQD_ECL, Rotation_EQJ_ECL, SiderealTime, Vector } from "astronomy-engine";
import { AU_KM, R_SUN_KM } from "@cme/physics";
import type { Unix } from "@cme/shared";

/**
 * Planet and L1 positions for the scene (docs/design/frontend/scene-plan.md).
 *
 * Frame: heliocentric J2000 ecliptic, 1 unit = 1 AU, mapped to three.js as (x, z, −y) so ecliptic north
 * is +Y (up) and orbits run counter-clockwise seen from above. Computed in the browser, no network.
 */

export type Vec3 = [number, number, number];
export type PlanetId = "mercury" | "venus" | "earth";

export interface PlanetInfo {
  id: PlanetId;
  label: string;
  radiusKm: number;
  periodDays: number;
  color: string;
}

export const PLANETS: readonly PlanetInfo[] = [
  { id: "mercury", label: "Mercury", radiusKm: 2439.7, periodDays: 87.969, color: "#a8a29e" },
  { id: "venus", label: "Venus", radiusKm: 6051.8, periodDays: 224.701, color: "#e7c98a" },
  { id: "earth", label: "Earth", radiusKm: 6371.0, periodDays: 365.256, color: "#4f8fe8" },
];

const BODY: Record<PlanetId, Body> = { mercury: Body.Mercury, venus: Body.Venus, earth: Body.Earth };

export const R_SUN_AU = R_SUN_KM / AU_KM;
/** Sun–Earth L1 is about 1.5 million km sunward of Earth. */
export const L1_DISTANCE_AU = 1.5e6 / AU_KM;

const EQJ_TO_ECL = Rotation_EQJ_ECL();

/** Ecliptic (x, y, z) → scene (x, z, −y). */
export function eclToScene(x: number, y: number, z: number): Vec3 {
  return [x, z, -y];
}

/** Heliocentric position of a planet at a unix time, in scene coordinates (AU). */
export function planetPosition(id: PlanetId, t: Unix): Vec3 {
  const ecl = RotateVector(EQJ_TO_ECL, HelioVector(BODY[id], new Date(t * 1000)));
  return eclToScene(ecl.x, ecl.y, ecl.z);
}

/** L1 sits on the Sun–Earth line, L1_DISTANCE_AU sunward of Earth. */
export function l1Position(earth: Vec3): Vec3 {
  const k = 1 - L1_DISTANCE_AU / Math.hypot(...earth);
  return [earth[0] * k, earth[1] * k, earth[2] * k];
}

export interface Positions {
  mercury: Vec3;
  venus: Vec3;
  earth: Vec3;
  l1: Vec3;
}

export function positionsAt(t: Unix): Positions {
  const earth = planetPosition("earth", t);
  return { mercury: planetPosition("mercury", t), venus: planetPosition("venus", t), earth, l1: l1Position(earth) };
}

/** One full orbit around time t, as a closed line of `samples` points (x, y, z flattened). */
export function orbitPath(id: PlanetId, t: Unix, samples = 256): Float32Array {
  const period = PLANETS.find((p) => p.id === id)!.periodDays * 86_400;
  const out = new Float32Array((samples + 1) * 3);
  for (let i = 0; i <= samples; i++) {
    const p = planetPosition(id, t - period / 2 + (period * (i % samples)) / samples);
    out.set(p, i * 3);
  }
  return out;
}

/** Ecliptic longitude in degrees [0, 360) of a scene-space point. */
export function eclipticLongitude([x, , z]: Vec3): number {
  return ((Math.atan2(-z, x) * 180) / Math.PI + 360) % 360;
}

export function kmToAu(km: number): number {
  return km / AU_KM;
}

/**
 * Earth's orientation at time t: where the axes of a three.js Earth mesh point, in scene coordinates.
 * A three.js SphereGeometry puts map longitude 0 on local +X, 90°E on local −Z and north on +Y, i.e. local
 * = (x, z, −y) of the Earth-fixed frame, the same mapping as eclToScene. So: Earth-fixed → equator of date
 * (turn by Greenwich apparent sidereal time) → J2000 ecliptic → scene. Polar motion (< 1″) is ignored.
 */
export function earthAxes(t: Unix): { x: Vec3; y: Vec3; z: Vec3 } {
  const date = new Date(t * 1000);
  const theta = (SiderealTime(date) * 15 * Math.PI) / 180;
  const time = MakeTime(date);
  const toEcl = Rotation_EQD_ECL(time);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const toScene = (x: number, y: number, z: number): Vec3 => {
    const e = RotateVector(toEcl, new Vector(x * c - y * s, x * s + y * c, z, time));
    return eclToScene(e.x, e.y, e.z);
  };
  // local X = Earth-fixed x (lon 0), local Y = z (north), local Z = −y (lon 90°W)
  return { x: toScene(1, 0, 0), y: toScene(0, 0, 1), z: toScene(0, -1, 0) };
}

/** Latitude and longitude (degrees, east +) where the Sun is overhead at time t. */
export function subsolarPoint(t: Unix): { lat: number; lon: number } {
  const earth = planetPosition("earth", t);
  const d = Math.hypot(...earth);
  const sun: Vec3 = [-earth[0] / d, -earth[1] / d, -earth[2] / d];
  const { x, y, z } = earthAxes(t);
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const fx = dot(sun, x);
  const fy = -dot(sun, z);
  const fz = dot(sun, y);
  return { lat: (Math.asin(fz) * 180) / Math.PI, lon: (Math.atan2(fy, fx) * 180) / Math.PI };
}
