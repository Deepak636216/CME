# Build Plan: Backend & Frontend

The plan follows [SCOPE.md](../SCOPE.md) and the designs in [backend/](backend/README.md) and [frontend/](frontend/README.md). Each phase ends with something running and deployed for free.

```
Phase 0  Setup ──► Phase 1  Live loop ──► Phase 2  Live UI ──► Phase 3  Physics ──► Phase 4  Alerts & replay ──► Phase 5  Harden
 (both)            (backend)              (frontend)           (both)                (both)                       (both)
```

## Phase 0: Setup

- [ ] pnpm monorepo: `apps/worker`, `apps/web`, `packages/{shared,physics,protocol}`
- [ ] Cloudflare account (free, no card) → `wrangler` login; Pages project linked to GitHub
- [ ] Free NASA API key → Worker secret `NASA_API_KEY`
- [ ] GitHub Actions: lint + test + `wrangler deploy` + Pages build on push to `main`
- **Done when:** a "hello" Worker and an empty Pages site are live.

## Phase 1: Backend live loop (UC1, UC2, UC5, UC8)

- [ ] `SpaceWeatherHub` Durable Object with an `alarm()` loop and a cron watchdog
- [ ] `schema.sql` migration on first start; `meta.seq`
- [ ] Pollers for GOES X-ray and RTSW wind/mag with `If-None-Match`; adaptive 5 s polling window
- [ ] Normalizers → `xray_sample`, `wind_sample`, memory ring buffers
- [ ] `GET /state`, `WS /stream` (snapshot + delta), `GET /health`
- [ ] Seed from the existing `build_snapshot.py` data so the first deploy has 3 days of history
- **Done when:** `wscat` shows a new delta within 5 s of NOAA updating, with no browser open beforehand.

## Phase 2: Frontend live view (UF1, UF2, UF8, UF9)

- [ ] Vite + React + r3f scene: Sun, Mercury, Venus, Earth, L1 from astronomy-engine
- [ ] `useLiveStream`: snapshot/delta apply, `seq` gap → resync, backoff, polling fallback
- [ ] Zustand slices + IndexedDB cache; ConnectionBadge and FreshnessBadge
- [ ] XrayChart and WindPanel (uPlot, ≤ 1 Hz)
- **Done when:** a cold load is interactive in < 2 s and runs at 60 fps; pulling the network cable and reconnecting catches up with no reload.

## Phase 3: Sun & CME physics (UC6, UF3, UF4, UF5)

- [ ] Backend: `solar_regions.json`, flare list, DONKI pollers → `sunspot_region`, `flare`, `cme`
- [ ] `packages/physics`: `dbm()`, `newell()`, `classFromFlux()` with unit tests (reuse the formulas in [research-notes.md](../research-notes.md))
- [ ] Backend writes `cme_forecast`; frontend animates `CmeShells` per frame from the same `dbm()`
- [ ] SunspotLayer + FlareMarkers placed on the Sun by lat/lon
- **Done when:** a past CME from DONKI replays to Earth with an ETA matching the DBM test values.

## Phase 4: Alerts & replay (UC3, UC7, UF6, UF7)

- [ ] AlertEngine rules (flare ≥ M1, Earth-directed CME, Bz ≤ −10 nT) with de-duplication
- [ ] `alert` WS message → toast, sound, Notification API; acks stored in IndexedDB
- [ ] `GET /history` (edge-cached), `GET /events`; TimelineBar replay mode; `/events` pages
- [ ] Pruner (UC9)
- **Done when:** replaying the last 7 days shows each flare and CME at the right moment, and a test alert reaches an open tab in < 1 s.

## Phase 5: Harden & launch

- [ ] Load test: 1,000 WebSockets on one DO; check request and duration usage in the Cloudflare dashboard
- [ ] Freshness monitor: `/health` checked by a free uptime pinger (e.g. UptimeRobot)
- [ ] Error budget alarms: Workers analytics → email on 1027 or alarm stall
- [ ] Point `docs/reconnection/index.html` at `/api/v1/*` and serve it at `/guide`
- **Done when:** the NFR targets in [SCOPE.md](../SCOPE.md) are measured and met for 7 days straight.

## Risks

| Risk | Plan |
|---|---|
| 100k requests/day exceeded | Pages for static files, edge cache on `/history`, WS instead of polling; move to the Oracle fallback ([TECH_STACK §4](TECH_STACK.md#4-fallback-if-cloudflare-limits-are-ever-hit)) |
| NOAA changes or removes a feed (as happened with `/products/solar-wind/*`) | Per-feed normalizer + FeedStatus "stale" in the UI; never a blank screen |
| DONKI `DEMO_KEY` limits | Personal key, polled every 5 min |
| Large RTSW payload (2.8 MB) | Download only on change (ETag); parse only the newest rows |
