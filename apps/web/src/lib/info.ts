import { R_SUN_KM, SYNODIC_DEG_PER_DAY } from "@cme/physics";
import type { Flare, Unix } from "@cme/shared";
import type { Vec3 } from "./ephemeris.ts";

const R_EARTH_KM = 6371;

/** A sunspot group's area in Earth surface areas: area = MSH·10⁻⁶ · 2πR☉²; Earth = 4πR⊕². */
export function areaInEarths(areaMsh: number): number {
  return (areaMsh * 1e-6 * 2 * Math.PI * R_SUN_KM ** 2) / (4 * Math.PI * R_EARTH_KM ** 2);
}

/** NOAA's magnetic (Mount Wilson) class, in plain words. More complex classes flare more. */
export function magClassMeaning(cls: string | null): string | null {
  if (!cls) return null;
  const map: Record<string, string> = {
    A: "α · one magnetic polarity; quiet",
    B: "β · two opposite polarities, cleanly apart",
    G: "γ · polarities mixed together",
    BG: "βγ · two polarities with mixing; can flare",
    BD: "βδ · opposite polarities squeezed together; flare-prone",
    BGD: "βγδ · mixed and squeezed together; the most flare-prone kind",
  };
  return map[cls.toUpperCase()] ?? cls;
}

/** Days until a point at longitude `lonW` turns past the west limb (W90), or null if already past it. */
export function daysToWestLimb(lonW: number): number | null {
  return lonW >= 90 ? null : (90 - lonW) / SYNODIC_DEG_PER_DAY;
}

/**
 * How far a planet appears from the Sun in Earth's sky (degrees), and on which side: east of the Sun means
 * it follows the Sun down and is seen in the evening; west means it rises before the Sun (morning).
 * Scene coordinates; ecliptic north is +Y and longitude increases counter-clockwise seen from +Y.
 */
export function elongation(planet: Vec3, earth: Vec3): { deg: number; sky: "evening" | "morning" } {
  const s: Vec3 = [-earth[0], -earth[1], -earth[2]];
  const q: Vec3 = [planet[0] - earth[0], planet[1] - earth[1], planet[2] - earth[2]];
  const cos = (s[0] * q[0] + s[1] * q[1] + s[2] * q[2]) / (Math.hypot(...s) * Math.hypot(...q));
  const crossY = s[2] * q[0] - s[0] * q[2];
  return { deg: (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI, sky: crossY > 0 ? "evening" : "morning" };
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Flares that began in the last 24 h, counted by class letter. */
export function flareCounts(flares: Flare[], t: Unix): Record<"C" | "M" | "X", number> {
  const out = { C: 0, M: 0, X: 0 };
  for (const f of flares) {
    if (f.beginAt < t - 86_400 || f.beginAt > t) continue;
    const k = f.cls[0] as "C" | "M" | "X";
    if (k in out) out[k]++;
  }
  return out;
}
