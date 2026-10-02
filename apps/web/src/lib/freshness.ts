import type { FeedStatus, Unix } from "@cme/shared";

export type Freshness = "fresh" | "stale" | "unknown";

/**
 * A feed is stale when the server says so, or when its newest data is older than the server's own
 * threshold measured against the current server time. The second check is what turns values amber
 * while the stream is down and no new `stale` flag can arrive (FR-7, FR-9).
 */
export function feedFreshness(feed: FeedStatus, now: Unix): Freshness {
  if (feed.dataTs === null) return "unknown";
  return feed.stale || now - feed.dataTs > feed.staleAfterS ? "stale" : "fresh";
}

/** Freshness of a single value with its own timestamp, judged by the feed it came from. */
export function valueFreshness(ts: Unix | null, feed: FeedStatus | undefined, now: Unix): Freshness {
  if (ts === null || !feed) return "unknown";
  return feed.stale || now - ts > feed.staleAfterS ? "stale" : "fresh";
}

/** 42 s · 7 min · 3 h · 2 d */
export function formatAge(s: number): string {
  if (s < 90) return `${Math.max(0, Math.round(s))} s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  if (s < 172800) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} d`;
}
