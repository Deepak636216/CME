import { AU_KM, DONKI_R0_KM, R_SUN_KM, dbmAt } from "@cme/physics";
import type { Cme, Unix } from "@cme/shared";
import { DEFAULT_WIND_KM_S } from "./travel.ts";
import { helioToLocal } from "./heliographic.ts";
import type { Vec3 } from "./ephemeris.ts";

/** Draw the front from just above the Sun (the flare site) until it is well past Earth. */
export const CME_START_KM = 1.5 * R_SUN_KM;
export const CME_MAX_KM = 1.6 * AU_KM;

/**
 * Direction the CME travels, in scene coordinates. Its lat/lon are heliographic relative to the Sun–Earth line
 * at launch (west +), and it then moves radially in a fixed direction: the Sun's rotation doesn't carry it.
 * Uses the same frame as the Sun group: z toward Earth, x = up × z (west, seen from Earth), y = z × x.
 */
export function cmeDirection(lat: number, lon: number, earthDirAtLaunch: Vec3): Vec3 {
  const z = normalize(earthDirAtLaunch);
  const x = normalize(cross([0, 1, 0], z));
  const y = cross(z, x);
  const [a, b, c] = helioToLocal(lat, lon);
  return [x[0] * a + y[0] * b + z[0] * c, x[1] * a + y[1] * b + z[1] * c, x[2] * a + y[2] * b + z[2] * c];
}

function dbmInput(cme: Cme) {
  return { v0: cme.speed, w: cme.forecast?.w ?? DEFAULT_WIND_KM_S, gamma: cme.forecast?.gamma };
}

/**
 * Distance of the front from the Sun's centre (km) at time t, or null when it hasn't erupted yet or is gone.
 * DONKI times refer to 21.5 Rs; before that the front is extrapolated back at its launch speed, so it
 * appears from the flare site rather than popping into existence at 21.5 Rs.
 */
export function cmeFrontKm(cme: Cme, t: Unix): number | null {
  const dt = t - cme.launchAt;
  const r = dt >= 0 ? dbmAt(dt, dbmInput(cme)).r : DONKI_R0_KM + cme.speed * dt;
  return r < CME_START_KM || r > CME_MAX_KM ? null : r;
}

/** Speed of the front (km/s) at time t: DBM after launch, the launch speed before. */
export function cmeSpeedAt(cme: Cme, t: Unix): number {
  const dt = t - cme.launchAt;
  return dt <= 0 ? cme.speed : dbmAt(dt, dbmInput(cme)).v;
}

export type CmePhase = "erupting" | "in transit" | "arriving" | "passed Earth" | "missing Earth";

/** Where the CME stands relative to Earth at time t (arrival from the server's forecast, the same DBM). */
export function cmePhase(cme: Cme, t: Unix): CmePhase {
  const r = cmeFrontKm(cme, t) ?? (t < cme.launchAt ? 0 : CME_MAX_KM);
  if (r < DONKI_R0_KM) return "erupting";
  const eta = cme.forecast?.eta ?? null;
  if (!cme.earthDirected || eta === null) return "missing Earth";
  if (t >= eta) return "passed Earth";
  return eta - t < 6 * 3600 ? "arriving" : "in transit";
}

/** CMEs worth drawing or listing at time t: front between the Sun and 1.6 AU, Earth-directed first, then newest. */
export function activeCmes(cmes: Cme[], t: Unix): Cme[] {
  return cmes
    .filter((c) => cmeFrontKm(c, t) !== null)
    .sort((a, b) => Number(b.earthDirected) - Number(a.earthDirected) || b.launchAt - a.launchAt);
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalize(v: Vec3): Vec3 {
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
}
