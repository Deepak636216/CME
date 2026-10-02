/**
 * Chart tokens for the dark HUD. Series hues are slots 1–2 of the dataviz reference palette (dark steps),
 * validated against the HUD surface #131824: CVD ΔE 26.8, normal ΔE 31.8, both ≥ 3:1 contrast.
 * Status hues are reserved for meaning (flare-class severity, southward Bz) and always come with a label.
 */
export const CHART = {
  surface: "#131824",
  grid: "#232a3a",
  axis: "#2f374a",
  ink: "#e6e9ef",
  inkSecondary: "#a3acbd",
  inkMuted: "#8a93a6",
  series1: "#3987e5", // blue: the series that matters (long X-rays; every wind trend)
  series2: "#d95926", // orange: the companion series (short X-rays)
  serious: "#ec835a", // status: M-class band, Bz strongly south
  critical: "#d03b3b", // status: X-class band
  font: '11px system-ui, -apple-system, "Segoe UI", sans-serif',
} as const;
