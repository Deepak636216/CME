/** Fault injection so the UI's reconnect, gap and stale handling can be tested on purpose. */
export interface ChaosConfig {
  latencyMs: number; // delay every WebSocket message
  dropEveryS: number; // close every socket this often (0 = off)
  skipEveryN: number; // silently drop every Nth sequenced message -> client sees a seq gap (0 = off)
  httpFailRate: number; // fraction of /api/v1 GETs answered with 503 (0..1)
}

export const NO_CHAOS: ChaosConfig = { latencyMs: 0, dropEveryS: 0, skipEveryN: 0, httpFailRate: 0 };

/** "latency=500,drop=60,skip=20,fail=0.1" -> ChaosConfig */
export function parseChaos(s: string | undefined): ChaosConfig {
  const c = { ...NO_CHAOS };
  if (!s) return c;
  for (const part of s.split(",")) {
    const [k, v] = part.split("=");
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error(`bad chaos value: ${part}`);
    if (k === "latency") c.latencyMs = n;
    else if (k === "drop") c.dropEveryS = n;
    else if (k === "skip") c.skipEveryN = Math.floor(n);
    else if (k === "fail") c.httpFailRate = Math.min(1, n);
    else throw new Error(`unknown chaos key: ${k} (use latency, drop, skip, fail)`);
  }
  return c;
}

export function sanitizeChaos(x: Partial<ChaosConfig>): ChaosConfig {
  const n = (v: unknown, max: number) => (typeof v === "number" && v >= 0 ? Math.min(v, max) : 0);
  return {
    latencyMs: n(x.latencyMs, 30_000),
    dropEveryS: n(x.dropEveryS, 3600),
    skipEveryN: Math.floor(n(x.skipEveryN, 10_000)),
    httpFailRate: n(x.httpFailRate, 1),
  };
}
