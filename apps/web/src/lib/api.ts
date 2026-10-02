import { API_PREFIX, type Clock, type Unix } from "@cme/shared";

/** GET a JSON endpoint under /api/v1. Same-origin: Vite proxies it in dev, Pages/Worker routes it in prod. */
export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_PREFIX}${path}`, { signal });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`);
  return (await res.json()) as T;
}

/** Data "now" from the server clock (see packages/shared Clock). Never use Date.now() for data times. */
export function serverNow(clock: Clock, receivedAt: Unix, nowS = Date.now() / 1000): Unix {
  return clock.now + (nowS - receivedAt) * clock.speed;
}
