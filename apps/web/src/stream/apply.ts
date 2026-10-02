import { STATE_WINDOW_S, type Delta, type LiveState, type Unix } from "@cme/shared";
import type { ColumnSeries, Columns } from "../lib/series.ts";
import type { Conn, LiveData, LiveStore } from "../store/live.ts";

const DAY = 86_400;
const wallNow = () => Date.now() / 1000;

/**
 * Replace the store's content with a full state (from WS, GET /state or the local cache).
 * Series are merged when the snapshot overlaps what is already held, so 7 days built up live are
 * not thrown away by a 6-hour snapshot; otherwise (time jumped, long gap) they start over.
 */
export function applySnapshot(store: LiveStore, s: LiveState, source: Conn["source"], trustSeq = true): void {
  const cur = store.getState();
  mergeSeries(cur.xray, s.xray);
  mergeSeries(cur.wind, s.wind);
  store.setState({
    seq: trustSeq ? s.seq : null,
    // A saved state's clock is from when it was saved. Until the server speaks, assume real time
    // (true in production), so cached data shows its true age instead of looking fresh.
    ...(source === "cache"
      ? { clock: { ...s.clock, speed: 1 }, clockAt: s.clock.now }
      : { clock: s.clock, clockAt: wallNow() }),
    seriesRev: cur.seriesRev + 1,
    regions: s.regions,
    flares: s.flares,
    cmes: s.cmes,
    alerts: s.alerts,
    feeds: s.feeds,
    conn: { ...cur.conn, source },
  });
}

/** Apply one delta: series APPENDED, lists UPSERTED by id, regions REPLACED (packages/shared Delta). */
export function applyDelta(store: LiveStore, seq: number, d: Delta): void {
  const cur = store.getState();
  const next: Partial<LiveData> = { seq };
  if (d.clock) {
    next.clock = d.clock;
    next.clockAt = wallNow();
  }
  let grew = 0;
  if (d.xray) grew += cur.xray.append(d.xray);
  if (d.wind) grew += cur.wind.append(d.wind);
  if (grew) next.seriesRev = cur.seriesRev + 1;
  if (d.regions) next.regions = d.regions;
  if (d.feeds) next.feeds = upsert(cur.feeds, d.feeds);

  const now = (d.clock ?? cur.clock)?.now;
  if (d.flares) next.flares = upsert(cur.flares, d.flares);
  if (d.cmes) next.cmes = upsert(cur.cmes, d.cmes);
  if (d.alerts) next.alerts = upsert(cur.alerts, d.alerts);
  if (now !== undefined) Object.assign(next, prune({ ...cur, ...next }, now));
  store.setState(next);
}

/** Apply a sequenced `alert` message. */
export function applyAlert(store: LiveStore, seq: number, alert: LiveState["alerts"][number]): void {
  store.setState({ seq, alerts: upsert(store.getState().alerts, [alert]) });
}

/** The store as a LiveState (newest 6 h of series), for the local cache. */
export function toLiveState(s: LiveData): LiveState | null {
  if (s.seq === null || !s.clock) return null;
  const from = (n: number | null) => (n ?? 0) - STATE_WINDOW_S;
  return {
    seq: s.seq,
    clock: s.clock,
    xray: s.xray.toColumns(from(s.xray.lastT)),
    wind: s.wind.toColumns(from(s.wind.lastT)),
    regions: s.regions,
    flares: s.flares,
    cmes: s.cmes,
    alerts: s.alerts,
    feeds: s.feeds,
  };
}

function mergeSeries<K extends string>(dst: ColumnSeries<K>, src: Columns<K>): void {
  const first = src.t[0];
  const last = src.t.at(-1);
  const held = dst.lastT;
  const continuous = held !== null && first !== undefined && last !== undefined && first <= held && held <= last;
  if (!continuous) dst.clear();
  dst.append(src);
}

function upsert<T extends { id: string }>(list: T[], items: T[]): T[] {
  const out = list.slice();
  for (const it of items) {
    const i = out.findIndex((x) => x.id === it.id);
    if (i === -1) out.push(it);
    else out[i] = it;
  }
  return out;
}

/** Same windows as the server's LiveState: flares and CMEs 7 days, alerts active or last 24 h. */
function prune(s: Pick<LiveData, "flares" | "cmes" | "alerts">, now: Unix) {
  const week = now - 7 * DAY;
  return {
    flares: keep(s.flares, (f) => (f.endAt ?? Infinity) >= week),
    cmes: keep(s.cmes, (c) => c.launchAt >= week || (c.forecast?.eta ?? 0) >= week),
    alerts: keep(s.alerts, (a) => a.clearedAt === null || a.raisedAt > now - DAY),
  };
}

/** filter() that returns the same array when nothing is dropped, so selectors don't see a change. */
function keep<T>(list: T[], ok: (x: T) => boolean): T[] {
  return list.every(ok) ? list : list.filter(ok);
}
