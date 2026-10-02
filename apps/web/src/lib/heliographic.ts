import { SYNODIC_DEG_PER_DAY } from "@cme/physics";
import type { Unix } from "@cme/shared";
import type { Vec3 } from "./ephemeris.ts";

const D2R = Math.PI / 180;

/**
 * Heliographic latitude / longitude (degrees; lon west +, 0 = the central meridian facing Earth) → unit
 * vector in the Sun group's frame: +Z toward Earth, +Y north, +X west. Seen from Earth, west is on the right
 * of the disc, the way solar images are shown. (The B0 and P tilts, up to 7° and 26°, are ignored.)
 */
export function helioToLocal(lat: number, lonW: number): Vec3 {
  const la = lat * D2R;
  const lo = lonW * D2R;
  return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
}

/** Longitude after the Sun has turned from `fromT` to `toT` (≈ 13.2°/day as seen from Earth), wrapped to ±180. */
export function rotatedLon(lonW: number, fromT: Unix, toT: Unix): number {
  const l = lonW + (SYNODIC_DEG_PER_DAY * (toT - fromT)) / 86_400;
  return ((((l + 180) % 360) + 360) % 360) - 180;
}

/**
 * Angular radius (radians) of a spot group covering `areaMsh` millionths of the solar hemisphere:
 * area = areaMsh·10⁻⁶ · 2πR² = πr² → r/R = √(2·areaMsh·10⁻⁶).
 */
export function spotRadius(areaMsh: number): number {
  return Math.sqrt(2 * Math.max(0, areaMsh) * 1e-6);
}

/** 0…1 visual strength of a flare from its flux, log scale: C1 ≈ 0.25, M1 ≈ 0.5, X1 ≈ 0.75, X10 = 1. */
export function flareStrength(flux: number): number {
  if (!(flux > 0)) return 0;
  return Math.min(1, Math.max(0, (Math.log10(flux) + 7) / 4));
}

/** Is a point on the Sun on the hemisphere facing Earth? */
export function facesEarth(lonW: number): boolean {
  return Math.abs(lonW) < 90;
}
