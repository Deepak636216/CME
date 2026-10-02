import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import uPlot from "uplot";
import { classFromFlux } from "@cme/physics";
import { STATE_WINDOW_S } from "@cme/shared";
import { peak, rowAt, tableRows, windowed, type Aligned } from "../../lib/chartData.ts";
import { fmtFlux, pow10 } from "../../lib/format.ts";
import { liveStore } from "../../store/live.ts";
import { DataAge } from "../DataAge.tsx";
import { CHART } from "./theme.ts";
import { SYNC_KEY, useHover } from "./hover.ts";
import { hhmm, useUplot, utc } from "./useUplot.ts";

const Y_MIN = 1e-9;
const Y_MAX = 1e-3;
const BOUNDS = [1e-8, 1e-7, 1e-6, 1e-5, 1e-4]; // A|B|C|M|X class boundaries
const CLASS_LABELS = ["A", "B", "C", "M", "X"];
function options(width: number, height: number, onCursor: (u: uPlot) => void): uPlot.Options {
  const px = uPlot.pxRatio;
  return {
    width,
    height,
    tzDate: utc,
    padding: [10, 6, 0, 0],
    legend: { show: false },
    cursor: { sync: { key: SYNC_KEY }, drag: { x: false, y: false }, y: false, points: { size: 9, width: 2, stroke: CHART.surface } },
    scales: { x: { time: true }, y: { distr: 3, log: 10, range: [Y_MIN, Y_MAX] } },
    axes: [
      {
        stroke: CHART.inkMuted, font: CHART.font, grid: { show: false }, ticks: { stroke: CHART.axis, width: 1, size: 4 }, size: 26,
        values: (_u, splits) => splits.map((v) => (v == null ? "" : hhmm(v))), // 24 h UTC, like the scene clock
      },
      {
        stroke: CHART.inkMuted, font: CHART.font, size: 46, gap: 4, space: 12,
        splits: () => BOUNDS,
        // uPlot passes null for labels it drops for space
        values: (_u, splits) => splits.map((v) => (v == null ? "" : pow10(Math.round(Math.log10(v))))),
        grid: { stroke: CHART.grid, width: 1 },
        ticks: { show: false },
      },
      {
        side: 1, scale: "y", stroke: CHART.inkSecondary, font: CHART.font, size: 20, gap: 4, space: 12,
        splits: () => BOUNDS.map((b) => b * Math.sqrt(10)), // letter in the middle of its decade (log scale)
        values: (_u, splits) => splits.map((v, i) => (v == null ? "" : CLASS_LABELS[i])),
        grid: { show: false },
        ticks: { show: false },
      },
    ],
    series: [
      {},
      { label: "Long 0.1–0.8 nm", stroke: CHART.series1, width: 2, points: { show: false } },
      { label: "Short 0.05–0.4 nm", stroke: CHART.series2, width: 2, points: { show: false } },
    ],
    hooks: {
      // Severity washes behind the lines: M band and X band, each labelled on the right axis.
      drawAxes: [
        (u) => {
          const { ctx } = u;
          const { left, width } = u.bbox;
          const y = (v: number) => u.valToPos(v, "y", true);
          ctx.save();
          ctx.globalAlpha = 0.08;
          ctx.fillStyle = CHART.serious;
          ctx.fillRect(left, y(1e-4), width, y(1e-5) - y(1e-4));
          ctx.fillStyle = CHART.critical;
          ctx.fillRect(left, y(Y_MAX), width, y(1e-4) - y(Y_MAX));
          ctx.restore();
        },
      ],
      // End dots with a surface ring, and sparse direct labels beside them, pushed apart only if they'd touch.
      draw: [
        (u) => {
          const { ctx } = u;
          const ends: { x: number; y: number; s: 1 | 2 }[] = [];
          for (const s of [1, 2] as const) {
            const ys = u.data[s];
            let i = ys.length - 1;
            while (i >= 0 && ys[i] == null) i--;
            if (i >= 0) ends.push({ x: u.valToPos(u.data[0][i], "x", true), y: u.valToPos(ys[i] as number, "y", true), s });
          }
          ctx.save();
          for (const e of ends) {
            ctx.beginPath();
            ctx.arc(e.x, e.y, 6 * px, 0, Math.PI * 2);
            ctx.fillStyle = CHART.surface;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(e.x, e.y, 4 * px, 0, Math.PI * 2);
            ctx.fillStyle = e.s === 1 ? CHART.series1 : CHART.series2;
            ctx.fill();
          }
          const labelY = ends.map((e) => e.y);
          const minGap = 13 * px;
          if (ends.length === 2 && Math.abs(labelY[0] - labelY[1]) < minGap) {
            const mid = (labelY[0] + labelY[1]) / 2;
            const up = labelY[0] <= labelY[1] ? 0 : 1;
            labelY[up] = mid - minGap / 2;
            labelY[1 - up] = mid + minGap / 2;
          }
          ctx.font = `${11 * px}px system-ui, sans-serif`;
          ctx.textAlign = "right";
          ctx.textBaseline = "middle";
          ctx.fillStyle = CHART.inkSecondary;
          ctx.strokeStyle = CHART.surface; // a halo, so the label never reads as struck through by its line
          ctx.lineWidth = 4 * px;
          ctx.lineJoin = "round";
          ends.forEach((e, k) => {
            const text = e.s === 1 ? "long" : "short";
            ctx.strokeText(text, e.x - 10 * px, labelY[k]);
            ctx.fillText(text, e.x - 10 * px, labelY[k]);
          });
          ctx.restore();
        },
      ],
      setCursor: [onCursor],
    },
  };
}

/**
 * GOES X-ray flux, last 6 h, on a log scale banded by flare class (UF4). The long channel sets the class.
 * Headline: the class right now and the 6 h peak. Crosshair is shared with the solar-wind charts.
 */
export function XrayChart({ now }: { now: number }) {
  const [table, setTable] = useState(false);
  const active = useRef(false);
  const hoverT = useHover((s) => s.t);
  const setHover = useHover((s) => s.set);
  const [overActive, setOverActive] = useState(false);

  const xRange = useMemo<[number, number]>(() => [now - STATE_WINDOW_S, now], [now]);
  const data: Aligned = useMemo(() => {
    const v = liveStore.getState().xray.view();
    return windowed(v.t, [v.long, v.short], xRange[0], xRange[1], { positive: true });
  }, [xRange]);

  const make = useMemo(
    () => (w: number, h: number) =>
      options(w, h, (u) => {
        if (!active.current) return;
        const i = u.cursor.idx;
        setHover(i == null ? null : (u.data[0][i] as number));
      }),
    [setHover],
  );
  const { box, plot } = useUplot(make, data, xRange);

  const last = rowAt(data, Infinity);
  const nowLong = last === null ? null : (data[1][last] as number);
  const top = peak(data[1]);
  const at = hoverT === null ? null : rowAt(data, hoverT);

  const step = (dir: -1 | 1) => {
    const u = plot.current;
    if (!u || !data[0].length) return;
    let i = at ?? data[0].length - 1;
    do i += dir;
    while (i >= 0 && i < data[0].length && data[1][i] == null);
    if (i < 0 || i >= data[0].length) return;
    setHover(data[0][i]);
    u.setCursor({ left: u.valToPos(data[0][i], "x"), top: u.valToPos(data[1][i] as number, "y") });
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      active.current = true;
      setOverActive(true);
      step(e.key === "ArrowLeft" ? -1 : 1);
    } else if (e.key === "Escape") setHover(null);
  };

  const tip = (() => {
    const u = plot.current;
    if (!u || at === null || !overActive || table) return null;
    const left = u.valToPos(data[0][at], "x") + u.over.offsetLeft;
    const long = data[1][at];
    const short = data[2][at];
    return (
      <div className="chart-tip" style={{ left, transform: `translateX(${left > u.over.clientWidth * 0.6 ? "calc(-100% - 12px)" : "12px"})` }}>
        <div className="chart-tip-time">{hhmm(data[0][at])} UTC</div>
        <div className="chart-tip-row">
          <span className="key" style={{ background: CHART.series1 }} />
          <strong>{long == null ? "—" : `${classFromFlux(long)} · ${fmtFlux(long)}`}</strong>
          <span>long</span>
        </div>
        <div className="chart-tip-row">
          <span className="key" style={{ background: CHART.series2 }} />
          <strong>{short == null ? "—" : fmtFlux(short)}</strong>
          <span>short</span>
        </div>
      </div>
    );
  })();

  return (
    <section className="hud-panel" aria-labelledby="xray-title">
      <header className="hud-head">
        <div className="hud-title">
          <h2 id="xray-title">Solar X-rays</h2>
          <span className="hud-sub">GOES · W/m² · last 6 h</span>
        </div>
        <div className="hud-figure">
          <span className="hud-value">{nowLong === null ? "—" : classFromFlux(nowLong)}</span>
          <span className="hud-sub">
            now · <DataAge ts={last === null ? null : data[0][last]} feed="goes_xray" />
            {top ? ` · peak ${classFromFlux(top.v)} at ${hhmm(data[0][top.i])}` : ""}
          </span>
        </div>
        <button className="hud-btn" aria-pressed={table} onClick={() => setTable(!table)}>
          {table ? "Chart" : "Table"}
        </button>
      </header>
      <div className="hud-legend" aria-hidden={table}>
        <span><span className="key" style={{ background: CHART.series1 }} />Long<span className="wide-only"> 0.1–0.8 nm</span>, sets the flare class</span>
        <span><span className="key" style={{ background: CHART.series2 }} />Short<span className="wide-only"> 0.05–0.4 nm</span></span>
      </div>
      <div className="hud-body">
        <div
          ref={box}
          className="chart-box"
          hidden={table}
          tabIndex={0}
          role="img"
          aria-label={`X-ray flux over the last 6 hours. Now ${nowLong === null ? "unknown" : classFromFlux(nowLong)}. Use the left and right arrow keys to read values, or switch to the table.`}
          onKeyDown={onKey}
          onPointerEnter={() => {
            active.current = true;
            setOverActive(true);
          }}
          onPointerLeave={() => {
            active.current = false;
            setOverActive(false);
            setHover(null);
          }}
          onBlur={() => {
            active.current = false;
            setOverActive(false);
            setHover(null);
          }}
        />
        {tip}
        {table ? <XrayTable data={data} /> : null}
      </div>
    </section>
  );
}

function XrayTable({ data }: { data: Aligned }) {
  const rows = tableRows(data, 900);
  return (
    <div className="hud-table" tabIndex={0}>
      <table>
        <caption className="sr-only">X-ray flux every 15 minutes, newest first</caption>
        <thead>
          <tr><th>UTC</th><th>Class</th><th>Long (W/m²)</th><th>Short (W/m²)</th></tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={data[0][i]}>
              <td>{hhmm(data[0][i])}</td>
              <td>{classFromFlux(data[1][i] as number)}</td>
              <td>{fmtFlux(data[1][i] as number)}</td>
              <td>{data[2][i] == null ? "—" : fmtFlux(data[2][i] as number)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
