import { test } from "node:test";
import assert from "node:assert/strict";
import type { Flare, SunspotRegion } from "@cme/shared";
import { FLARE_AFTERGLOW_S, activityFromFlux, flaresAt, spotsAt } from "../src/lib/sunActivity.ts";

const region = (regionNo: number, lat: number, lon: number, areaMsh: number): SunspotRegion => ({
  regionNo, observedOn: "", lat, lon, location: "", areaMsh, magClass: null, spotCount: 1, pM: null, pX: null,
});
const flare = (over: Partial<Flare>): Flare => ({
  id: "f", beginAt: 1000, peakAt: null, endAt: null, cls: "M1.0", peakFlux: 1e-5, status: "rising",
  regionNo: 1, lat: 10, lon: 0, ...over,
});

test("spots rotate with time, slide off the limb, and come biggest first", () => {
  const rs = [region(1, 10, 0, 100), region(2, -5, 85, 800), region(3, 0, -60, 300)];
  const now = spotsAt(rs, 0, 0, 24);
  assert.deepEqual(now.map((s) => s.regionNo), [2, 3, 1]);
  const dayLater = spotsAt(rs, 0, 86_400, 24); // +13.2°: region 2 is at W98, still just in; a day more and it's gone
  assert.ok(dayLater.find((s) => s.regionNo === 2)!.lon > 98);
  assert.equal(spotsAt(rs, 0, 2 * 86_400, 24).find((s) => s.regionNo === 2), undefined);
  assert.equal(spotsAt(rs, 0, 0, 1).length, 1, "capped");
  assert.equal(spotsAt(rs, 0, 0, 24, 2)[0].radius, spotsAt(rs, 0, 0, 24)[0].radius * 2, "enlarged for readable scale");
});

test("flares: located and recent only, fading out after they end", () => {
  const t = 5000;
  assert.equal(flaresAt([flare({ lat: null, lon: null })], t, 4).length, 0, "no position, nothing to place");
  assert.equal(flaresAt([flare({ beginAt: t + 10 })], t, 4).length, 0, "not started yet");
  const rising = flaresAt([flare({ cls: "X2.0" })], t, 4)[0];
  assert.ok(rising.rising && rising.strength > 0.75);
  const ended = (ago: number) => flaresAt([flare({ status: "ended", endAt: t - ago, peakFlux: 1e-4 })], t, 4);
  assert.ok(Math.abs(ended(FLARE_AFTERGLOW_S / 2)[0].strength - 0.375) < 1e-9, "half faded");
  assert.equal(ended(FLARE_AFTERGLOW_S + 1).length, 0, "gone after the afterglow");
});

test("activity follows the X-ray flux", () => {
  assert.equal(activityFromFlux(null), 0);
  assert.equal(activityFromFlux(1e-5), 0.5);
});
