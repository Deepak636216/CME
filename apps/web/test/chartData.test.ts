import { test } from "node:test";
import assert from "node:assert/strict";
import { peak, rowAt, tableRows, windowed } from "../src/lib/chartData.ts";

const t = [0, 60, 120, 600, 660, 720];
const v = [1, 2, 3, 4, NaN, 6];

test("windowed keeps the range, breaks the line at gaps, nulls bad values", () => {
  const [xs, ys] = windowed(t, [v], 60, 720);
  assert.deepEqual(xs, [60, 120, 121, 600, 660, 720]); // gap 120 → 600 gets a break row at 121
  assert.deepEqual(ys, [2, 3, null, 4, null, 6]);
  const [, logY] = windowed([0, 60], [[0, 1e-6]], 0, 60, { positive: true });
  assert.deepEqual(logY, [null, 1e-6], "zero can't go on a log axis");
});

test("peak and hover row ignore the break rows", () => {
  const d = windowed(t, [v], 0, 720);
  assert.deepEqual(peak(d[1]), { i: d[0].indexOf(720), v: 6 });
  assert.equal(d[0][rowAt(d, 700)!], 600, "660 is NaN, so the readout falls back to 600");
  assert.equal(rowAt(d, -5), null);
});

test("table rows: newest first, one per step, skipping nulls", () => {
  const d = windowed(t, [v], 0, 720);
  assert.deepEqual(tableRows(d, 300).map((i) => d[0][i]), [720, 120]);
});
