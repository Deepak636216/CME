import { test } from "node:test";
import assert from "node:assert/strict";
import { ColumnSeries } from "../src/lib/series.ts";

const rows = (ts: number[]) => ({ t: ts, v: ts.map((t) => t * 10) });

test("appends in order, overwrites the newest timestamp, ignores older rows", () => {
  const s = new ColumnSeries(["v"], 10);
  assert.equal(s.append(rows([1, 2, 3])), 3);
  assert.equal(s.append({ t: [3, 0, 2], v: [99, 0, 0] }), 1); // 3 overwritten, 0 and 2 ignored
  assert.deepEqual(Array.from(s.view().t), [1, 2, 3]);
  assert.deepEqual(Array.from(s.view().v), [10, 20, 99]);
  assert.equal(s.firstT, 1);
  assert.equal(s.lastT, 3);
});

test("keeps only the newest `capacity` rows, across many compactions", () => {
  const s = new ColumnSeries(["v"], 4);
  for (let t = 1; t <= 23; t++) s.append(rows([t]));
  assert.equal(s.length, 4);
  assert.deepEqual(Array.from(s.view().t), [20, 21, 22, 23]);
  assert.deepEqual(Array.from(s.view().v), [200, 210, 220, 230]);
});

test("view() is copy-free and contiguous; toColumns() slices by time", () => {
  const s = new ColumnSeries(["v"], 5);
  s.append(rows([1, 2, 3, 4, 5, 6, 7]));
  const v = s.view();
  assert.ok(v.t instanceof Float64Array && v.t.length === 5);
  assert.deepEqual(s.toColumns(5), { t: [5, 6, 7], v: [50, 60, 70] });
});

test("JSON nulls become NaN; clear() empties", () => {
  const s = new ColumnSeries(["v"], 3);
  s.append({ t: [1], v: [null as unknown as number] });
  assert.ok(Number.isNaN(s.view().v[0]));
  s.clear();
  assert.equal(s.length, 0);
  assert.equal(s.lastT, null);
});
