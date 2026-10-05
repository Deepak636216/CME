/**
 * Loads the saved NOAA / NASA pulls from docs/reconnection/data and turns them into
 * dense 1-minute "tracks" that the engine can loop over forever.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { newell, parseLocation } from "@cme/physics";

export const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../docs/reconnection/data");

export const toUnix = (s: string) => Math.floor(Date.parse(/Z$/.test(s) ? s : s + "Z") / 1000);
/** A row of raw NOAA/NASA JSON. Untyped on purpose: these files are upstream data, read field by field below. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;
const load = (name: string): Raw[] => JSON.parse(readFileSync(path.join(DATA_DIR, name), "utf8"));

export interface XrayPt { t: number; long: number; short: number }
export interface WindPt {
  t: number; speed: number; density: number; temperature: number;
  bx: number; by: number; bz: number; bt: number; newell: number;
}
export interface FlareSeed { beginAt: number; peakAt: number; endAt: number; cls: string; peakFlux: number }
export interface CmeSeed { id: string; launchAt: number; speed: number; lat: number; lon: number; halfAngle: number }
export interface RegionSeed {
  regionNo: number; observedOn: string; lat: number; lon: number; areaMsh: number;
  magClass: string | null; spotCount: number; pM: number | null; pX: number | null;
}

/** Values on a 1-minute grid, forward-filled across short gaps (<= maxFillS). */
export class Track<T extends { t: number }> {
  readonly start: number;
  readonly span: number;
  private grid: (T | null)[];

  constructor(rows: T[], maxFillS = 600) {
    rows = rows.filter((r) => Number.isFinite(r.t)).sort((a, b) => a.t - b.t);
    if (!rows.length) throw new Error("empty track");
    this.start = Math.floor(rows[0].t / 60) * 60;
    const end = Math.floor(rows[rows.length - 1].t / 60) * 60;
    this.span = end - this.start + 60;
    this.grid = new Array(this.span / 60).fill(null);
    for (const r of rows) this.grid[Math.floor((r.t - this.start) / 60)] = r;
    let last: T | null = null;
    for (let i = 0; i < this.grid.length; i++) {
      const g = this.grid[i];
      if (g) last = g;
      else if (last && (i * 60 + this.start) - last.t <= maxFillS) this.grid[i] = last;
    }
  }

  get end() { return this.start + this.span; }

  /** Value at fixture time ft (must be inside [start, end)). */
  at(ft: number): T | null {
    return this.grid[Math.floor((ft - this.start) / 60)] ?? null;
  }
}

/** Map a sim time onto a looping fixture track. `shift` = sim - fixture for the first pass. */
export function loopTime(simT: number, shift: number, start: number, span: number): number {
  const x = (((simT - shift - start) % span) + span) % span;
  return start + x;
}

export interface Fixtures {
  xray: Track<XrayPt>;
  wind: Track<WindPt>;
  flares: FlareSeed[];
  cmes: CmeSeed[];
  cmeStart: number;
  cmeSpan: number;
  regions: RegionSeed[];
}

export function loadFixtures(): Fixtures {
  // GOES X-ray: two energy bands per time tag
  const byT = new Map<number, XrayPt>();
  for (const r of load("goes_xrays_3day.json")) {
    if (!(r.flux > 0)) continue;
    const t = toUnix(r.time_tag);
    const p = byT.get(t) ?? { t, long: NaN, short: NaN };
    if (r.energy === "0.1-0.8nm") p.long = r.flux;
    else p.short = r.flux;
    byT.set(t, p);
  }
  const xrayRows = [...byT.values()].filter((p) => p.long > 0).map((p) => ({ ...p, short: p.short > 0 ? p.short : p.long * 0.05 }));

  // RTSW: join active plasma + active mag rows on time tag
  const mag = new Map<number, Raw>();
  for (const r of load("rtsw_mag_1m.json")) if (r.active && r.bz_gsm !== null) mag.set(toUnix(r.time_tag), r);
  const windRows: WindPt[] = [];
  for (const r of load("rtsw_wind_1m.json")) {
    if (!r.active || !r.proton_speed) continue;
    const t = toUnix(r.time_tag);
    const m = mag.get(t);
    if (!m) continue;
    windRows.push({
      t, speed: r.proton_speed, density: r.proton_density ?? NaN, temperature: r.proton_temperature ?? NaN,
      bx: m.bx_gsm, by: m.by_gsm, bz: m.bz_gsm, bt: m.bt, newell: newell(r.proton_speed, m.by_gsm, m.bz_gsm),
    });
  }

  const flares: FlareSeed[] = load("goes_flares_7day.json")
    .filter((f: Raw) => f.max_class && f.begin_time && f.max_time)
    .map((f: Raw) => {
      const peakAt = toUnix(f.max_time);
      return {
        beginAt: toUnix(f.begin_time), peakAt,
        endAt: f.end_time ? toUnix(f.end_time) : peakAt + 1800,
        cls: f.max_class, peakFlux: f.max_xrlong,
      };
    });

  const cmes: CmeSeed[] = load("donki_cme.json")
    .filter((c: Raw) => c.speed && c.time21_5 && c.latitude !== null && c.longitude !== null)
    .map((c: Raw) => ({
      id: c.associatedCMEID ?? c.time21_5, launchAt: toUnix(c.time21_5), speed: c.speed,
      lat: c.latitude, lon: c.longitude, halfAngle: c.halfAngle ?? 30,
    }));
  const cmeTimes = cmes.map((c) => c.launchAt);
  const cmeStart = Math.min(...cmeTimes);
  const cmeSpan = Math.max(...cmeTimes) - cmeStart + 86400;

  let regions: RegionSeed[] = [];
  try {
    const all = load("solar_regions.json");
    const latest = all.reduce((m: string, r: Raw) => (r.observed_date > m ? r.observed_date : m), "");
    regions = all
      .filter((r: Raw) => r.observed_date === latest && r.area)
      .map((r: Raw) => {
        const loc = parseLocation(r.location);
        return loc && {
          regionNo: r.region, observedOn: r.observed_date, lat: loc.lat, lon: loc.lon, areaMsh: r.area,
          magClass: r.mag_class, spotCount: r.number_spots ?? 0,
          pM: r.m_flare_probability, pX: r.x_flare_probability,
        };
      })
      .filter((r): r is RegionSeed => r !== null);
  } catch {
    // regions fixture is optional
  }

  return { xray: new Track(xrayRows), wind: new Track(windRows), flares, cmes, cmeStart, cmeSpan, regions };
}
