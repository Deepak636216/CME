import { AU_KM } from "@cme/physics";
import type { Clock, Unix } from "@cme/shared";

export const C_KM_S = 299_792.458;
/** Typical slow solar wind, used until a live speed arrives. */
export const DEFAULT_WIND_KM_S = 400;

/** Seconds for light to cross `au` astronomical units. */
export function lightSeconds(au: number): number {
  return (au * AU_KM) / C_KM_S;
}

/** Seconds for plasma at `speedKmS` to cross `km` (no acceleration: the solar wind is roughly constant past ~20 Rs). */
export function windSeconds(km: number, speedKmS: number): number {
  return km / speedKmS;
}

/** "8 min 19 s", "62 min", "4.3 days" (minutes up to 2 h) */
export function formatDuration(s: number): string {
  if (s < 7200) {
    const m = Math.floor(s / 60);
    const sec = Math.round(s - m * 60);
    return m === 0 ? `${sec} s` : s < 600 ? `${m} min ${sec} s` : `${Math.round(s / 60)} min`;
  }
  if (s < 2 * 86_400) return `${(s / 3600).toFixed(s < 36_000 ? 1 : 0)} h`;
  return `${(s / 86_400).toFixed(1)} days`;
}

/** Newest finite value in a series view, or null. */
export function latest(values: ArrayLike<number>): number | null {
  for (let i = values.length - 1; i >= 0; i--) if (Number.isFinite(values[i])) return values[i];
  return null;
}

/** "Fri 2 Oct 2026 · 13:42:07 UTC" */
export function formatClock(t: Unix): string {
  const d = new Date(t * 1000);
  const date = new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(d).replace(",", "");
  return `${date} · ${d.toISOString().slice(11, 19)} UTC`;
}

/** What the clock pill says about time itself: live, sped up, a scenario. Empty in normal live mode. */
export function clockNote(c: Clock): string {
  const parts: string[] = [];
  if (c.scenario) parts.push(`scenario ${c.scenario}`);
  else if (c.mode !== "live") parts.push("mock data");
  if (c.speed !== 1) parts.push(`×${c.speed}`);
  return parts.join(" · ");
}
