import { useEffect, useRef } from "react";
import uPlot from "uplot";
import type { Aligned } from "../../lib/chartData.ts";

/**
 * Owns one uPlot instance: created once for `make`, resized with its box, and given new data whenever
 * `data` changes (the HUD rebuilds data once a second). The x range is set from `xRange` on each update.
 */
export function useUplot(make: (width: number, height: number) => uPlot.Options, data: Aligned, xRange: [number, number]) {
  const box = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const latest = useRef({ data, xRange });
  latest.current = { data, xRange };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const u = new uPlot(make(el.clientWidth, el.clientHeight), latest.current.data as uPlot.AlignedData, el);
    plot.current = u;
    u.setScale("x", { min: latest.current.xRange[0], max: latest.current.xRange[1] });
    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0 && el.clientHeight > 0) u.setSize({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      u.destroy();
      plot.current = null;
    };
    // `make` is a stable factory per chart; recreating on every render would lose the cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const u = plot.current;
    if (!u) return;
    u.batch(() => {
      u.setData(data as uPlot.AlignedData, false);
      u.setScale("x", { min: xRange[0], max: xRange[1] });
    });
  }, [data, xRange]);

  return { box, plot };
}

/** UTC clock labels for time axes and readouts. */
export const utc = (ts: number) => uPlot.tzDate(new Date(ts * 1000), "Etc/UTC");
export const hhmm = (ts: number) => new Date(ts * 1000).toISOString().slice(11, 16);
