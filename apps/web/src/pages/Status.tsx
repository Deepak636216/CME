import { useEffect, useState } from "react";
import { serverNow } from "../lib/api.ts";
import { useLive } from "../store/live.ts";

/** Feed health and stream diagnostics, read from the live store (kept current by the WebSocket). */
export function StatusPage() {
  const clock = useLive((s) => s.clock);
  const clockAt = useLive((s) => s.clockAt);
  const feeds = useLive((s) => s.feeds);
  const seq = useLive((s) => s.seq);
  const conn = useLive((s) => s.conn);
  useLive((s) => s.seriesRev); // re-render when points arrive
  const xrayLen = useLive((s) => s.xray.length);
  const windLen = useLive((s) => s.wind.length);
  useSecondTick();

  if (!clock) return <p className="muted">Connecting… ({conn.status})</p>;

  const now = serverNow(clock, clockAt);
  const wall = Date.now() / 1000;
  return (
    <section>
      <h1>Feed status</h1>
      <p className="muted">
        Server time {new Date(now * 1000).toISOString().slice(0, 19)}Z · mode {clock.mode}
        {clock.scenario ? ` · scenario ${clock.scenario}` : ""} · speed ×{clock.speed}
      </p>
      <table>
        <thead>
          <tr>
            <th>Feed</th>
            <th>Cadence</th>
            <th>Data age</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {feeds.map((f) => (
            <tr key={f.id}>
              <td>{f.label}</td>
              <td>{f.cadenceS} s</td>
              <td>{f.dataTs == null ? "—" : formatAge(now - f.dataTs)}</td>
              <td className={f.stale ? "stale" : "ok"}>{f.stale ? `stale${f.error ? `: ${f.error}` : ""}` : "ok"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Stream</h2>
      <table className="kv">
        <tbody>
          <tr>
            <th>Connection</th>
            <td className={conn.status === "live" ? "ok" : "stale"}>
              {conn.status}
              {conn.failures ? ` (${conn.failures} failed attempts)` : ""}
            </td>
          </tr>
          <tr>
            <th>Data from</th>
            <td>{conn.source}</td>
          </tr>
          <tr>
            <th>Seq</th>
            <td>{seq ?? "—"}</td>
          </tr>
          <tr>
            <th>Last message</th>
            <td>{conn.lastMessageAt ? `${formatAge(wall - conn.lastMessageAt)} ago` : "—"}</td>
          </tr>
          <tr>
            <th>Gaps / resyncs</th>
            <td>
              {conn.gaps} / {conn.resyncs}
            </td>
          </tr>
          <tr>
            <th>Points held</th>
            <td>
              {xrayLen} X-ray · {windLen} wind
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function useSecondTick() {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
}

function formatAge(s: number): string {
  if (s < 90) return `${Math.max(0, Math.round(s))} s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  if (s < 172800) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} d`;
}
