import { DataAge } from "../hud/DataAge.tsx";
import { useServerNow, useWallSecond } from "../lib/clock.ts";
import { percentile } from "../lib/arrival.ts";
import { feedFreshness, formatAge } from "../lib/freshness.ts";
import { useLive } from "../store/live.ts";

/** Feed health and stream diagnostics, read from the live store (kept current by the WebSocket). */
export function StatusPage() {
  const clock = useLive((s) => s.clock);
  const feeds = useLive((s) => s.feeds);
  const seq = useLive((s) => s.seq);
  const conn = useLive((s) => s.conn);
  const arrivals = useLive((s) => s.arrivals);
  useLive((s) => s.seriesRev); // re-render when points arrive
  const xrayLen = useLive((s) => s.xray.length);
  const windLen = useLive((s) => s.wind.length);
  const now = useServerNow();
  const wall = useWallSecond();

  if (!clock || now === null) return <p className="muted">Connecting… ({conn.status})</p>;

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
              <td>
                <DataAge ts={f.dataTs} feed={f.id} />
              </td>
              <td className={feedFreshness(f, now) === "fresh" ? "ok" : "stale"}>
                {f.error ?? (feedFreshness(f, now) === "fresh" ? "ok" : `no data for > ${formatAge(f.staleAfterS)}`)}
              </td>
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
            <th>Rejected messages</th>
            <td className={conn.invalid ? "stale" : undefined}>
              {conn.invalid}
              {conn.lastInvalid ? ` (last: ${conn.lastInvalid})` : ""}
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

      <h2>Arrival delay</h2>
      <p className="muted">
        How old each new point was when it reached this page: the source's own publishing delay (NOAA posts each
        minute about a minute late), plus our server and the network. Measured only when the clock runs at real time.
      </p>
      <table className="kv">
        <tbody>
          {(["xray", "wind"] as const).map((k) => {
            const a = arrivals[k];
            const p50 = percentile(a, 50);
            const p95 = percentile(a, 95);
            return (
              <tr key={k}>
                <th>{k === "xray" ? "X-ray" : "Solar wind"}</th>
                <td>
                  {p50 === null || p95 === null
                    ? clock.speed === 1 ? "waiting for new data…" : `not measured at ×${clock.speed}`
                    : `median ${formatAge(p50)} · 95% within ${formatAge(p95)} · last ${a.length} update${a.length === 1 ? "" : "s"}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
