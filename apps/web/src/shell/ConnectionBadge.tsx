import { Link } from "react-router";
import { formatAge } from "../lib/freshness.ts";
import { useWallSecond } from "../lib/clock.ts";
import { useLive, type ConnStatus } from "../store/live.ts";

const LABEL: Record<ConnStatus, string> = {
  connecting: "Connecting…",
  live: "Live",
  reconnecting: "Reconnecting…",
  polling: "Delayed · polling",
};

/** Is the stream up? Live = pushed updates; anything else means what you see may lag (UF9). */
export function ConnectionBadge() {
  const conn = useLive((s) => s.conn);
  const wall = useWallSecond();

  const savedOnly = conn.status !== "live" && conn.source === "cache";
  const tone = conn.status === "live" ? "ok" : conn.status === "connecting" && !savedOnly ? "idle" : "warn";
  const label = savedOnly ? "Offline · saved data" : LABEL[conn.status];
  const last = conn.lastMessageAt ? `last update ${formatAge(wall - conn.lastMessageAt)} ago` : "no update yet";
  const retry = conn.failures ? ` · ${conn.failures} failed attempt${conn.failures > 1 ? "s" : ""}` : "";

  return (
    <Link to="/status" className={`badge ${tone}`} title={`${label}: ${last}${retry}`} aria-live="polite">
      <span className="dot" aria-hidden />
      {label}
    </Link>
  );
}
