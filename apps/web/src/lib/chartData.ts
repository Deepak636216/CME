import type { Unix } from "@cme/shared";

/** A time window of one or more columns, as uPlot wants it: x first, null where the line must break. */
export type Aligned = [number[], ...(number | null)[][]];

/**
 * Rows of `cols` with t in [from, to], as plain arrays. A gap longer than `gapS` (a feed outage) gets a
 * null row so the line breaks instead of drawing a straight bridge across missing data. Non-finite and
 * (for log scales) non-positive values become null too.
 */
export function windowed(
  t: ArrayLike<number>,
  cols: ArrayLike<number>[],
  from: Unix,
  to: Unix,
  { gapS = 180, positive = false }: { gapS?: number; positive?: boolean } = {},
): Aligned {
  const xs: number[] = [];
  const ys: (number | null)[][] = cols.map(() => []);
  let i = lowerBound(t, from);
  let prev = -Infinity;
  for (; i < t.length && t[i] <= to; i++) {
    if (t[i] - prev > gapS && xs.length) {
      xs.push(prev + 1);
      ys.forEach((y) => y.push(null));
    }
    xs.push(t[i]);
    cols.forEach((c, k) => {
      const v = c[i];
      ys[k].push(Number.isFinite(v) && (!positive || v > 0) ? v : null);
    });
    prev = t[i];
  }
  return [xs, ...ys];
}

/** Index and value of the largest value (ignoring nulls), or null. */
export function peak(ys: (number | null)[]): { i: number; v: number } | null {
  let best: { i: number; v: number } | null = null;
  ys.forEach((v, i) => {
    if (v !== null && (!best || v > best.v)) best = { i, v };
  });
  return best;
}

/** The newest row at or before `at` (exact hover readout), skipping null rows. */
export function rowAt(data: Aligned, at: Unix): number | null {
  const xs = data[0];
  let i = Math.min(upperBound(xs, at), xs.length) - 1;
  while (i >= 0 && data[1][i] === null) i--;
  return i >= 0 ? i : null;
}

/** Rows for a table view: the newest row, then one every `stepS` going back. Newest first. */
export function tableRows(data: Aligned, stepS: number, max = 24): number[] {
  const xs = data[0];
  const out: number[] = [];
  let next = Infinity;
  for (let i = xs.length - 1; i >= 0 && out.length < max; i--) {
    if (data[1][i] === null || xs[i] > next) continue;
    out.push(i);
    next = xs[i] - stepS;
  }
  return out;
}

function lowerBound(a: ArrayLike<number>, v: number): number {
  let lo = 0, hi = a.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (a[m] < v) lo = m + 1;
    else hi = m;
  }
  return lo;
}

function upperBound(a: ArrayLike<number>, v: number): number {
  let lo = 0, hi = a.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (a[m] <= v) lo = m + 1;
    else hi = m;
  }
  return lo;
}
