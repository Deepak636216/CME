import { PLANETS, R_SUN_AU, kmToAu, type PlanetId } from "../lib/ephemeris.ts";

/** Drawn radii in AU. "readable" enlarges bodies; distances are never changed (scene-plan.md). */
export const READABLE_RADIUS: Record<PlanetId | "sun", number> = {
  sun: 0.06,
  mercury: 0.01,
  venus: 0.014,
  earth: 0.016,
};

export const TRUE_RADIUS: Record<PlanetId | "sun", number> = {
  sun: R_SUN_AU,
  ...(Object.fromEntries(PLANETS.map((p) => [p.id, kmToAu(p.radiusKm)])) as Record<PlanetId, number>),
};
