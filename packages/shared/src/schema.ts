/**
 * Runtime schemas for the contract in index.ts (GAP_ANALYSIS D2).
 *
 * The interfaces in index.ts stay the readable reference; the `Same<>` checks at the bottom make `tsc` fail
 * if a schema and its interface ever disagree. Built on zod/mini so the browser only pays for what it uses.
 *
 * Who validates what:
 * - the server: every message before it is sent (tests), and every query parameter;
 * - the client: every message it receives, before it touches the store (stream/client.ts).
 */
import * as z from "zod/mini";
import type {
  Alert, Clock, Cme, CmeForecast, Delta, EventsResponse, FeedStatus, Flare, HealthResponse, HistoryResponse,
  LiveState, ServerMessage, SunspotRegion, WindSeries, XraySeries,
} from "./index.ts";

/** Upper bounds on list sizes: a cheap guard against a broken upstream flooding every browser. */
export const LIMITS = { rows: 20_160, flares: 2_000, cmes: 500, regions: 200, alerts: 500, feeds: 20 } as const;

const finite = z.number(); // zod 4 rejects NaN and ±Infinity
const unix = finite;
const sample = z.nullable(finite);
const nullableNum = z.nullable(finite);
const list = <T extends z.core.SomeType>(item: T, max: number) => z.array(item).check(z.maxLength(max));

const column = list(sample, LIMITS.rows);

/** Every column must be as long as `t`, and `t` must not go backwards. */
const seriesChecks = [
  z.refine<{ t: number[] }>((s) => Object.values(s).every((c) => (c as unknown[]).length === s.t.length), "series columns differ in length"),
  z.refine<{ t: number[] }>((s) => s.t.every((t, i) => i === 0 || t >= s.t[i - 1]), "series times go backwards"),
] as const;

export const clockSchema = z.object({
  now: unix,
  speed: finite.check(z.gt(0)),
  mode: z.enum(["live", "mock-replay", "mock-scenario"]),
  scenario: z.nullable(z.string()),
});

export const xraySchema = z
  .object({ t: list(unix, LIMITS.rows), long: column, short: column })
  .check(...seriesChecks);

export const windSchema = z
  .object({
    t: list(unix, LIMITS.rows),
    speed: column, density: column, temperature: column,
    bx: column, by: column, bz: column, bt: column, newell: column,
  })
  .check(...seriesChecks);

export const regionSchema = z.object({
  regionNo: z.int(),
  observedOn: z.string(),
  lat: finite,
  lon: finite,
  location: z.string(),
  areaMsh: finite,
  magClass: z.nullable(z.string()),
  spotCount: finite,
  pM: nullableNum,
  pX: nullableNum,
});

export const flareSchema = z.object({
  id: z.string(),
  beginAt: unix,
  peakAt: z.nullable(unix),
  endAt: z.nullable(unix),
  cls: z.string(),
  peakFlux: finite,
  status: z.enum(["rising", "decaying", "ended"]),
  regionNo: z.nullable(z.int()),
  lat: nullableNum,
  lon: nullableNum,
});

export const forecastSchema = z.object({
  computedAt: unix,
  eta: z.nullable(unix),
  arrivalSpeed: nullableNum,
  gamma: finite,
  w: finite,
});

export const cmeSchema = z.object({
  id: z.string(),
  launchAt: unix,
  speed: finite,
  lat: finite,
  lon: finite,
  halfAngle: finite,
  earthDirected: z.boolean(),
  flareId: z.nullable(z.string()),
  forecast: z.nullable(forecastSchema),
});

export const alertSchema = z.object({
  id: z.string(),
  rule: z.enum(["FLARE_M", "FLARE_X", "CME_EARTH", "BZ_SOUTH", "FEED_STALE", "TEST"]),
  level: z.enum(["watch", "warning"]),
  title: z.string(),
  message: z.string(),
  refType: z.enum(["flare", "cme", "wind", "feed", "test"]),
  refId: z.string(),
  raisedAt: unix,
  clearedAt: z.nullable(unix),
});

export const feedSchema = z.object({
  id: z.enum(["goes_xray", "goes_flares", "rtsw", "regions", "donki"]),
  label: z.string(),
  cadenceS: finite,
  staleAfterS: finite,
  lastOkAt: z.nullable(unix),
  dataTs: z.nullable(unix),
  error: z.nullable(z.string()),
  stale: z.boolean(),
});

const seq = z.int().check(z.nonnegative());

export const liveStateSchema = z.object({
  seq,
  clock: clockSchema,
  xray: xraySchema,
  wind: windSchema,
  regions: list(regionSchema, LIMITS.regions),
  flares: list(flareSchema, LIMITS.flares),
  cmes: list(cmeSchema, LIMITS.cmes),
  alerts: list(alertSchema, LIMITS.alerts),
  feeds: list(feedSchema, LIMITS.feeds),
});

export const deltaSchema = z.object({
  clock: z.optional(clockSchema),
  xray: z.optional(xraySchema),
  wind: z.optional(windSchema),
  regions: z.optional(list(regionSchema, LIMITS.regions)),
  flares: z.optional(list(flareSchema, LIMITS.flares)),
  cmes: z.optional(list(cmeSchema, LIMITS.cmes)),
  alerts: z.optional(list(alertSchema, LIMITS.alerts)),
  feeds: z.optional(list(feedSchema, LIMITS.feeds)),
});

export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("snapshot"), seq, ts: unix, data: liveStateSchema }),
  z.object({ type: z.literal("delta"), seq, ts: unix, data: deltaSchema }),
  z.object({ type: z.literal("alert"), seq, ts: unix, data: alertSchema }),
  z.object({ type: z.literal("ping"), ts: unix }),
]);

/** Message types this client understands; anything else is ignored, so the server can add new ones. */
export const KNOWN_MESSAGE_TYPES: readonly string[] = ["snapshot", "delta", "alert", "ping"];

// ---- REST ------------------------------------------------------------------

export const historyResponseSchema = z.object({
  series: z.enum(["xray", "wind"]),
  res: z.enum(["1m", "5m"]),
  from: unix,
  to: unix,
  data: z.union([windSchema, xraySchema]),
});

export const eventsResponseSchema = z.object({
  flares: z.optional(z.array(flareSchema)),
  cmes: z.optional(z.array(cmeSchema)),
  alerts: z.optional(z.array(alertSchema)),
});

export const healthResponseSchema = z.object({ clock: clockSchema, feeds: z.array(feedSchema) });

/** Query parameters of GET /history (strings in, numbers out). */
export const historyQuerySchema = z.object({
  series: z.enum(["xray", "wind"]),
  res: z.enum(["1m", "5m"]),
  from: z.optional(z.coerce.number().check(z.int())),
  to: z.optional(z.coerce.number().check(z.int())),
});

// ---- schema ⇄ interface drift check (compile time only) ---------------------

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
type Out<S extends z.core.SomeType> = z.infer<S>;

export type _SchemaMatchesContract = [
  Assert<Same<Out<typeof clockSchema>, Clock>>,
  Assert<Same<Out<typeof xraySchema>, XraySeries>>,
  Assert<Same<Out<typeof windSchema>, WindSeries>>,
  Assert<Same<Out<typeof regionSchema>, SunspotRegion>>,
  Assert<Same<Out<typeof flareSchema>, Flare>>,
  Assert<Same<Out<typeof forecastSchema>, CmeForecast>>,
  Assert<Same<Out<typeof cmeSchema>, Cme>>,
  Assert<Same<Out<typeof alertSchema>, Alert>>,
  Assert<Same<Out<typeof feedSchema>, FeedStatus>>,
  Assert<Same<Out<typeof liveStateSchema>, LiveState>>,
  Assert<Same<Out<typeof deltaSchema>, Delta>>,
  Assert<Same<Out<typeof serverMessageSchema>, ServerMessage>>,
  Assert<Same<Out<typeof historyResponseSchema>, HistoryResponse>>,
  Assert<Same<Out<typeof eventsResponseSchema>, EventsResponse>>,
  Assert<Same<Out<typeof healthResponseSchema>, HealthResponse>>,
];

// ---- helpers ---------------------------------------------------------------

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** Validate a parsed server message. Unknown `type`s come back as `{ok: false, error: "unknown"}`. */
export function checkServerMessage(x: unknown): Checked<ServerMessage> {
  const type = (x as { type?: unknown } | null)?.type;
  if (typeof type !== "string" || !KNOWN_MESSAGE_TYPES.includes(type)) return { ok: false, error: "unknown" };
  const r = serverMessageSchema.safeParse(x);
  return r.success ? { ok: true, value: r.data as ServerMessage } : { ok: false, error: summarize(r.error) };
}

export function checkLiveState(x: unknown): Checked<LiveState> {
  const r = liveStateSchema.safeParse(x);
  return r.success ? { ok: true, value: r.data as LiveState } : { ok: false, error: summarize(r.error) };
}

function summarize(e: z.core.$ZodError): string {
  const i = e.issues[0];
  return i ? `${i.path.join(".") || "(root)"}: ${i.message}` : "invalid";
}
