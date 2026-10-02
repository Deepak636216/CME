import { Body, HelioVector, RotateVector, Rotation_EQJ_ECL } from "astronomy-engine";
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
