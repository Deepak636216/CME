import { test } from "node:test";
import assert from "node:assert/strict";
import { bzDirection, fmtBz, fmtFlux, pow10 } from "../src/lib/format.ts";

test("flux in scientific notation, carrying a rounded-up mantissa into the exponent", () => {
  assert.equal(fmtFlux(3.4e-6), "3.4×10⁻⁶");
  assert.equal(fmtFlux(9.96e-10), "1.0×10⁻⁹");
  assert.equal(fmtFlux(1e-4), "1.0×10⁻⁴");
  assert.equal(pow10(-8), "10⁻⁸");
});

test("Bz never shows −0.0, and has no direction when it rounds to zero", () => {
  assert.equal(fmtBz(-0.04), "0.0");
  assert.equal(bzDirection(-0.04), null);
  assert.equal(fmtBz(-12), "−12.0");
  assert.equal(bzDirection(-12), "south");
  assert.equal(fmtBz(4.24), "+4.2");
  assert.equal(bzDirection(0.06), "north");
});
