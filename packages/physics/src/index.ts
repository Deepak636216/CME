/**
 * Physics shared by backend and frontend. Formulas: docs/research-notes.md.
 * Units: km, s, km/s, nT, degrees.
 */

export const R_SUN_KM = 695_700;
export const AU_KM = 149_597_870.7;
export const DONKI_R0_KM = 21.5 * R_SUN_KM; // DONKI CME times are given at 21.5 Rs
export const DEFAULT_GAMMA = 0.2e-7; // km^-1
export const SYNODIC_DEG_PER_DAY = 13.2; // apparent solar rotation seen from Earth (~27.3 d)

// ---- Drag-Based Model ------------------------------------------------------

export interface DbmInput {
  v0: number; // CME speed at r0, km/s
  w: number; // ambient solar wind speed, km/s
  gamma?: number; // km^-1
  r0?: number; // km
}

/** Speed (km/s) and distance (km) after t seconds. Closed form, works for v0 > w and v0 < w. */
export function dbmAt(t: number, { v0, w, gamma = DEFAULT_GAMMA, r0 = DONKI_R0_KM }: DbmInput) {
  const dv = v0 - w;
  if (dv === 0 || t <= 0) return { v: t <= 0 ? v0 : w, r: r0 + Math.max(t, 0) * v0 };
  const s = Math.sign(dv);
  const k = 1 + s * gamma * dv * t;
  return { v: dv / k + w, r: (s / gamma) * Math.log(k) + w * t + r0 };
}

/** Seconds from r0 until the front reaches `target` km (default 1 AU). Bisection: r(t) is monotonic. */
export function dbmTransitTime(input: DbmInput, target = AU_KM): number | null {
  const r0 = input.r0 ?? DONKI_R0_KM;
  if (target <= r0) return 0;
  let hi = 3600;
  while (dbmAt(hi, input).r < target) {
    hi *= 2;
    if (hi > 30 * 86400) return null; // slower than 30 days: treat as no arrival
  }
  let lo = 0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (dbmAt(mid, input).r < target) lo = mid;
    else hi = mid;
  }
  return hi;
}

export function dbmForecast(input: DbmInput & { launchAt: number }) {
  const transit = dbmTransitTime(input);
  if (transit === null) return { eta: null, arrivalSpeed: null };
  return { eta: Math.round(input.launchAt + transit), arrivalSpeed: dbmAt(transit, input).v };
}

// ---- Newell coupling -------------------------------------------------------

/** dPhi/dt = v^(4/3) * B_T^(2/3) * sin^(8/3)(theta/2), B_T = sqrt(By^2+Bz^2), theta = atan2(By, Bz). */
export function newell(v: number, by: number, bz: number): number {
  if (![v, by, bz].every(Number.isFinite)) return NaN;
  const bt = Math.hypot(by, bz);
  const theta = Math.atan2(by, bz);
  return Math.pow(v, 4 / 3) * Math.pow(bt, 2 / 3) * Math.pow(Math.abs(Math.sin(theta / 2)), 8 / 3);
}

// ---- Flare classes ---------------------------------------------------------

const CLASSES: [string, number][] = [["X", 1e-4], ["M", 1e-5], ["C", 1e-6], ["B", 1e-7], ["A", 1e-8]];

export function classFromFlux(flux: number): string {
  if (!(flux > 0)) return "A0.0";
  for (const [letter, base] of CLASSES) {
    if (flux >= base) return letter + (flux / base).toFixed(1);
  }
  return "A" + (flux / 1e-8).toFixed(1);
}

export function fluxFromClass(cls: string): number {
  const m = /^([ABCMX])(\d+(?:\.\d+)?)$/.exec(cls.trim().toUpperCase());
  if (!m) throw new Error(`bad flare class: ${cls}`);
  const base = CLASSES.find(([l]) => l === m[1])![1];
  return base * Number(m[2]);
}

// ---- Positions on the Sun --------------------------------------------------

/** "N20E46" -> {lat: 20, lon: -46}  (west positive). Returns null for odd values like "S13W0*". */
export function parseLocation(loc: string): { lat: number; lon: number } | null {
  const m = /^([NS])(\d{1,2})([EW])(\d{1,3})$/.exec(loc.trim().toUpperCase());
  if (!m) return null;
  return { lat: (m[1] === "N" ? 1 : -1) * Number(m[2]), lon: (m[3] === "W" ? 1 : -1) * Number(m[4]) };
}

export function formatLocation(lat: number, lon: number): string {
  const la = Math.round(Math.abs(lat)).toString().padStart(2, "0");
  const lo = Math.round(Math.abs(lon)).toString().padStart(2, "0");
  return `${lat >= 0 ? "N" : "S"}${la}${lon >= 0 ? "W" : "E"}${lo}`;
}

/** Great-circle angle (deg) between two heliographic points. */
export function angularSeparation(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const c =
    Math.sin(lat1 * r) * Math.sin(lat2 * r) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon1 - lon2) * r);
  return Math.acos(Math.min(1, Math.max(-1, c))) / r;
}

/** A CME is Earth-directed when Earth (0,0) lies inside its cone. */
export function isEarthDirected(lat: number, lon: number, halfAngle: number): boolean {
  return angularSeparation(lat, lon, 0, 0) <= halfAngle;
}
