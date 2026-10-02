import { test } from "node:test";
import assert from "node:assert/strict";
import { READABLE_RADIUS, TRUE_RADIUS, drawnRadius } from "../src/scene/sizes.ts";
import { useUi } from "../src/store/ui.ts";

test("drawn radius runs from readable to true size, smoothly on a log scale", () => {
  for (const id of ["sun", "mercury", "venus", "earth"] as const) {
    assert.ok(Math.abs(drawnRadius(id, 0) / READABLE_RADIUS[id] - 1) < 1e-12);
    assert.ok(Math.abs(drawnRadius(id, 1) / TRUE_RADIUS[id] - 1) < 1e-12);
    const mid = drawnRadius(id, 0.5);
    assert.ok(Math.abs(mid - Math.sqrt(READABLE_RADIUS[id] * TRUE_RADIUS[id])) < 1e-12, "geometric mean halfway");
  }
  assert.ok(Math.abs(TRUE_RADIUS.earth * 149_597_870.7 - 6371) < 1e-6, "Earth's true radius is 6371 km");
});

test("the UI store works without localStorage (private mode, Node)", () => {
  useUi.getState().setScale("true");
  assert.equal(useUi.getState().scale, "true");
  const n = useUi.getState().viewNonce;
  useUi.getState().setView("overview");
  useUi.getState().setView("overview");
  assert.equal(useUi.getState().viewNonce, n + 2, "same view twice still re-centres");
});
