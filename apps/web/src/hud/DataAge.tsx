import type { FeedId, Unix } from "@cme/shared";
import { formatAge, valueFreshness } from "../lib/freshness.ts";
import { useServerNow } from "../lib/clock.ts";
import { useLive } from "../store/live.ts";

/** The age of one value ("73 s"), amber once its feed's data is stale (UF8). Put it next to every live value. */
export function DataAge({ ts, feed }: { ts: Unix | null; feed: FeedId }) {
  const now = useServerNow();
  const status = useLive((s) => s.feeds.find((f) => f.id === feed));
  if (now === null || ts === null) return <span className="age unknown">—</span>;

  const fresh = valueFreshness(ts, status, now);
  const when = new Date(ts * 1000).toISOString().slice(0, 16).replace("T", " ");
  return (
    <span className={`age ${fresh}`} title={`Data time ${when} UTC${status?.error ? ` · ${status.error}` : ""}`}>
      {formatAge(now - ts)}
      {fresh === "stale" ? " · stale" : ""}
    </span>
  );
}
