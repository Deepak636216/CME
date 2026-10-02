import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";
import type { Alert, Clock, Cme, FeedStatus, Flare, SunspotRegion, Unix } from "@cme/shared";
import { ColumnSeries } from "../lib/series.ts";

export const XRAY_KEYS = ["long", "short"] as const;
export const WIND_KEYS = ["speed", "density", "temperature", "bx", "by", "bz", "bt", "newell"] as const;

export type ConnStatus = "connecting" | "live" | "reconnecting" | "polling";

export interface Conn {
  status: ConnStatus;
  /** Where the data on screen last came from. */
  source: "none" | "cache" | "rest" | "ws";
  /** Consecutive WebSocket attempts that ended without ever opening. */
  failures: number;
  lastMessageAt: Unix | null; // wall clock, seconds
  gaps: number; // seq gaps detected since load
  resyncs: number; // snapshots applied after a gap or resync timeout
}

/**
 * The liveSlice from docs/design/frontend section 2. Written only by the stream (stream/apply.ts);
 * components read it through useLive(), the 3D loop through liveStore.getState().
 */
export interface LiveData {
  /** Last applied server seq. null = nothing from the server yet (cached data may still be shown). */
  seq: number | null;
  clock: Clock | null;
  /** Wall-clock seconds when `clock` was received; see serverNow(). */
  clockAt: Unix;
  /** Mutated in place; `seriesRev` changes whenever either one does. */
  xray: ColumnSeries<(typeof XRAY_KEYS)[number]>;
  wind: ColumnSeries<(typeof WIND_KEYS)[number]>;
  seriesRev: number;
  regions: SunspotRegion[];
  flares: Flare[];
  cmes: Cme[];
  alerts: Alert[];
  feeds: FeedStatus[];
  conn: Conn;
}

export type LiveStore = StoreApi<LiveData>;

export function createLiveStore(): LiveStore {
  return createStore<LiveData>()(() => ({
    seq: null,
    clock: null,
    clockAt: 0,
    xray: new ColumnSeries(XRAY_KEYS),
    wind: new ColumnSeries(WIND_KEYS),
    seriesRev: 0,
    regions: [],
    flares: [],
    cmes: [],
    alerts: [],
    feeds: [],
    conn: { status: "connecting", source: "none", failures: 0, lastMessageAt: null, gaps: 0, resyncs: 0 },
  }));
}

/** The app's one live store. */
export const liveStore = createLiveStore();

export function useLive<T>(selector: (s: LiveData) => T): T {
  return useStore(liveStore, selector);
}
