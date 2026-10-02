import { Link } from "react-router";
import { feedFreshness } from "../lib/freshness.ts";
import { useServerNow } from "../lib/clock.ts";
import { useLive } from "../store/live.ts";

/** One-glance summary of feed freshness (UF8). The per-value ages are <DataAge>. */
export function FreshnessBadge() {
  const feeds = useLive((s) => s.feeds);
  const now = useServerNow();
  if (now === null || !feeds.length) return null;

  const late = feeds.filter((f) => feedFreshness(f, now) !== "fresh");
  const label =
    late.length === 0 ? "All data fresh" : late.length === 1 ? `${late[0].label}: delayed` : `${late.length} feeds delayed`;
  return (
    <Link
      to="/status"
      className={`badge ${late.length ? "warn" : "ok"}`}
      title={late.length ? late.map((f) => f.label).join(", ") : "Every feed is within its expected age"}
    >
      {label}
    </Link>
  );
}
