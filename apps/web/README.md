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
```

Still to come: `scene/` (r3f), `hud/` charts (uPlot).

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
- [ ] Step 4: 3D scene (Sun, Mercury, Venus, Earth, L1)
- [ ] Step 5: XrayChart + WindPanel
