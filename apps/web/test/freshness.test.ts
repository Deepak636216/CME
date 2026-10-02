import { test } from "node:test";
import assert from "node:assert/strict";
import type { FeedStatus } from "@cme/shared";
import { feedFreshness, formatAge, valueFreshness } from "../src/lib/freshness.ts";

const NOW = 1_800_000_000;
const feed = (over: Partial<FeedStatus> = {}): FeedStatus => ({
  id: "rtsw", label: "Solar wind", cadenceS: 60, staleAfterS: 300, lastOkAt: NOW, dataTs: NOW - 70, error: null, stale: false, ...over,
});

test("a feed is fresh within its threshold, stale past it even if the server still says ok", () => {
  assert.equal(feedFreshness(feed(), NOW), "fresh");
  assert.equal(feedFreshness(feed(), NOW + 229), "fresh"); // 299 s old
  assert.equal(feedFreshness(feed(), NOW + 231), "stale", "stream down: the client ages it on its own");
});

test("the server's stale flag wins; no data is unknown", () => {
  assert.equal(feedFreshness(feed({ stale: true }), NOW), "stale");
  assert.equal(feedFreshness(feed({ dataTs: null }), NOW), "unknown");
});

test("a single value is judged by its own timestamp and its feed", () => {
  assert.equal(valueFreshness(NOW - 60, feed(), NOW), "fresh");
  assert.equal(valueFreshness(NOW - 400, feed(), NOW), "stale");
  assert.equal(valueFreshness(NOW, undefined, NOW), "unknown");
});

test("ages read naturally", () => {
  assert.deepEqual([-3, 42, 89, 120, 5399, 7200, 172799, 200000].map(formatAge), [
    "0 s", "42 s", "89 s", "2 min", "90 min", "2 h", "48 h", "2 d",
  ]);
});
