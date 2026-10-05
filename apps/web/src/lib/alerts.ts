import type { Alert, Flare } from "@cme/shared";
import type { Selection } from "../store/ui.ts";

/** Sound and system notifications only for alerts raised this recently (server time); older ones just list. */
export const FRESH_S = 30 * 60;
/** Watch-level toasts tuck away after this long; warnings stay until dismissed. */
export const WATCH_TOAST_MS = 12_000;
export const MAX_TOASTS = 3;

export const isActive = (a: Alert) => a.clearedAt === null;
export const isFresh = (a: Alert, now: number) => now - a.raisedAt <= FRESH_S;

/** Should a newly arrived alert pop up? Not if it is already over, already read, or already on screen. */
export function shouldToast(a: Alert, acked: ReadonlySet<string>, shown: readonly Alert[]): boolean {
  return isActive(a) && !acked.has(a.id) && !shown.some((t) => t.id === a.id);
}

/** Active alerts not yet read: the bell's count. */
export function unread(alerts: readonly Alert[], acked: ReadonlySet<string>): Alert[] {
  return alerts.filter((a) => isActive(a) && !acked.has(a.id));
}

/** The bell's list: active first (warnings before watches), then cleared ones from the last 24 h; newest first in each. */
export function alertList(alerts: readonly Alert[], now: number): Alert[] {
  const rank = (a: Alert) => (isActive(a) ? (a.level === "warning" ? 0 : 1) : 2);
  return alerts
    .filter((a) => isActive(a) || now - (a.clearedAt ?? 0) <= 86400)
    .sort((a, b) => rank(a) - rank(b) || b.raisedAt - a.raisedAt);
}

/** Where "Show" takes you: the thing on the scene, or a page. */
export type AlertTarget = { select: Selection } | { path: string } | null;

export function alertTarget(a: Alert, flares: readonly Flare[]): AlertTarget {
  switch (a.refType) {
    case "cme":
      return { select: { kind: "cme", id: a.refId } };
    case "flare": {
      const r = flares.find((f) => f.id === a.refId)?.regionNo;
      return { select: r ? { kind: "region", regionNo: r } : { kind: "sun" } };
    }
    case "wind":
      return { select: { kind: "l1" } };
    case "feed":
      return { path: "/status" };
    default:
      return null;
  }
}

/** Plain-language "what this means" under each kind of alert. */
export function alertHint(a: Alert): string {
  switch (a.rule) {
    case "FLARE_X":
      return "A major flare. Radio blackouts are possible on Earth's day side for about an hour.";
    case "FLARE_M":
      return "A moderate flare. Brief radio blackouts are possible near the poles and on the day side.";
    case "CME_EARTH":
      return "A cloud of solar plasma is heading our way. When it arrives a geomagnetic storm, and aurora, are possible.";
    case "BZ_SOUTH":
      return "The solar wind's magnetic field points south, so energy pours into Earth's field: aurora are likely now.";
    case "FEED_STALE":
      return "Values from this source may be out of date until it recovers.";
    default:
      return "";
  }
}

/** Keep the ack list short: ids of alerts that are still around, plus the newest few others. */
export function pruneAcks(acked: readonly string[], alerts: readonly Alert[], keep = 200): string[] {
  const live = new Set(alerts.map((a) => a.id));
  const current = acked.filter((id) => live.has(id));
  const room = keep - current.length;
  const rest = room > 0 ? acked.filter((id) => !live.has(id)).slice(-room) : [];
  return [...rest, ...current];
}
