import { AU_KM } from "@cme/physics";
import type { Cme } from "@cme/shared";
import { activeCmes, cmeFrontKm, cmePhase, cmeSpeedAt } from "../lib/cme.ts";
import { useServerNow } from "../lib/clock.ts";
import { formatClock, formatDuration } from "../lib/travel.ts";
import { useLive } from "../store/live.ts";
import { useUi } from "../store/ui.ts";
import { MinButton } from "./MinButton.tsx";

const hhmm = (t: number) => new Date(t * 1000).toISOString().slice(11, 16);

/**
 * CMEs in flight right now (UF5): where they came from, how fast they are now, and for Earth-directed ones,
 * when they arrive (the server's drag-based forecast) with a countdown. Earth-directed first; at most two.
 */
export function CmeCard() {
  const now = useServerNow();
  const cmes = useLive((s) => s.cmes);
  const flares = useLive((s) => s.flares);
  const minimized = useUi((s) => s.minimized.cme);
  if (now === null) return null;
  const list = activeCmes(cmes, now).slice(0, 2);
  if (!list.length) return null;

  return (
    <div className="cme-cards" aria-live="polite" data-min={minimized}>
      {list.map((c, i) => (
        <CmeItem key={c.id} cme={c} now={now} first={i === 0} flare={c.flareId ? flares.find((f) => f.id === c.flareId) ?? null : null} />
      ))}
    </div>
  );
}

function CmeItem({ cme, now, flare, first }: { cme: Cme; now: number; flare: { cls: string; regionNo: number | null } | null; first: boolean }) {
  const phase = cmePhase(cme, now);
  const km = cmeFrontKm(cme, now) ?? 0;
  const eta = cme.forecast?.eta ?? null;
  const toEarth = cme.earthDirected && eta !== null;
  return (
    <section className={`cme-card ${toEarth ? "earth" : ""}`} aria-label={toEarth ? "CME heading for Earth" : "CME missing Earth"}>
      <header>
        <span className="cme-dot" aria-hidden />
        <h2>
          <button type="button" className="cme-title" onClick={() => useUi.getState().select({ kind: "cme", id: cme.id })} title="Details">
            {toEarth ? (phase === "passed Earth" ? "CME reached Earth" : "CME heading for Earth") : "CME, will miss Earth"}
          </button>
        </h2>
        {first ? <MinButton panel="cme" label="CME cards" /> : null}
      </header>
      <p className="cme-from">
        Left the Sun {hhmm(cme.launchAt)} UTC
        {flare ? ` after a ${flare.cls} flare${flare.regionNo ? ` in AR ${flare.regionNo}` : ""}` : ""} · {cme.halfAngle * 2}° wide
      </p>
      <dl>
        <div>
          <dt>Speed now</dt>
          <dd>{Math.round(cmeSpeedAt(cme, now)).toLocaleString("en-US")} km/s</dd>
        </div>
        <div>
          <dt>From the Sun</dt>
          <dd>{(km / AU_KM).toFixed(2)} AU</dd>
        </div>
        {toEarth ? (
          <div className="wide">
            <dt>{phase === "passed Earth" ? "Arrived" : "Arrives"}</dt>
            <dd>
              {formatClock(eta!).replace(/ \d{4}/, "").replace(/:\d\d UTC/, " UTC")}
              <span className="cme-count">
                {phase === "passed Earth" ? ` · ${formatDuration(now - eta!)} ago` : ` · in ${formatDuration(eta! - now)}`}
                {cme.forecast?.arrivalSpeed ? ` · ~${cme.forecast.arrivalSpeed.toLocaleString("en-US")} km/s` : ""}
              </span>
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
