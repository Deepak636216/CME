import { fluxFromClass } from "@cme/physics";
import type { Flare, SunspotRegion, Unix } from "@cme/shared";
import type { Vec3 } from "./ephemeris.ts";
import { flareStrength, helioToLocal, rotatedLon, spotRadius } from "./heliographic.ts";

export interface SpotMark {
  regionNo: number;
  dir: Vec3; // Sun frame
  radius: number; // angular, radians
  lat: number;
  lon: number; // rotated to the scene time
  region: SunspotRegion;
}

export interface FlareMark {
  id: string;
  dir: Vec3;
  /** 0…1 before pulsing; fades out over FLARE_AFTERGLOW_S after the flare ends. */
  strength: number;
  rising: boolean;
  flare: Flare;
}

export const FLARE_AFTERGLOW_S = 30 * 60;

/**
 * Sunspot groups at time t: longitudes rotated forward from when the server sent them, kept while they are
 * on or just past the visible disc (so they slide off the limb instead of popping), biggest first.
 */
export function spotsAt(regions: SunspotRegion[], regionsAt: Unix, t: Unix, max: number, enlarge = 1): SpotMark[] {
  return regions
    .map((r) => {
      const lon = rotatedLon(r.lon, regionsAt, t);
      return { regionNo: r.regionNo, dir: helioToLocal(r.lat, lon), radius: spotRadius(r.areaMsh) * enlarge, lat: r.lat, lon, region: r };
    })
    .filter((s) => Math.abs(s.lon) < 100)
    .sort((a, b) => b.region.areaMsh - a.region.areaMsh)
    .slice(0, max);
}

/**
 * Flares with a known position that are under way or ended less than 30 min ago, strongest first. Their
 * position turns with the Sun from when they began. Flares without a position can't be placed on the disc;
 * they still show in the X-ray chart and as overall activity (corona brightness).
 */
export function flaresAt(flares: Flare[], t: Unix, max: number): FlareMark[] {
  const out: FlareMark[] = [];
  for (const f of flares) {
    if (f.lat === null || f.lon === null || f.beginAt > t) continue;
    const since = f.endAt !== null && f.status === "ended" ? t - f.endAt : 0;
    if (since > FLARE_AFTERGLOW_S) continue;
    const flux = f.status === "ended" ? f.peakFlux : fluxFromClass(f.cls);
    const strength = flareStrength(flux) * (1 - since / FLARE_AFTERGLOW_S);
    if (strength <= 0) continue;
    out.push({ id: f.id, dir: helioToLocal(f.lat, rotatedLon(f.lon, f.beginAt, t)), strength, rising: f.status === "rising", flare: f });
  }
  return out.sort((a, b) => b.strength - a.strength).slice(0, max);
}

/** Overall solar activity 0…1 from the current long-channel X-ray flux (drives corona brightness). */
export function activityFromFlux(flux: number | null): number {
  return flux === null ? 0 : flareStrength(flux);
}
