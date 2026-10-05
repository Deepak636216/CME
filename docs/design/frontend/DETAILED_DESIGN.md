# Frontend detailed design

Builds on [README.md](README.md) (use cases UF1–UF9, routes) and [scene-plan.md](scene-plan.md) (the build log of the scene). This file describes `apps/web` **as built** (through Phase 3 and Phase 4 alerts) and the design of what's left (Replay, Events, Sun page). Gap ids from [../GAP_ANALYSIS.md](../GAP_ANALYSIS.md) are in brackets.

## 1. Goals that shape every decision

1. **Never wait on the network to draw** (NFR-5, FR-9). Paint from the IndexedDB cache, then REST, then the socket.
2. **60 fps without React** (NFR-4). Anything that moves every frame is computed in `useFrame` from store snapshots read with `getState()`, and written to three.js objects or DOM nodes through refs. React re-renders about once a second, for age tickers and charts.
3. **One source of truth per kind of state.** The stream writes `liveStore`; user input writes `useUi`; alert reading state lives in `useAlerts`. Nothing else writes them.
4. **Server-time everywhere.** The scene, ages and countdowns use `serverNow(clock, clockAt)`, never the device clock directly, so mock speed-ups and wrong device clocks behave.

## 2. Layers

```
┌ shell/   AppShell · TopBar · ConnectionBadge · FreshnessBadge · AlertBell · AlertToaster · useAlertDelivery
├ pages/   Live · Status  (built)   Sun · Replay · Events · EventDetail  (placeholders)
├ hud/     SceneClock · SceneControls · SceneKey · CmeCard · InfoCard · charts/{XrayChart, WindPanel, HudPanels}
│          DataAge · MinButton · PanelBoundary · SceneBoundary · SceneFallback
├ scene/   SceneCanvas (lazy) · SunMesh · SunActivity · PlanetBodies · OrbitLines · L1Probe · CmeShells
│          SunEarthLine · CameraRig · HitTarget · Labels · declutter · materials · sizes · time · motion · textures
├ stream/  client.ts (LiveStream) · apply.ts · useLiveStream.ts
├ store/   live.ts · ui.ts · alerts.ts            (planned: history.ts)
└ lib/     pure functions, unit-tested: series · ephemeris · cme · heliographic · sunActivity · info · travel
           chartData · format · freshness · alerts · clock · api · localCache · chime · webgl
```

**Dependency rule:**

- `lib/` imports nothing from the app except types, and no React.
- `stream/` imports `lib/` and `store/` only, so it runs under `node:test` against the real mock.
- `scene/` and `hud/` read the stores; only `stream/` writes `liveStore`.

## 3. State

### 3.1 `liveStore` (`store/live.ts`): written only by `stream/apply.ts`

| Field | Type | Notes |
|---|---|---|
| `seq` | `number \| null` | Last applied server seq; `null` until the server has answered (cached data may be on screen) |
| `clock`, `clockAt` | `Clock`, wall seconds | `serverNow()` = `clock.now + (wall − clockAt) × clock.speed` |
| `xray`, `wind` | `ColumnSeries` | `Float64Array` columns, capacity 10,080 (7 d × 1 min), contiguous views for uPlot; mutated in place |
| `seriesRev` | `number` | Bumped on any series change, so React can subscribe to "series changed" |
| `regions`, `regionsAt` | list, server time | Longitudes refer to `regionsAt`; the scene rotates them forward at 13.2°/day |
| `flares`, `cmes`, `alerts`, `feeds` | lists | Upserted by id; pruned (flares/CMEs 7 d, alerts 24 h after clearing) |
| `conn` | `{status, source, failures, lastMessageAt, gaps, resyncs}` | Drives the ConnectionBadge |

### 3.2 `useUi` (`store/ui.ts`): written only by user input

| Field | Remembered (localStorage) | |
|---|---|---|
| `scale` (`readable` / `true`) | yes | Animated over 600 ms (`sizes.ts`) |
| `view` (`overview` `top` `sun` `earth` `focus`) + `viewNonce` | no | CameraRig flies on every change |
| `keyOpen` | yes | Open on a first desktop visit |
| `selected: Selection \| null` | no | Planet, Sun, L1, region or CME; opens the InfoCard |
| `minimized: {xray, wind, cme}` | yes | CME cards start compact |
| `panelsHidden` | no | The eye button |

### 3.3 `useAlerts` (`store/alerts.ts`)

| Field | Kept in | |
|---|---|---|
| `acked: Set<id>` | IndexedDB `cme:alerts:acked:v1` | Trimmed to current alerts + newest 200 |
| `toasts: Alert[]` | memory | At most 3 |
| `sound`, `notify` | localStorage | Sound on by default; notify needs browser permission |

### 3.4 Planned: `history.ts` (Replay)

`{range: [from, to], res, xray, wind: ColumnSeries, events: {flares, cmes, alerts}, status}`. It is a **separate** store from `liveStore`, so replay never corrupts the live view, and switching back to live is instant.

## 4. Data flow

### 4.1 Boot and live (built, tested in `test/stream.test.ts`)

```
main.tsx → AppShell → useAlertDelivery(); useLiveStream(onAlert)
LiveStream.start():
  1. idbCache.load() → applySnapshot(source:"cache", trustSeq:false)       paint at once
  2. GET /api/v1/state (5 s timeout) → applySnapshot(source:"rest")
  3. WS /api/v1/stream?since=<seq> → onopen: conn.status = live
       snapshot → replace · delta → seq must be seq+1 → apply · alert → applyAlert + onAlert
       gap → send {type:"resync"}, ignore until a snapshot comes (10 s timeout → reconnect)
  4. close/error → reconnect: 500 ms × 2^(n−1), cap 30 s, jitter
     after 3 failures in a row → also poll GET /state every 30 s
     nothing received for 40 s → drop the socket (half-open detection)
  5. every 30 s and on pagehide → save the store to IndexedDB (6 h window)
  online / visible again → reconnect at once
```

**Planned changes:**

- [D2/F3] Validate every message against the shared schema before applying it; on failure, count it in `conn`, drop it and resync.
- [D3] Handle `hello`: if `minClient > CLIENT_PROTOCOL`, save the cache and reload once.
- [S2] On close code 1012, wait a random 0–3 s; on 1013, poll.

### 4.2 Alerts (built)

`alert` message → `applyAlert` (store) → `onAlert` → `useAlerts.receive()`:

- **Toast:** unless the alert is cleared, already read, or already on screen.
- **Fresh (< 30 min of server time):** chime if sound is on.
- **System notification:** only if it is enabled, permission is granted and the tab is in the background.

"Show me" maps the alert to a `Selection` or a route (`lib/alerts.ts › alertTarget`). Delivery is under 1 s (tested), ~0.1 s measured.

**Planned [F1]:** a service worker (`sw.ts`) so notifications also work on Android, plus an offline app shell.

### 4.3 Replay (planned, UF7, FR-8)

```
/replay?t=<unix>  →  ReplayPage
  history.load(from = t − 6 h, to = t + 1 h)   snapped to 5 min [C1]
    GET /history?series=xray&res=5m … , GET /history?series=wind … , GET /events?since=t − 7 d
    → history.worker.ts parses JSON into Float64Arrays, transferred (no copy) [F2]
  TimelineBar: 7-day track with flare ticks (by class) and CME launches; drag or ← → to move t
  The scene's time source becomes the replay time instead of serverNow().
```

The scene already gets its time from one function, `sceneTime()` in `scene/time.ts`. Replay adds a `timeSource` to `useUi`:

- `{kind: "live"}`, or `{kind: "replay", t, playing, speed}`.
- `sceneTime()` returns `t` (+ elapsed × speed when playing).
- Everything that animates (planets, Sun rotation, CME fronts, flare glows) is a pure function of time, so it shows the right moment with no other change.
- Charts read `history` instead of `liveStore` when in replay.
- The URL `?t=` is updated on release, not while dragging (`history.replaceState`).

### 4.4 Events pages (planned)

- **`/events`:** one table, newest first, filterable by kind (flare, CME, alert) and class. Data from `GET /events?since=now − 7 d`; rows link to the detail page and "Replay this moment" (`/replay?t=beginAt − 30 min`).
- **`/events/flare/:id`:** class, times, region, and the X-ray curve around it (history, 1 m).
- **`/events/cme/:id`:** `GET /cmes/:id`; a DBM distance–time and speed–time chart from `dbmAt()`, with the arrival line, and "Replay arrival".

## 5. Rendering

### 5.1 Scene coordinates and time

- J2000 ecliptic, 1 unit = 1 AU, mapped to three.js as (x, z, −y), so ecliptic north is up.
- Positions come from `astronomy-engine`, once per frame (`framePositions` cache), for `sceneTime()`.
- The Sun's group is turned so heliographic longitude 0 faces Earth. Regions, flares and CMEs use Earth-facing heliographic coordinates (+Z Earth, +X west, +Y north).

### 5.2 Per-frame budget

| Work | Where | Cost |
|---|---|---|
| Ephemeris for 3 planets | `framePositions` (once per frame) | < 0.1 ms |
| Sun spots / flares uniforms | `SunActivity` every 0.25 s; flare pulse per frame | tiny |
| CME fronts | `dbmAt()` per mounted CME (≤ 6) | tiny |
| Labels | Text and position written to DOM via refs; declutter by screen distance | ≤ 15 labels |
| React | No setState in `useFrame`, ever | Measured: ~1 commit/s with the scene running |

**Other rendering rules:**

- Logarithmic depth buffer.
- Custom shaders include the logdepth chunks (`materials.ts`).
- `frameloop` is paused while the tab is hidden.
- dpr is capped.
- Reduced motion slows camera moves.

### 5.3 Charts

- uPlot, redrawn at most once per second, with a 6 h window from the live store.
- A shared crosshair (`SYNC_KEY = "hud"`), keyboard reading (← →), and a table view for each chart.
- The X-ray chart is log-scale with C/M/X bands. Wind is four small charts (speed, density, Bz, Newell).
- Palette checked for colour-vision deficiency.

### 5.4 Code splitting

| Chunk | Size (gzip) | Loaded |
|---|---|---|
| `index` (React, router, stream, stores, shell) | 85 kB | Always |
| `SceneCanvas` (three, r3f, drei, shaders) + `ephemeris` (astronomy-engine) | 250 + 21 kB | Live page with WebGL |
| `HudPanels` (uPlot + charts) | 27 kB | Live page |
| `InfoCard` | ~3 kB | First click |
| Earth textures | 384 kB WebP | After the scene; Earth fades in |

**Budget [T3/F4]:** cold load interactive < 2 s on "Fast 3G" with an empty cache, measured by Lighthouse CI. The first paint needs only `index`, which shows cached numbers and the clock while the scene chunk loads.

## 6. Failure handling (FR-9, NFR-7)

| Failure | What the user sees |
|---|---|
| Offline at boot | Cached state with "SAVED" on the clock and the data ages |
| Socket drops | Badge "Reconnecting…", then catches up via `?since` with no reload |
| 3 failed reconnects | Badge "Polling"; numbers keep updating every 30 s |
| Seq gap / bad message | Silent resync (snapshot) |
| Feed stale on the server | Amber age next to its values, FreshnessBadge, `FEED_STALE` alert |
| No WebGL | `SceneFallback`: the same facts as text |
| Scene chunk fails / throws | `SceneBoundary` shows the fallback; the rest of the page keeps working |
| A chart or card throws | `PanelBoundary`: only that panel shows an error |
| IndexedDB blocked | Works without cache; read alerts aren't remembered |
| Notifications blocked / unsupported | The bell explains; toasts and sound still work |

## 7. Accessibility

What is already built:

- Every scene label is a real button (Tab + Enter).
- Charts have keyboard reading and table views.
- Alerts use shape as well as colour, and `role="alert"` for warnings.
- Reduced motion is respected.
- Colour pairs were checked.
- Text equivalents exist for the scene (cards, fallback).

**Planned [F5]:** a WCAG 2.1 AA audit, with a focus on the bell dialog (focus trap and return), the toast focus order, and contrast of muted text on panels.

## 8. Security [X1, X3]

- **No raw HTML from data:** feed text is always rendered as React text. Add ESLint `react/no-danger`.
- **Same-origin API:** no secrets in the bundle.
- **Pages `_headers`:**
  - On `/*`: the CSP from the gap analysis (`connect-src 'self'` covers `wss:` on the same origin in modern browsers; add `wss://<domain>` explicitly for Safari), HSTS, nosniff, `Referrer-Policy`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
  - `/assets/*` immutable; `index.html` `no-cache`.

## 9. Testing

| Level | Now | Planned |
|---|---|---|
| Unit (`node:test`) | 13 files: series, apply, ephemeris, sizes, travel, chartData, format, heliographic, sunActivity, cme, info, freshness, alerts | history parsing, timeline mapping |
| Integration | `stream.test.ts`: LiveStream against the in-process mock with chaos (gap, drop, half-open, polling, cache, alert < 1 s) | Moved into `packages/contract-tests` [T1] |
| End-to-end | Ad hoc Playwright runs during development | `apps/web/e2e/` in CI: boot, big-storm alerts + "Show me", feed-outage stale state, reconnect, phone layout; screenshot diffs with a frozen clock [T2] |
| Performance | React-commit count measured by hand | Lighthouse CI budget; commit-rate test ≤ 2/s [T3] |

## 10. Open decisions

| Decision | Options | Recommendation |
|---|---|---|
| Schema library for runtime validation | zod (bigger, familiar) vs valibot (~1 kB per schema, tree-shaken) | valibot on the client, the same schemas on the server, if bundle size matters; otherwise zod everywhere for one API |
| Sun page | Separate route vs the Live page's Sun view + region list | A region list panel on Live + `/sun` as a deep link to the Sun view, to avoid a second canvas |
| Service worker | Hand-written vs `vite-plugin-pwa` | Hand-written, ~60 lines: app shell cache + `showNotification`; nothing else needs Workbox |
