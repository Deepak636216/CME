import { useEffect, useState } from "react";
import type { HealthResponse, Unix } from "@cme/shared";
import { getJson, serverNow } from "../lib/api.ts";

/** Feed health from GET /api/v1/health. Polled for now; it moves onto the live stream in Phase 2. */
export function StatusPage() {
  const [health, setHealth] = useState<{ data: HealthResponse; receivedAt: Unix } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    const load = () =>
      getJson<HealthResponse>("/health", ctrl.signal)
        .then((data) => {
          setHealth({ data, receivedAt: Date.now() / 1000 });
          setError(null);
        })
        .catch((e: Error) => e.name !== "AbortError" && setError(e.message));
    load();
    const poll = setInterval(load, 10_000);
    const clock = setInterval(() => tick((n) => n + 1), 1000);
    return () => {
      ctrl.abort();
      clearInterval(poll);
      clearInterval(clock);
    };
  }, []);

  if (error && !health) return <p className="error">Backend unreachable: {error}. Is `npm run mock` running?</p>;
  if (!health) return <p className="muted">Loading…</p>;

  const { clock, feeds } = health.data;
  const now = serverNow(clock, health.receivedAt);
  return (
    <section>
      <h1>Feed status</h1>
      <p className="muted">
        Server time {new Date(now * 1000).toISOString().slice(0, 19)}Z · mode {clock.mode}
        {clock.scenario ? ` · scenario ${clock.scenario}` : ""} · speed ×{clock.speed}
        {error ? ` · last refresh failed: ${error}` : ""}
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
    </section>
  );
}

function formatAge(s: number): string {
  if (s < 90) return `${Math.max(0, Math.round(s))} s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  if (s < 172800) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} d`;
}
