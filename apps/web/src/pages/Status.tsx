import { DataAge } from "../hud/DataAge.tsx";
import { useServerNow, useWallSecond } from "../lib/clock.ts";
import { feedFreshness, formatAge } from "../lib/freshness.ts";
import { useLive } from "../store/live.ts";

/** Feed health and stream diagnostics, read from the live store (kept current by the WebSocket). */
export function StatusPage() {
  const clock = useLive((s) => s.clock);
  const feeds = useLive((s) => s.feeds);
  const seq = useLive((s) => s.seq);
  const conn = useLive((s) => s.conn);
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
