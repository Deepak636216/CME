# Web App

The real-time Sun → Earth website: Vite + React 18 + TypeScript. Design: [docs/design/frontend/](../../docs/design/frontend/README.md). Build order: [PLAN.md](../../docs/design/PLAN.md).

```bash
# from the repo root, in two terminals
npm run mock      # backend stand-in on :8787 (try --scenario big-storm)
npm run web       # http://localhost:5173
```

The browser only calls same-origin `/api/v1/*`. In dev, Vite proxies REST and the WebSocket to the mock. To point at another backend, set `CME_API=https://… npm run web`.

| Command (repo root) | |
|---|---|
| `npm run web` | Dev server with hot reload |
| `npm run build:web` | Typecheck + production build into `apps/web/dist/` |
| `npm test -w @cme/web` | Unit tests + stream tests against an in-process mock (~15 s) |
| `npm run typecheck` | All packages, this app included |

## Layout

```
src/
  main.tsx, router.tsx     routes: / /sun /replay /events /events/:kind/:id /status
  shell/                   AppShell, TopBar, ConnectionBadge, FreshnessBadge (AlertToaster… later)
  hud/DataAge.tsx          "73 s" next to any live value; amber once its feed is stale
  pages/                   one file per route; most are placeholders until their phase
  store/live.ts            Zustand live store: seq, clock, series, lists, connection state
  stream/client.ts         LiveStream: boot, seq check + resync, reconnect, polling fallback
  stream/apply.ts          applySnapshot / applyDelta (pure, unit-tested)
  stream/useLiveStream.ts  starts the stream in AppShell; reconnects on `online` / tab visible
  lib/series.ts            ColumnSeries: capped Float64Array time series, copy-free views for charts
  lib/localCache.ts        IndexedDB copy of the last state
  lib/api.ts               getJson(), serverNow() (data time comes from the server clock)
  lib/clock.ts             useServerNow(): one shared 1 s ticker for every age display
  lib/freshness.ts         fresh / stale / unknown rules, formatAge()
  store/ui.ts              uiSlice: scale (saved), camera view
  lib/ephemeris.ts         Mercury, Venus, Earth, L1 positions (astronomy-engine, J2000 ecliptic, AU)
  scene/                   SceneCanvas (lazy chunk), SunMesh, PlanetBodies, OrbitLines, L1Probe, CameraRig
  scene/materials.ts       shaders: Sun photosphere + corona, textured Earth + atmosphere, Venus, Mercury
public/textures/           NASA Earth maps (384 kB WebP); see CREDITS.md
  hud/SceneControls.tsx    Readable / True scale toggle, Overview / Top / Earth camera
  hud/SceneClock.tsx       UTC clock with LIVE / DELAYED / SAVED and a note when time isn't real
  hud/SceneKey.tsx         what each mark means; scale note; NASA credit
  scene/SunEarthLine.tsx   Sun–Earth line with light and live solar-wind travel times
  lib/travel.ts            light and wind travel times, duration and clock formatting
  hud/SceneFallback.tsx    no WebGL / scene failed: the same positions as a table (+ SceneBoundary)
```

  hud/charts/               XrayChart, WindPanel (uPlot, lazy chunk), shared crosshair, table views
  hud/PanelBoundary.tsx    a failing panel never takes the page down
  lib/chartData.ts         windowing with gap breaks, peak, hover row, table rows
  lib/format.ts            flux (3.4×10⁻⁶) and Bz (never −0.0) formatting Scene design and decisions: [scene-plan.md](../../docs/design/frontend/scene-plan.md).

## How the live stream behaves

| Situation | What the client does |
|---|---|
| Page load | Paints the IndexedDB copy, then `GET /state`, then opens `WS /stream?since=<seq>` |
| Next message has `seq + 1` | Applies it (series appended, lists upserted by id, regions replaced) |
| `seq` jumps (a message was lost) | Sends `{"type":"resync"}` and ignores messages until the snapshot; reconnects fresh if none comes in 10 s |
| Socket closes | Reconnects after 0.25–0.5 s, doubling to 30 s max, resuming with `?since=` so nothing is missed |
| 3 failed attempts in a row | Also polls `GET /state` every 30 s until the socket is back |
| No message for 40 s (pings come every 15 s) | Treats the socket as dead and reconnects |
| Cached seq | Never used to resume: it may come from another server run |

## Badges (top bar)

| Badge | States |
|---|---|
| Connection | **Live** (green) · Connecting… · Reconnecting… · Delayed · polling · **Offline · saved data** (amber) |
| Freshness | **All data fresh** (green) · `<feed>: delayed` / `N feeds delayed` (amber) |

A feed is stale when the server flags it **or** its newest data is older than `staleAfterS` measured on the server clock. The second rule lets ages keep counting and turn amber while the stream is down. Data restored from the browser cache is aged against the real clock, so after a reload offline it shows its true age.

Try it: open `/status` and use the mock's control page (http://localhost:8787/mock/ui) to inject faults.

## Status

- [x] Step 1: scaffold, routes, dev proxy to the mock, `/status` page reading `GET /api/v1/health`
- [x] Step 2: Zustand store + `useLiveStream` + IndexedDB cache; `/status` reads the live store
- [x] Step 3: ConnectionBadge + FreshnessBadge + DataAge
- [x] Step 4: 3D scene (Sun, Mercury, Venus, Earth, L1), scale toggle, camera presets, WebGL fallback
- [x] Step 5: XrayChart + WindPanel

## Data panels (step 5)

| Panel | What it shows | How to read it without a mouse |
|---|---|---|
| Solar X-rays | GOES long (sets the flare class) and short channels, last 6 h, log scale with A/B/C/M/X bands; M and X washed in their status colours; headline = class now + 6 h peak | Focus the chart, then ← / → step through readings, Esc clears; or **Table** (every 15 min) |
| Solar wind at L1 | Speed, density, Bz (with North / South / ⚠ Strongly south at ≤ −10 nT) and Newell coupling, each with a 6 h trend; headline line = how long this wind takes from L1 to Earth | **Table** (every 15 min) |

- One crosshair for all charts: hover any of them and every value reads "at HH:MM".
- Charts redraw once a second (the 6 h window slides with the server clock); the 3D scene runs independently.
- Colours: series slots 1–2 of the dataviz reference palette (dark steps), validated on the HUD surface `#131824` (CVD ΔE 26.8, ≥ 3:1). Status colours only for flare-class severity and southward Bz, always with a label.
- Phones: the two panels become tabs (Solar wind first).
