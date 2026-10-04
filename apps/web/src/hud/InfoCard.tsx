import { useEffect, type ReactNode } from "react";
import { AU_KM, classFromFlux, formatLocation } from "@cme/physics";
import type { Cme } from "@cme/shared";
import { activeCmes, cmeFrontKm, cmePhase, cmeSpeedAt } from "../lib/cme.ts";
import { PLANETS, positionsAt, subsolarPoint, L1_DISTANCE_AU, type PlanetId } from "../lib/ephemeris.ts";
import { rotatedLon } from "../lib/heliographic.ts";
import { areaInEarths, daysToWestLimb, distance, elongation, flareCounts, magClassMeaning } from "../lib/info.ts";
import { useServerNow } from "../lib/clock.ts";
import { fmtBz } from "../lib/format.ts";
import { formatClock, formatDuration, latest, lightSeconds, windSeconds } from "../lib/travel.ts";
import { liveStore, useLive } from "../store/live.ts";
import { useUi, type Selection } from "../store/ui.ts";

const hhmm = (t: number) => new Date(t * 1000).toISOString().slice(11, 16);
const au = (x: number) => `${x.toFixed(3)} AU`;
const mkm = (x: number) => `${((x * AU_KM) / 1e6).toFixed(1)} million km`;
const latLon = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(1)}° ${lon >= 0 ? "E" : "W"}`;
const whenUtc = (t: number) => formatClock(t).replace(/ \d{4}/, "").replace(/:\d\d UTC/, " UTC");

/**
 * The info card for whatever was clicked (UF3): real numbers for that object right now, a Focus button that
 * flies the camera there and follows it, and Close (or Esc). Loaded lazily with the ephemeris on first click.
 */
export default function InfoCard({ sel }: { sel: Selection }) {
  const now = useServerNow() ?? Date.now() / 1000;
  const { select, setView } = useUi.getState();
  useLive((s) => s.seriesRev); // fresh wind / X-ray values
  const regions = useLive((s) => s.regions);
  const flares = useLive((s) => s.flares);
  const cmes = useLive((s) => s.cmes);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && select(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select]);

  const p = positionsAt(now);
  const live = liveStore.getState();
  const xray = latest(live.xray.view().long);
  const wind = live.wind.view();
  const speed = latest(wind.speed);
  const bz = latest(wind.bz);
  const density = latest(wind.density);

  let title = "";
  let kicker = "";
  let body: ReactNode = null;

  switch (sel.kind) {
    case "planet": {
      const info = PLANETS.find((x) => x.id === sel.id)!;
      const pos = p[sel.id as PlanetId];
      const fromSun = Math.hypot(...pos);
      title = info.label;
      kicker = "Planet";
      if (sel.id === "earth") {
        const ss = subsolarPoint(now);
        const next = activeCmes(cmes, now).find((c) => c.earthDirected && c.forecast?.eta && c.forecast.eta > now);
        body = (
          <>
            <Facts rows={[
              ["From the Sun", `${au(fromSun)} · ${mkm(fromSun)}`],
              ["Sunlight takes", formatDuration(lightSeconds(fromSun))],
              ["Sun overhead now", latLon(ss.lat, ss.lon)],
              ["X-rays now (GOES)", xray === null ? "—" : classFromFlux(xray)],
              ["Solar wind at L1", speed === null ? "—" : `${Math.round(speed)} km/s · Bz ${bz === null ? "—" : fmtBz(bz)} nT`],
            ]} />
            <p className="info-note">
              {next
                ? `A CME is on its way: arrival ${whenUtc(next.forecast!.eta!)}, in ${formatDuration(next.forecast!.eta! - now)}.`
                : "No Earth-directed CME is on its way right now."}
            </p>
          </>
        );
      } else {
        const fromEarth = distance(pos, p.earth);
        const el = elongation(pos, p.earth);
        body = (
          <Facts rows={[
            ["From the Sun", `${au(fromSun)} · ${mkm(fromSun)}`],
            ["From Earth", `${au(fromEarth)} · light takes ${formatDuration(lightSeconds(fromEarth))}`],
            ["In Earth's sky", `${el.deg.toFixed(0)}° from the Sun · ${el.sky} sky`],
            ["Radius", `${info.radiusKm.toLocaleString("en-US")} km`],
            ["Year", `${info.periodDays.toFixed(0)} Earth days`],
          ]} />
        );
      }
      break;
    }
    case "sun": {
      const counts = flareCounts(flares, now);
      const onDisc = regions.filter((r) => Math.abs(rotatedLon(r.lon, live.regionsAt, now)) < 90);
      const biggest = [...onDisc].sort((a, b) => b.areaMsh - a.areaMsh)[0];
      const inFlight = activeCmes(cmes, now);
      const fromEarth = Math.hypot(...p.earth);
      title = "Sun";
      kicker = "Star";
      body = (
        <Facts rows={[
          ["X-rays now", xray === null ? "—" : classFromFlux(xray)],
          ["Flares, last 24 h", `C ${counts.C} · M ${counts.M} · X ${counts.X}`],
          ["Sunspot regions on the disc", `${onDisc.length}${biggest ? ` · biggest AR ${biggest.regionNo} (${areaInEarths(biggest.areaMsh).toFixed(1)} Earths)` : ""}`],
          ["CMEs in flight", inFlight.length ? `${inFlight.length} · ${inFlight.filter((c) => c.earthDirected).length} toward Earth` : "none"],
          ["From Earth", `${au(fromEarth)} · light takes ${formatDuration(lightSeconds(fromEarth))}`],
        ]} />
      );
      break;
    }
    case "l1": {
      title = "L1";
      kicker = "Solar wind monitor (DSCOVR, ACE)";
      body = (
        <>
          <Facts rows={[
            ["Where", `${(L1_DISTANCE_AU * AU_KM / 1e6).toFixed(1)} million km sunward of Earth`],
            ["Wind speed", speed === null ? "—" : `${Math.round(speed)} km/s`],
            ["Density", density === null ? "—" : `${density.toFixed(1)} p/cm³`],
            ["Bz", bz === null ? "—" : `${fmtBz(bz)} nT ${bz <= -10 ? "· strongly south" : bz < 0 ? "· south" : "· north"}`],
            ["Reaches Earth in", speed === null ? "—" : `~${formatDuration(windSeconds(L1_DISTANCE_AU * AU_KM, speed))}`],
          ]} />
          <p className="info-note">Spacecraft here sit between the Sun and Earth and feel the solar wind first: the early warning for storms.</p>
        </>
      );
      break;
    }
    case "region": {
      const r = regions.find((x) => x.regionNo === sel.regionNo);
      title = `AR ${sel.regionNo}`;
      kicker = "Sunspot region (NOAA)";
      if (!r) {
        body = <p className="info-note">This region is no longer on the visible disc.</p>;
        break;
      }
      const lon = rotatedLon(r.lon, live.regionsAt, now);
      const limb = daysToWestLimb(lon);
      const own = flares.filter((f) => f.regionNo === r.regionNo).sort((a, b) => b.beginAt - a.beginAt).slice(0, 4);
      body = (
        <>
          <Facts rows={[
            ["Location now", formatLocation(r.lat, lon)],
            ["Area", `${r.areaMsh} millionths of the hemisphere · ${areaInEarths(r.areaMsh).toFixed(1)} Earths`],
            ["Magnetic class", magClassMeaning(r.magClass) ?? "—"],
            ["Spots", String(r.spotCount)],
            ["Flare chance (NOAA, 24 h)", `M ${r.pM ?? "—"}% · X ${r.pX ?? "—"}%`],
            ["Turns out of view", limb === null ? "now" : `in ~${limb.toFixed(1)} days (west limb)`],
          ]} />
          {own.length ? (
            <p className="info-note">
              Flares here: {own.map((f) => `${f.status === "ended" ? classFromFlux(f.peakFlux) : f.cls} at ${hhmm(f.beginAt)}`).join(" · ")}
            </p>
          ) : null}
        </>
      );
      break;
    }
    case "cme": {
      const c = cmes.find((x) => x.id === sel.id);
      title = "CME";
      kicker = "Coronal mass ejection";
      body = c ? <CmeFacts cme={c} now={now} flare={c.flareId ? flares.find((f) => f.id === c.flareId) : undefined} /> : <p className="info-note">This CME is no longer tracked.</p>;
      break;
    }
  }

  return (
    <section className="info-card" aria-labelledby="info-title">
      <header>
        <div>
          <span className="info-kicker">{kicker}</span>
          <h2 id="info-title">{title}</h2>
        </div>
        <div className="info-actions">
          <button type="button" onClick={() => setView("focus")} title="Fly the camera here and follow it">
            Focus
          </button>
          <button type="button" onClick={() => select(null)} aria-label="Close details">
            ✕
          </button>
        </div>
      </header>
      {body}
    </section>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="info-facts">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function CmeFacts({ cme, now, flare }: { cme: Cme; now: number; flare?: { cls: string; peakFlux: number; status: string; regionNo: number | null } }) {
  const km = cmeFrontKm(cme, now);
  const phase = cmePhase(cme, now);
  const eta = cme.forecast?.eta ?? null;
  const flareCls = flare ? (flare.status === "ended" ? classFromFlux(flare.peakFlux) : flare.cls) : null;
  const rows: [string, string][] = [
    ["Left the Sun", `${whenUtc(cme.launchAt)}${flareCls ? ` · after a ${flareCls} flare${flare!.regionNo ? ` in AR ${flare!.regionNo}` : ""}` : ""}`],
    ["Direction", `${formatLocation(cme.lat, cme.lon)} · ${cme.halfAngle * 2}° wide`],
    ["Speed", `${Math.round(cmeSpeedAt(cme, now)).toLocaleString("en-US")} km/s now (left at ${cme.speed.toLocaleString("en-US")})`],
    ["Front", km === null ? "—" : `${(km / AU_KM).toFixed(2)} AU from the Sun`],
    ["Earth", cme.earthDirected && eta !== null
      ? `${phase === "passed Earth" ? "arrived" : "arrives"} ${whenUtc(eta)}${phase === "passed Earth" ? ` (${formatDuration(now - eta)} ago)` : ` (in ${formatDuration(eta - now)})`}${cme.forecast?.arrivalSpeed ? ` at ~${cme.forecast.arrivalSpeed} km/s` : ""}`
      : "will miss Earth"],
  ];
  return (
    <>
      <Facts rows={rows} />
      <p className="info-note">
        Travel time from the drag-based model: the solar wind ({cme.forecast?.w ?? 400} km/s) slows a fast CME and speeds a slow one
        {cme.forecast ? ` (γ = ${(cme.forecast.gamma * 1e8).toFixed(1)}×10⁻⁸ km⁻¹)` : ""}.
      </p>
    </>
  );
}
