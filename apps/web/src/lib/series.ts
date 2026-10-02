/** 7 days at 1-minute cadence. */
export const SERIES_CAPACITY = 10_080;

export type Columns<K extends string> = { t: number[] } & Record<K, number[]>;
export type ColumnViews<K extends string> = { t: Float64Array } & Record<K, Float64Array>;

/**
 * A capped, append-only columnar time series backed by Float64Array (docs/design/frontend section 2).
 *
 * Each column has room for 2 × capacity values; rows are written after the newest one and the live window
 * is moved back to the start only when the end is reached. That keeps view() contiguous and copy-free
 * (uPlot takes it as is), at the cost of one copyWithin per `capacity` appends.
 */
export class ColumnSeries<K extends string> {
  readonly keys: readonly K[];
  readonly capacity: number;
  private readonly cols: Record<"t" | K, Float64Array>;
  private start = 0;
  private len = 0;

  constructor(keys: readonly K[], capacity = SERIES_CAPACITY) {
    this.keys = keys;
    this.capacity = capacity;
    this.cols = Object.fromEntries(["t", ...keys].map((k) => [k, new Float64Array(capacity * 2)])) as Record<
      "t" | K,
      Float64Array
    >;
  }

  get length(): number {
    return this.len;
  }

  get firstT(): number | null {
    return this.len ? this.cols.t[this.start] : null;
  }

  get lastT(): number | null {
    return this.len ? this.cols.t[this.start + this.len - 1] : null;
  }

  clear(): void {
    this.start = 0;
    this.len = 0;
  }

  /**
   * Append rows from a columnar payload in time order. A row with the newest timestamp overwrites it
   * (a revised minute); older rows are ignored. Missing values (JSON null) become NaN. Returns rows written.
   */
  append(src: Columns<K>): number {
    let written = 0;
    for (let i = 0; i < src.t.length; i++) {
      const t = src.t[i];
      const last = this.lastT;
      let at: number;
      if (last !== null && t < last) continue;
      if (last !== null && t === last) {
        at = this.start + this.len - 1;
      } else {
        if (this.len === this.capacity) {
          this.start++;
          this.len--;
        }
        if (this.start + this.len === this.capacity * 2) this.compact();
        at = this.start + this.len;
        this.len++;
      }
      this.cols.t[at] = t;
      for (const k of this.keys) this.cols[k][at] = src[k][i] ?? NaN;
      written++;
    }
    return written;
  }

  /** Copy-free views of the live window. Valid until the next append. */
  view(): ColumnViews<K> {
    const end = this.start + this.len;
    return Object.fromEntries(
      (["t", ...this.keys] as ("t" | K)[]).map((k) => [k, this.cols[k].subarray(this.start, end)]),
    ) as ColumnViews<K>;
  }

  /** Plain arrays of the rows with t >= from (for JSON / the local cache). NaN becomes null via JSON. */
  toColumns(from = -Infinity): Columns<K> {
    const v = this.view();
    let i = 0;
    while (i < v.t.length && v.t[i] < from) i++;
    return Object.fromEntries(
      (["t", ...this.keys] as ("t" | K)[]).map((k) => [k, Array.from(v[k].subarray(i))]),
    ) as Columns<K>;
  }

  private compact(): void {
    for (const c of Object.values<Float64Array>(this.cols)) c.copyWithin(0, this.start, this.start + this.len);
    this.start = 0;
  }
}
