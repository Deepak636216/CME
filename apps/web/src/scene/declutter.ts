import { Vector3, type Camera } from "three";
import type { Vec3 } from "../lib/ephemeris.ts";

const a = new Vector3();
const b = new Vector3();

/** Distance in CSS pixels between two scene points as drawn by `camera` into a canvas of `size`. */
export function screenDistance(p: Vec3, q: Vec3, camera: Camera, size: { width: number; height: number }): number {
  a.set(...p).project(camera);
  b.set(...q).project(camera);
  return Math.hypot(((a.x - b.x) * size.width) / 2, ((a.y - b.y) * size.height) / 2);
}

/** Show or hide a label element without React (no re-render). */
export function showIf(el: HTMLElement | null, visible: boolean): void {
  if (!el) return;
  const v = visible ? "" : "none";
  if (el.style.display !== v) el.style.display = v;
}
