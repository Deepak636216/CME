import { useServerNow } from "../lib/clock.ts";
import { clockNote, formatClock } from "../lib/travel.ts";
import { useLive } from "../store/live.ts";

/**
 * The scene's clock: the moment being drawn, in UTC, and whether it is live. Says so whenever time is not
 * real (mock data, a scenario, a speed other than ×1), so a sped-up demo is never mistaken for reality.
 */
export function SceneClock() {
  const now = useServerNow();
  const clock = useLive((s) => s.clock);
  const conn = useLive((s) => s.conn);
  if (now === null || !clock) return null;

  const [label, tone, hint] =
    conn.status === "live"
      ? ["LIVE", "ok", "Updating as new data arrives"]
      : conn.source === "cache"
        ? ["SAVED", "warn", "Showing the last saved data while offline"]
        : ["DELAYED", "warn", "Reconnecting; the scene keeps running on the server clock"];
  const note = clockNote(clock);
  return (
    <div className="scene-clock" title={hint}>
      <span className={`clock-state ${tone}`}>
        <span className="dot" aria-hidden />
        {label}
      </span>
      <time dateTime={new Date(now * 1000).toISOString()}>{formatClock(now)}</time>
      {note ? <span className="clock-note">{note}</span> : null}
    </div>
  );
}
