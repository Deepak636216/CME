import { test } from "node:test";
import assert from "node:assert/strict";
import { percentile, recordArrival } from "../src/lib/arrival.ts";

test("arrival list keeps only the newest values and never mutates its input", () => {
  const a = [1, 2, 3];
  const b = recordArrival(a, 4, 3);
  assert.deepEqual(b, [2, 3, 4]);
  assert.deepEqual(a, [1, 2, 3]);
  assert.deepEqual(recordArrival([], 7), [7]);
});

test("nearest-rank percentiles", () => {
  const xs = [65, 61, 70, 62, 63, 64, 66, 67, 68, 120];
  assert.equal(percentile(xs, 50), 65);
  assert.equal(percentile(xs, 95), 120, "one slow update shows up at p95");
  assert.equal(percentile([5], 95), 5);
  assert.equal(percentile([], 50), null);
});
