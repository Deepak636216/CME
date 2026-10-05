/**
 * How old new data is when it reaches this page (GAP_ANALYSIS O1, NFR-2).
 *
 * age = server time at receipt − timestamp of the newest point in the message. Both are server-clock times,
 * so a wrong device clock doesn't matter. It covers the source's own publishing delay (NOAA posts each
 * minute about a minute late), our polling and computing, and the push. NFR-2 asks that everything after the
 * source adds ≤ 5 s; the backend reports its share in /health, this is the end-to-end figure.
 */
export const ARRIVAL_KEEP = 120; // two hours of 1-minute data

/** Append an age, keeping the newest `keep`. Returns a new array (store-friendly). */
export function recordArrival(list: readonly number[], age: number, keep = ARRIVAL_KEEP): number[] {
  const next = list.length >= keep ? list.slice(list.length - keep + 1) : list.slice();
  next.push(age);
  return next;
}

/** Nearest-rank percentile (p in 0..100); null for no data. */
export function percentile(xs: readonly number[], p: number): number | null {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}
