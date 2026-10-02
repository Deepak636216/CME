const SUP: Record<string, string> = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };

/** 10⁻⁶ */
export function pow10(e: number): string {
  return `10${String(e).replace(/./g, (c) => SUP[c] ?? c)}`;
}

/** 3.4×10⁻⁶. The mantissa is rounded first, so 9.96×10⁻¹⁰ becomes 1.0×10⁻⁹, never 10.0×10⁻¹⁰. */
export function fmtFlux(v: number): string {
  let e = Math.floor(Math.log10(v));
  let m = Number((v / 10 ** e).toFixed(1));
  if (m >= 10) {
    m /= 10;
    e += 1;
  }
  return `${m.toFixed(1)}×${pow10(e)}`;
}

/** Bz with a real minus sign, rounded to 0.1 nT: "+4.2", "−12.0", "0.0" (never "−0.0"). */
export function fmtBz(v: number): string {
  const r = Math.round(v * 10) / 10;
  if (r === 0) return "0.0";
  return (r > 0 ? "+" : "−") + Math.abs(r).toFixed(1);
}

/** Direction of Bz as shown: null when it rounds to zero. */
export function bzDirection(v: number): "north" | "south" | null {
  const r = Math.round(v * 10) / 10;
  return r === 0 ? null : r > 0 ? "north" : "south";
}
