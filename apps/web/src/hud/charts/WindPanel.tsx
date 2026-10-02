import { useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import { AU_KM } from "@cme/physics";
import { STATE_WINDOW_S } from "@cme/shared";
import { rowAt, tableRows, windowed, type Aligned } from "../../lib/chartData.ts";
import { L1_DISTANCE_AU } from "../../lib/ephemeris.ts";
import { formatDuration, windSeconds } from "../../lib/travel.ts";
import { bzDirection, fmtBz } from "../../lib/format.ts";
import { liveStore, WIND_KEYS } from "../../store/live.ts";
import { DataAge } from "../DataAge.tsx";
import { CHART } from "./theme.ts";
import { SYNC_KEY, useHover } from "./hover.ts";
import { hhmm, useUplot, utc } from "./useUplot.ts";

type WindKey = (typeof WIND_KEYS)[number];

interface Measure {
  key: WindKey;
  label: string;
  unit: string;
  hint: string;
  fmt: (v: number) => string;
  zeroLine?: boolean;
}

const compact = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v).toString());

/** FR-5: speed, density, Bz and Newell coupling at L1. Four units → four small charts, one axis each. */
const MEASURES: Measure[] = [
  { key: "speed", label: "Speed", unit: "km/s", hint: "How fast the solar wind is moving past L1", fmt: (v) => Math.round(v).toString() },
  { key: "density", label: "Density", unit: "p/cm³", hint: "Protons per cubic centimetre", fmt: (v) => v.toFixed(1) },
  {
    key: "bz", label: "Bz", unit: "nT", zeroLine: true,
    hint: "North–south part of the wind's magnetic field. South (negative) lets energy into Earth's magnetic field",
    fmt: fmtBz,
  },
  {
    key: "newell", label: "Coupling", unit: "Newell", hint: "Newell coupling dΦ/dt: how fast the wind is feeding energy into Earth's magnetic field",
    fmt: compact,
  },
];

function sparkOptions(width: number, height: number, m: Measure, onCursor: (u: uPlot) => void): uPlot.Options {
  const px = uPlot.pxRatio;
  return {
    width,
    height,
    tzDate: utc,
    padding: [6, 8, 6, 2],
    legend: { show: false },
    cursor: { sync: { key: SYNC_KEY }, drag: { x: false, y: false }, y: false, points: { size: 8, width: 2, stroke: CHART.surface } },
    scales: {
      x: { time: true },
      y: {
        range: (_u, min, max) => {
          if (min == null || max == null) return [0, 1];
          const lo = m.zeroLine ? Math.min(min, -1) : min;
          const hi = m.zeroLine ? Math.max(max, 1) : max;
          const pad = (hi - lo) * 0.12 || 1;
          return [lo - pad, hi + pad];
        },
      },
    },
    axes: [{ show: false }, { show: false }],
    series: [{}, { stroke: CHART.series1, width: 2, points: { show: false } }],
    hooks: {
      drawAxes: [
        (u) => {
          if (!m.zeroLine) return;
          const y = Math.round(u.valToPos(0, "y", true)) + 0.5;
          const { ctx } = u;
          ctx.save();
          ctx.strokeStyle = CHART.axis;
          ctx.lineWidth = px;
          ctx.beginPath();
          ctx.moveTo(u.bbox.left, y);
          ctx.lineTo(u.bbox.left + u.bbox.width, y);
          ctx.stroke();
          ctx.restore();
        },
      ],
      draw: [
        (u) => {
          const ys = u.data[1];
          let i = ys.length - 1;
          while (i >= 0 && ys[i] == null) i--;
          if (i < 0) return;
          const { ctx } = u;
          const x = u.valToPos(u.data[0][i], "x", true);
          const y = u.valToPos(ys[i] as number, "y", true);
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, 6 * px, 0, Math.PI * 2);
          ctx.fillStyle = CHART.surface;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x, y, 4 * px, 0, Math.PI * 2);
          ctx.fillStyle = CHART.series1;
          ctx.fill();
          ctx.restore();
        },
      ],
      setCursor: [onCursor],
    },
  };
}

function BzState({ bz }: { bz: number }) {
  if (bz <= -10) {
    return (
      <span className="bz-state strong" title="Strongly southward: geomagnetic storm conditions are possible">
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M8 2 15 14H1Z" />
          <path d="M8 6.5v3.5M8 12v.01" strokeLinecap="round" />
        </svg>
        Strongly south
      </span>
    );
  }
  const dir = bzDirection(bz);
  return dir ? <span className="bz-state">{dir === "south" ? "South" : "North"}</span> : null;
}

function Tile({ m, data, xRange, hoverT, setHover }: {
  m: Measure; data: Aligned; xRange: [number, number]; hoverT: number | null; setHover: (t: number | null) => void;
}) {
  const active = useRef(false);
  const make = useMemo(
    () => (w: number, h: number) =>
      sparkOptions(w, h, m, (u) => {
        if (!active.current) return;
        const i = u.cursor.idx;
        setHover(i == null ? null : (u.data[0][i] as number));
      }),
    [m, setHover],
  );
  const { box } = useUplot(make, data, xRange);
  const latestRow = rowAt(data, Infinity);
  const row = hoverT === null ? latestRow : rowAt(data, hoverT);
  const v = row === null ? null : (data[1][row] as number);

  return (
    <div className="wind-tile" title={m.hint}>
      <div className="wind-head">
        <span className="wind-label">{m.label}</span>
        <span className="wind-age">
          {hoverT !== null && row !== null ? `at ${hhmm(data[0][row])}` : <DataAge ts={latestRow === null ? null : data[0][latestRow]} feed="rtsw" />}
        </span>
      </div>
      <div className="wind-value">
        <span className="num">{v === null ? "—" : m.fmt(v)}</span>
        <span className="unit">{m.unit}</span>
        {m.key === "bz" && v !== null ? <BzState bz={v} /> : null}
      </div>
      <div
        ref={box}
        className="spark-box"
        onPointerEnter={() => (active.current = true)}
        onPointerLeave={() => {
          active.current = false;
          setHover(null);
        }}
      />
    </div>
  );
}

/** Solar wind at L1 (UF8): four measures with 6 h trends and a shared crosshair; values lead, ages follow. */
export function WindPanel({ now }: { now: number }) {
  const [table, setTable] = useState(false);
  const hoverT = useHover((s) => s.t);
  const setHover = useHover((s) => s.set);
  const xRange = useMemo<[number, number]>(() => [now - STATE_WINDOW_S, now], [now]);
  const series = useMemo(() => {
    const w = liveStore.getState().wind.view();
    return Object.fromEntries(MEASURES.map((m) => [m.key, windowed(w.t, [w[m.key]], xRange[0], xRange[1])])) as Record<WindKey, Aligned>;
  }, [xRange]);

  const speedData = series.speed;
  const speedRow = hoverT === null ? rowAt(speedData, Infinity) : rowAt(speedData, hoverT);
  const speed = speedRow === null ? null : (speedData[1][speedRow] as number);

  return (
    <section className="hud-panel" aria-labelledby="wind-title">
      <header className="hud-head">
        <div className="hud-title">
          <h2 id="wind-title">Solar wind at L1</h2>
          <span className="hud-sub">
            {speed === null
              ? "DSCOVR / ACE · last 6 h"
              : `reaches Earth in ~${formatDuration(windSeconds(L1_DISTANCE_AU * AU_KM, speed))} at this speed`}
          </span>
        </div>
        <button className="hud-btn" aria-pressed={table} onClick={() => setTable(!table)}>
          {table ? "Chart" : "Table"}
        </button>
      </header>
      <div className="hud-body">
        <div className="wind-grid" hidden={table}>
          {MEASURES.map((m) => (
            <Tile key={m.key} m={m} data={series[m.key]} xRange={xRange} hoverT={hoverT} setHover={setHover} />
          ))}
        </div>
        {table ? <WindTable series={series} /> : null}
      </div>
    </section>
  );
}

function WindTable({ series }: { series: Record<WindKey, Aligned> }) {
  const rows = tableRows(series.speed, 900);
  const at = (k: WindKey, t: number) => {
    const r = rowAt(series[k], t);
    return r === null ? null : (series[k][1][r] as number);
  };
  return (
    <div className="hud-table" tabIndex={0}>
      <table>
        <caption className="sr-only">Solar wind at L1 every 15 minutes, newest first</caption>
        <thead>
          <tr>
            <th>UTC</th>
            {MEASURES.map((m) => (
              <th key={m.key}>{m.label} ({m.unit})</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => {
            const t = series.speed[0][i];
            return (
              <tr key={t}>
                <td>{hhmm(t)}</td>
                {MEASURES.map((m) => {
                  const v = at(m.key, t);
                  return <td key={m.key}>{v === null ? "—" : m.fmt(v)}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
