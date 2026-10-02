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
| `npm run typecheck` | All packages, this app included |

## Layout

```
src/
  main.tsx, router.tsx     routes: / /sun /replay /events /events/:kind/:id /status
  shell/                   AppShell, TopBar (ConnectionBadge, AlertToaster… next)
  pages/                   one file per route; most are placeholders until their phase
  lib/api.ts               getJson(), serverNow() (data time comes from the server clock)
```

Still to come (folders are created when their first file lands): `stream/` (useLiveStream), `store/` (Zustand), `scene/` (r3f), `hud/` (uPlot charts).

## Status

- [x] Step 1: scaffold, routes, dev proxy to the mock, `/status` page reading `GET /api/v1/health`
- [ ] Step 2: Zustand store + `useLiveStream`
- [ ] Step 3: ConnectionBadge + FreshnessBadge
- [ ] Step 4: 3D scene (Sun, Mercury, Venus, Earth, L1)
- [ ] Step 5: XrayChart + WindPanel
