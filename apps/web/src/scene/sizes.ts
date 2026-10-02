import { PLANETS, R_SUN_AU, kmToAu, type PlanetId } from "../lib/ephemeris.ts";
import { useUi } from "../store/ui.ts";

export type BodyId = PlanetId | "sun";

/** Drawn radii in AU. "readable" enlarges bodies; distances are never changed (scene-plan.md). */
export const READABLE_RADIUS: Record<BodyId, number> = {
  sun: 0.06,
  mercury: 0.01,
  venus: 0.014,
  earth: 0.016,
};

export const TRUE_RADIUS: Record<BodyId, number> = {
  sun: R_SUN_AU,
  ...(Object.fromEntries(PLANETS.map((p) => [p.id, kmToAu(p.radiusKm)])) as Record<PlanetId, number>),
};

const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * 0 = readable, 1 = true scale, eased over ~600 ms by ScaleDriver once per frame.
 * Radii are interpolated on a log scale because true and readable sizes differ by up to ~400×.
 */
export const scaleAnim = { mix: useUi.getState().scale === "true" ? 1 : 0 };

export function stepScale(dt: number): void {
  const target = useUi.getState().scale === "true" ? 1 : 0;
  if (reducedMotion()) {
    scaleAnim.mix = target;
    return;
  }
  scaleAnim.mix += (target - scaleAnim.mix) * (1 - Math.exp(-dt * 8));
  if (Math.abs(target - scaleAnim.mix) < 1e-3) scaleAnim.mix = target;
}

export function drawnRadius(id: BodyId, mix = scaleAnim.mix): number {
  const a = Math.log(READABLE_RADIUS[id]);
  const b = Math.log(TRUE_RADIUS[id]);
  return Math.exp(a + (b - a) * mix);
}
