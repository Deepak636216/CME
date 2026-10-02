/**
 * The mock's simulation engine.
 *
 * Background data = the saved NOAA/NASA pulls, time-shifted so they line up with "now" and looped forever.
 * On top of that, a scenario can inject regions, flares, CMEs (with their arrival at Earth) and feed outages.
 * The engine keeps the same in-memory state the real SpaceWeatherHub will keep, and emits the same
 * snapshot / delta / alert messages (packages/shared).
 */
import type {
  Alert, Clock, ClockMode, Cme, Delta, FeedId, FeedStatus, Flare, HistoryRes, LiveState, ServerMessage,
  SunspotRegion, WindSeries, XraySeries,
} from "@cme/shared";
import { emptyWind, emptyXray, STATE_WINDOW_S } from "@cme/shared";
import {
  classFromFlux, dbmForecast, DEFAULT_GAMMA, fluxFromClass, formatLocation, isEarthDirected, newell, parseLocation,
  SYNODIC_DEG_PER_DAY,
} from "@cme/physics";
import { loopTime, type Fixtures, type RegionSeed, type WindPt, type XrayPt } from "./fixtures.ts";
import { loadScenario, type Scenario, type ScenarioEvent } from "./scenario.ts";

const HOUR = 3600;
const DAY = 86400;
export const HISTORY_S = 7 * DAY;
export const LAG_S = 60; // NOAA publishes each minute about a minute late
const REPLAY_AHEAD_S = 12 * HOUR; // start playback 12 h before the end of the saved data
const LOG_MAX = 5000; // messages kept for ?since= resume
const M_FLUX = 1e-5;
const X_FLUX = 1e-4;

interface FlareInternal extends Flare { maxSeen: number; finalCls: string }
interface RegionLive extends RegionSeed { refT: number } // lon is valid at refT
interface XrayOverlay { t0: number; tp: number; until: number; peakFlux: number; decayTau: number }
interface WindOverlay { start: number; end: number; arrivalSpeed: number; bzMin: number; peakDensity: number }
interface Outage { feed: FeedId; start: number; end: number }
interface Pending { time: number; ev: ScenarioEvent }
type Sequenced = Extract<ServerMessage, { seq: number }>;

const FEEDS: { id: FeedId; label: string; cadenceS: number; staleAfterS: number }[] = [
  { id: "goes_xray", label: "GOES X-ray flux", cadenceS: 60, staleAfterS: 300 },
  { id: "goes_flares", label: "GOES flare list", cadenceS: 60, staleAfterS: 600 },
  { id: "rtsw", label: "Solar wind at L1 (RTSW)", cadenceS: 60, staleAfterS: 300 },
  { id: "regions", label: "Sunspot regions (SWPC)", cadenceS: 1800, staleAfterS: 3 * HOUR },
  { id: "donki", label: "CMEs (NASA DONKI)", cadenceS: 300, staleAfterS: HOUR },
];

export interface EngineOptions { fixtures: Fixtures; now?: number; speed?: number }

export class Engine {
  readonly fx: Fixtures;
  speed: number;
  mode: ClockMode = "mock-replay";
  scenario: Scenario | null = null;
  seq = 0;
  notes: { at: number; text: string }[] = [];

  private wall0: number;
  private sim0: number;
  private readonly shift: number; // sim - fixture time for X-ray and wind
  private readonly cmeShift: number;
  private lastMinute: number;
  private xray: XrayPt[] = [];
  private wind: WindPt[] = [];
  private flares = new Map<string, FlareInternal>();
  private cmes = new Map<string, Cme>();
  private alerts = new Map<string, Alert>();
  private regions = new Map<number, RegionLive>();
  private regionsDirty = true;
  private lastRegionBucket = -1;
  private xrayOverlays: XrayOverlay[] = [];
  private windOverlays: WindOverlay[] = [];
  private outages: Outage[] = [];
  private pending: Pending[] = [];
  private deferred: ScenarioEvent[] = []; // waiting for a CME arrival time
  private scriptedIds = new Map<string, string>();
  private bzSouthRun = 0;
  private bzNorthRun = 0;
  private bzAlertId: string | null = null;
  private lastOk = new Map<FeedId, number>();
  private feedsKey = "";
  private clockChanged = false;
  private newAlerts: Alert[] = [];
  private log: Sequenced[] = [];
  private listeners = new Set<(m: ServerMessage) => void>();
  private quiet = true;

  constructor({ fixtures, now = Date.now() / 1000, speed = 1 }: EngineOptions) {
    this.fx = fixtures;
    this.speed = speed;
    const simStart = Math.floor(now / 60) * 60;
    this.wall0 = Date.now() / 1000;
    this.sim0 = simStart;
    this.shift = simStart - (Math.min(fixtures.xray.end, fixtures.wind.end) - REPLAY_AHEAD_S);
    this.cmeShift = simStart - DAY - (fixtures.cmeStart + fixtures.cmeSpan - DAY);
    for (const r of fixtures.regions) this.regions.set(r.regionNo, { ...r, refT: simStart });
    this.lastMinute = simStart - HISTORY_S;
    this.tick(simStart); // backfill 7 days silently
    this.quiet = false;
  }

  // ---- clock ---------------------------------------------------------------

  simNow(): number {
    return this.sim0 + (Date.now() / 1000 - this.wall0) * this.speed;
  }

  clock(): Clock {
    return { now: Math.round(this.simNow()), speed: this.speed, mode: this.mode, scenario: this.scenario?.name ?? null };
  }

  setSpeed(v: number, at = this.simNow()) {
    if (!(v > 0 && v <= 100_000)) throw new Error("speed must be in (0, 100000]");
    this.sim0 = at;
    this.wall0 = Date.now() / 1000;
    this.speed = v;
    this.clockChanged = true;
  }

  // ---- scenarios -----------------------------------------------------------

  startScenario(name: string) {
    const s = loadScenario(name);
    const t0 = this.simNow();
    this.scenario = s;
    this.mode = "mock-scenario";
    const relative = (ev: ScenarioEvent) => "arrivalOf" in ev && !!ev.arrivalOf;
    this.pending = s.events.filter((ev) => !relative(ev)).map((ev) => ({ time: t0 + ev.at * 60, ev }));
    this.deferred = s.events.filter(relative);
    this.setSpeed(s.speed, t0);
    this.tick();
  }

  stopScenario() {
    this.scenario = null;
    this.mode = "mock-replay";
    this.pending = [];
    this.deferred = [];
    this.setSpeed(1);
    this.tick();
  }

  // ---- messages ------------------------------------------------------------

  subscribe(fn: (m: ServerMessage) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Messages after `since`, or null when the client is too far behind and needs a snapshot. */
  messagesSince(since: number): Sequenced[] | null {
    if (since === this.seq) return [];
    if (since > this.seq || !this.log.length || this.log[0].seq > since + 1) return null;
    return this.log.filter((m) => m.seq > since);
  }

  private emit(m: Sequenced) {
    this.log.push(m);
    if (this.log.length > LOG_MAX) this.log.splice(0, this.log.length - LOG_MAX);
    for (const fn of this.listeners) fn(m);
  }

  // ---- main loop -----------------------------------------------------------

  /** Advance to the current sim time (or `to`) and broadcast what changed. Call about once per second. */
  tick(to?: number) {
    let target = to ?? this.simNow();
    // a speed change must land exactly on time, or slow-motion parts of a scenario get skipped
    const sp = this.pending.find((p) => p.ev.type === "speed");
    if (sp && sp.time <= target) target = sp.time;

    const d = this.advance(target);
    const ts = Math.round(target);
    if (this.quiet) {
      this.newAlerts = [];
      this.clockChanged = false;
      return;
    }
    if (Object.keys(d).length || this.clockChanged) {
      d.clock = this.clock();
      this.emit({ type: "delta", seq: ++this.seq, ts, data: d });
    }
    for (const a of this.newAlerts) this.emit({ type: "alert", seq: ++this.seq, ts, data: a });
    this.newAlerts = [];
    this.clockChanged = false;
  }

  private advance(now: number): Delta {
    const d: Delta = {};
    while (this.pending.length && this.pending[0].time <= now) this.applyEvent(this.pending.shift()!, d);

    const newest = Math.floor((now - LAG_S) / 60) * 60;
    for (let m = this.lastMinute + 60; m <= newest; m += 60) this.genMinute(m, d);
    if (newest > this.lastMinute) this.lastMinute = newest;

    this.updateFlares(now, d);
    this.updateRegions(now, d);
    this.expireAlerts(now, d);
    this.updateFeeds(now, d);
    this.trim(now);
    return d;
  }

  // ---- data generation -----------------------------------------------------

  private genMinute(m: number, d: Delta) {
    const fx = this.fx;

    const ft = loopTime(m, this.shift, fx.xray.start, fx.xray.span);
    const bx = this.inOutage("goes_xray", m) ? null : fx.xray.at(ft);
    if (bx) {
      let long = bx.long;
      let short = bx.short;
      for (const o of this.xrayOverlays) {
        const p = flareProfile(o, m);
        long += o.peakFlux * p;
        short += o.peakFlux * 0.3 * p;
      }
      const pt = { t: m, long, short };
      this.xray.push(pt);
      appendXray((d.xray ??= emptyXray()), pt);
      for (const f of this.flares.values()) if (f.status !== "ended" && f.beginAt <= m) f.maxSeen = Math.max(f.maxSeen, long);
    }
    for (const s of fx.flares) {
      if (s.beginAt < ft || s.beginAt >= ft + 60) continue;
      const off = m - ft;
      const loc = null;
      this.addFlare({
        id: `F${s.beginAt + off}`, beginAt: s.beginAt + off, peakAt: s.peakAt + off, endAt: s.endAt + off,
        peakFlux: s.peakFlux, finalCls: s.cls, regionNo: null, lat: loc, lon: loc,
      }, d);
    }

    const fw = loopTime(m, this.shift, fx.wind.start, fx.wind.span);
    const bw = this.inOutage("rtsw", m) ? null : fx.wind.at(fw);
    if (bw) {
      let w: WindPt = { ...bw, t: m };
      for (const o of this.windOverlays) if (m >= o.start && m < o.end) w = cmeArrival(w, m, o);
      this.wind.push(w);
      appendWind((d.wind ??= emptyWind()), w);
      this.checkBz(w, d);
    }

    const fc = loopTime(m, this.cmeShift, fx.cmeStart, fx.cmeSpan);
    for (const c of fx.cmes) {
      if (c.launchAt < fc || c.launchAt >= fc + 60) continue;
      const launchAt = m + (c.launchAt - fc);
      this.addCme({ ...c, id: `${c.id}@${launchAt}`, launchAt, flareId: null }, d);
    }
  }

  private applyEvent({ time, ev }: Pending, d: Delta) {
    const tag = `${this.scenario?.name ?? "s"}-${Math.round(time)}`;
    switch (ev.type) {
      case "speed":
        this.setSpeed(ev.value, time);
        break;
      case "note":
        this.notes.push({ at: Math.round(time), text: ev.text });
        break;
      case "region": {
        const loc = parseLocation(ev.location);
        if (!loc) throw new Error(`scenario region ${ev.regionNo}: bad location ${ev.location}`);
        this.regions.set(ev.regionNo, {
          regionNo: ev.regionNo, observedOn: new Date(time * 1000).toISOString().slice(0, 10), lat: loc.lat,
          lon: loc.lon, areaMsh: ev.areaMsh, magClass: ev.magClass ?? null, spotCount: ev.spotCount ?? 10,
          pM: ev.pM ?? null, pX: ev.pX ?? null, refT: time,
        });
        this.regionsDirty = true;
        break;
      }
      case "flare": {
        const r = ev.regionNo !== undefined ? this.regionAt(ev.regionNo, time) : null;
        const peakFlux = fluxFromClass(ev.peakClass);
        const tp = time + ev.riseMin * 60;
        const decayTau = (ev.decayMin * 60) / 3;
        this.xrayOverlays.push({ t0: time, tp, until: tp + 12 * decayTau, peakFlux, decayTau });
        const id = `F-${ev.id}-${tag}`;
        this.scriptedIds.set(ev.id, id);
        this.addFlare({
          id, beginAt: Math.round(time), peakAt: Math.round(tp), endAt: Math.round(tp + ev.decayMin * 60), peakFlux,
          finalCls: ev.peakClass, regionNo: ev.regionNo ?? null, lat: r?.lat ?? null, lon: r?.lon ?? null,
        }, d);
        break;
      }
      case "cme": {
        const id = `C-${ev.id}-${tag}`;
        this.scriptedIds.set(ev.id, id);
        this.addCme({
          id, launchAt: Math.round(time), speed: ev.speed, lat: ev.lat, lon: ev.lon, halfAngle: ev.halfAngle,
          flareId: ev.flareId ? this.scriptedIds.get(ev.flareId) ?? null : null,
        }, d, ev.arrival);
        this.scheduleArrivalEvents(ev.id, this.cmes.get(id)?.forecast?.eta ?? null);
        break;
      }
      case "feedOutage":
        this.outages.push({ feed: ev.feed, start: time, end: time + ev.durationMin * 60 });
        break;
    }
  }

  private scheduleArrivalEvents(cmeRef: string, eta: number | null) {
    const mine = this.deferred.filter((ev) => "arrivalOf" in ev && ev.arrivalOf === cmeRef);
    this.deferred = this.deferred.filter((ev) => !mine.includes(ev));
    if (eta === null) return;
    for (const ev of mine) {
      const offset = "offsetMin" in ev ? ev.offsetMin ?? 0 : 0;
      this.pending.push({ time: eta + offset * 60, ev });
    }
    this.pending.sort((a, b) => a.time - b.time);
  }

  private addFlare(f: Omit<FlareInternal, "status" | "cls" | "maxSeen">, d: Delta) {
    if (this.flares.has(f.id)) return;
    const background = this.xray.at(-1)?.long ?? 1e-8;
    const flare: FlareInternal = { ...f, status: "rising", cls: classFromFlux(background), maxSeen: background };
    this.flares.set(f.id, flare);
    (d.flares ??= []).push(publicFlare(flare));
  }

  private addCme(
    c: Omit<Cme, "earthDirected" | "forecast">,
    d: Delta,
    arrival?: { bzMin: number; peakDensity: number; durationHours: number },
  ) {
    if (this.cmes.has(c.id)) return;
    const w = this.wind.at(-1)?.speed ?? 400;
    const earthDirected = isEarthDirected(c.lat, c.lon, c.halfAngle);
    const f = earthDirected ? dbmForecast({ v0: c.speed, w, launchAt: c.launchAt }) : { eta: null, arrivalSpeed: null };
    const cme: Cme = {
      ...c, earthDirected,
      forecast: { computedAt: c.launchAt, eta: f.eta, arrivalSpeed: f.arrivalSpeed && Math.round(f.arrivalSpeed), gamma: DEFAULT_GAMMA, w },
    };
    this.cmes.set(c.id, cme);
    (d.cmes ??= []).push(cme);
    if (arrival && f.eta && f.arrivalSpeed) {
      this.windOverlays.push({
        start: f.eta, end: f.eta + arrival.durationHours * HOUR, arrivalSpeed: f.arrivalSpeed,
        bzMin: arrival.bzMin, peakDensity: arrival.peakDensity,
      });
    }
    if (earthDirected) {
      const hours = f.eta ? Math.round((f.eta - c.launchAt) / HOUR) : null;
      this.raise({
        id: `CME_EARTH:${c.id}`, rule: "CME_EARTH", level: "warning", title: "Earth-directed CME",
        message: `${Math.round(c.speed)} km/s CME heading toward Earth` +
          (hours !== null ? `, arrival in about ${hours} h (${Math.round(f.arrivalSpeed!)} km/s)` : ""),
        refType: "cme", refId: c.id, raisedAt: c.launchAt,
      });
    }
  }

  // ---- derived state -------------------------------------------------------

  private updateFlares(now: number, d: Delta) {
    for (const f of this.flares.values()) {
      if (f.status === "ended") continue;
      const status = now < (f.peakAt ?? 0) ? "rising" : now < (f.endAt ?? 0) ? "decaying" : "ended";
      const cls = status === "rising" ? classFromFlux(f.maxSeen) : f.finalCls;
      if (status !== f.status || cls !== f.cls) {
        f.status = status;
        f.cls = cls;
        (d.flares ??= []).push(publicFlare(f));
      }
      const where = f.regionNo ? ` in region ${f.regionNo}` : "";
      if (f.maxSeen >= M_FLUX) {
        this.raise({
          id: `FLARE_M:${f.id}`, rule: "FLARE_M", level: "watch", title: "M-class flare",
          message: `Flare reached ${classFromFlux(Math.max(f.maxSeen, M_FLUX))}${where}`, refType: "flare", refId: f.id,
          raisedAt: Math.round(now),
        });
      }
      if (f.maxSeen >= X_FLUX) {
        this.raise({
          id: `FLARE_X:${f.id}`, rule: "FLARE_X", level: "warning", title: "X-class flare",
          message: `Major flare ${classFromFlux(f.maxSeen)}${where}`, refType: "flare", refId: f.id,
          raisedAt: Math.round(now),
        });
      }
      if (f.status === "ended") {
        this.clear(`FLARE_M:${f.id}`, f.endAt ?? now, d);
        this.clear(`FLARE_X:${f.id}`, f.endAt ?? now, d);
      }
    }
  }

  private checkBz(w: WindPt, d: Delta) {
    if (w.bz <= -10) { this.bzSouthRun++; this.bzNorthRun = 0; }
    else if (w.bz > -5) { this.bzNorthRun++; this.bzSouthRun = 0; }
    else { this.bzSouthRun = 0; this.bzNorthRun = 0; }
    if (!this.bzAlertId && this.bzSouthRun >= 3) {
      this.bzAlertId = `BZ_SOUTH:${w.t}`;
      this.raise({
        id: this.bzAlertId, rule: "BZ_SOUTH", level: "warning", title: "Strong southward Bz",
        message: `Bz is ${w.bz.toFixed(1)} nT at L1 - Earth's field is being driven hard (speed ${Math.round(w.speed)} km/s)`,
        refType: "wind", refId: String(w.t), raisedAt: w.t,
      });
    } else if (this.bzAlertId && this.bzNorthRun >= 10) {
      this.clear(this.bzAlertId, w.t, d);
      this.bzAlertId = null;
    }
  }

  private regionAt(regionNo: number, t: number): SunspotRegion | null {
    const r = this.regions.get(regionNo);
    if (!r) return null;
    const lon = wrap180(r.lon + (SYNODIC_DEG_PER_DAY * (t - r.refT)) / DAY);
    const { refT: _refT, ...rest } = r;
    return { ...rest, lon, location: formatLocation(r.lat, lon) };
  }

  regionsAt(t: number): SunspotRegion[] {
    return [...this.regions.keys()]
      .map((n) => this.regionAt(n, t)!)
      .filter((r) => Math.abs(r.lon) <= 90)
      .sort((a, b) => b.areaMsh - a.areaMsh);
  }

  private updateRegions(now: number, d: Delta) {
    const bucket = Math.floor(now / 600); // rotation moves ~0.1 deg per 10 min
    if (bucket === this.lastRegionBucket && !this.regionsDirty) return;
    this.lastRegionBucket = bucket;
    this.regionsDirty = false;
    d.regions = this.regionsAt(now);
  }

  private expireAlerts(now: number, d: Delta) {
    for (const a of this.alerts.values()) {
      if (a.clearedAt !== null || a.rule !== "CME_EARTH") continue;
      const eta = this.cmes.get(a.refId)?.forecast?.eta;
      if (now > (eta ? eta + 12 * HOUR : a.raisedAt + 3 * DAY)) this.clear(a.id, now, d);
    }
  }

  private feeds(now: number): FeedStatus[] {
    const dataTs: Record<FeedId, number | null> = {
      goes_xray: this.xray.at(-1)?.t ?? null,
      goes_flares: this.xray.at(-1)?.t ?? null,
      rtsw: this.wind.at(-1)?.t ?? null,
      regions: Math.floor(now / 1800) * 1800,
      donki: Math.floor(now / 300) * 300,
    };
    return FEEDS.map(({ id, label, cadenceS, staleAfterS }) => {
      const down = this.inOutage(id, now);
      if (!down) this.lastOk.set(id, Math.round(now));
      const ts = down && (id === "regions" || id === "donki") ? (this.lastOk.get(id) ?? null) : dataTs[id];
      return {
        id, label, cadenceS, lastOkAt: this.lastOk.get(id) ?? null, dataTs: ts,
        error: down ? "HTTP 503 Service Unavailable (simulated outage)" : null,
        stale: ts === null || now - ts > staleAfterS,
      };
    });
  }

  private updateFeeds(now: number, d: Delta) {
    const feeds = this.feeds(now);
    for (const f of feeds) {
      const id = `FEED_STALE:${f.id}`;
      if (f.stale) {
        if (!this.alerts.get(id) || this.alerts.get(id)!.clearedAt !== null) {
          this.alerts.delete(id);
          this.raise({
            id, rule: "FEED_STALE", level: "watch", title: "Data delayed",
            message: `${f.label} has not updated recently${f.error ? ` (${f.error})` : ""}. Values shown may be old.`,
            refType: "feed", refId: f.id, raisedAt: Math.round(now),
          });
        }
      } else this.clear(id, now, d);
    }
    const key = JSON.stringify(feeds.map((f) => [f.dataTs, f.error, f.stale]));
    if (key !== this.feedsKey) {
      this.feedsKey = key;
      d.feeds = feeds;
    }
  }

  private raise(a: Omit<Alert, "clearedAt">) {
    if (this.alerts.has(a.id)) return;
    const alert: Alert = { ...a, clearedAt: null };
    this.alerts.set(a.id, alert);
    this.newAlerts.push(alert);
  }

  private clear(id: string, at: number, d: Delta) {
    const a = this.alerts.get(id);
    if (!a || a.clearedAt !== null) return;
    a.clearedAt = Math.round(at);
    (d.alerts ??= []).push(a);
  }

  private inOutage(feed: FeedId, t: number) {
    return this.outages.some((o) => o.feed === feed && t >= o.start && t < o.end);
  }

  private trim(now: number) {
    const cut = now - HISTORY_S;
    let i = 0;
    while (i < this.xray.length && this.xray[i].t < cut) i++;
    if (i) this.xray.splice(0, i);
    i = 0;
    while (i < this.wind.length && this.wind[i].t < cut) i++;
    if (i) this.wind.splice(0, i);
    for (const [k, f] of this.flares) if ((f.endAt ?? f.beginAt) < cut) this.flares.delete(k);
    for (const [k, c] of this.cmes) if (c.launchAt < cut && (c.forecast?.eta ?? 0) < cut) this.cmes.delete(k);
    for (const [k, a] of this.alerts) if ((a.clearedAt ?? Infinity) < cut) this.alerts.delete(k);
    this.xrayOverlays = this.xrayOverlays.filter((o) => o.until > cut);
    this.windOverlays = this.windOverlays.filter((o) => o.end > cut);
    this.outages = this.outages.filter((o) => o.end > cut);
  }

  // ---- read API ------------------------------------------------------------

  state(): LiveState {
    const now = this.simNow();
    const from = now - STATE_WINDOW_S;
    return {
      seq: this.seq,
      clock: this.clock(),
      xray: this.history("xray", from, now, "1m") as XraySeries,
      wind: this.history("wind", from, now, "1m") as WindSeries,
      regions: this.regionsAt(now),
      flares: this.events(["flare"], now - HISTORY_S).flares!,
      cmes: this.events(["cme"], now - HISTORY_S).cmes!,
      alerts: [...this.alerts.values()].filter((a) => a.clearedAt === null || a.raisedAt > now - DAY),
      feeds: this.feeds(now),
    };
  }

  history(series: "xray" | "wind", from: number, to: number, res: HistoryRes): XraySeries | WindSeries {
    if (series === "xray") {
      const out = emptyXray();
      for (const p of bucket(this.xray, from, to, res, (ps) => ({
        t: ps[0].t, long: Math.max(...ps.map((p) => p.long)), short: Math.max(...ps.map((p) => p.short)),
      }))) appendXray(out, p);
      return out;
    }
    const out = emptyWind();
    for (const p of bucket(this.wind, from, to, res, meanWind)) appendWind(out, p);
    return out;
  }

  events(types: ("flare" | "cme" | "alert")[], since: number) {
    const r: { flares?: Flare[]; cmes?: Cme[]; alerts?: Alert[] } = {};
    if (types.includes("flare")) {
      r.flares = [...this.flares.values()].filter((f) => (f.endAt ?? Infinity) >= since).map(publicFlare)
        .sort((a, b) => a.beginAt - b.beginAt);
    }
    if (types.includes("cme")) {
      r.cmes = [...this.cmes.values()].filter((c) => c.launchAt >= since || (c.forecast?.eta ?? 0) >= since)
        .sort((a, b) => a.launchAt - b.launchAt);
    }
    if (types.includes("alert")) {
      r.alerts = [...this.alerts.values()].filter((a) => (a.clearedAt ?? Infinity) >= since)
        .sort((a, b) => a.raisedAt - b.raisedAt);
    }
    return r;
  }

  cme(id: string): Cme | null {
    return this.cmes.get(id) ?? null;
  }

  health() {
    return { clock: this.clock(), feeds: this.feeds(this.simNow()) };
  }

  status() {
    return {
      clock: this.clock(), seq: this.seq, pendingEvents: this.pending.length,
      nextEvent: this.pending[0] ? { at: Math.round(this.pending[0].time), type: this.pending[0].ev.type } : null,
      notes: this.notes.slice(-10), xrayPoints: this.xray.length, windPoints: this.wind.length,
      flares: this.flares.size, cmes: this.cmes.size, activeAlerts: [...this.alerts.values()].filter((a) => !a.clearedAt).length,
    };
  }
}

// ---- helpers ---------------------------------------------------------------

function publicFlare({ maxSeen: _m, finalCls: _c, ...f }: FlareInternal): Flare {
  return { ...f };
}

/** GOES-like shape: quadratic rise, exponential decay. 0..1 */
function flareProfile(o: XrayOverlay, t: number): number {
  if (t < o.t0 || t > o.until) return 0;
  if (t < o.tp) return ((t - o.t0) / (o.tp - o.t0)) ** 2;
  return Math.exp(-(t - o.tp) / o.decayTau);
}

/** CME arrival at L1: shock (speed + density jump), then a magnetic cloud with Bz rotating south. */
function cmeArrival(b: WindPt, t: number, o: WindOverlay): WindPt {
  const f = (t - o.start) / (o.end - o.start);
  const speed = Math.max(b.speed, o.arrivalSpeed * (1 - 0.25 * f));
  const density = b.density + o.peakDensity * Math.exp(-6 * f);
  const bz = o.bzMin * Math.sqrt(Math.sin(Math.PI * f)) + 0.2 * b.bz;
  const by = 0.6 * Math.abs(o.bzMin) * Math.cos(Math.PI * f) + 0.2 * b.by;
  const bx = b.bx;
  return {
    t, speed, density, temperature: b.temperature * 2.5, bx, by, bz, bt: Math.hypot(bx, by, bz),
    newell: newell(speed, by, bz),
  };
}

function bucket<T extends { t: number }>(rows: T[], from: number, to: number, res: HistoryRes, agg: (ps: T[]) => T): T[] {
  const inRange = rows.filter((r) => r.t >= from && r.t <= to);
  if (res === "1m") return inRange;
  const out: T[] = [];
  let cur: T[] = [];
  let key = NaN;
  for (const r of inRange) {
    const k = Math.floor(r.t / 300);
    if (k !== key && cur.length) { out.push({ ...agg(cur), t: key * 300 }); cur = []; }
    key = k;
    cur.push(r);
  }
  if (cur.length) out.push({ ...agg(cur), t: key * 300 });
  return out;
}

function meanWind(ps: WindPt[]): WindPt {
  const m = (k: keyof WindPt) => ps.reduce((s, p) => s + p[k], 0) / ps.length;
  return {
    t: ps[0].t, speed: m("speed"), density: m("density"), temperature: m("temperature"), bx: m("bx"), by: m("by"),
    bz: m("bz"), bt: m("bt"), newell: m("newell"),
  };
}

function appendXray(s: XraySeries, p: XrayPt) {
  s.t.push(p.t); s.long.push(p.long); s.short.push(p.short);
}

function appendWind(s: WindSeries, p: WindPt) {
  s.t.push(p.t); s.speed.push(round(p.speed, 1)); s.density.push(round(p.density, 2));
  s.temperature.push(Math.round(p.temperature)); s.bx.push(round(p.bx, 2)); s.by.push(round(p.by, 2));
  s.bz.push(round(p.bz, 2)); s.bt.push(round(p.bt, 2)); s.newell.push(Math.round(p.newell));
}

const round = (x: number, n: number) => (Number.isFinite(x) ? Math.round(x * 10 ** n) / 10 ** n : x);
const wrap180 = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;
