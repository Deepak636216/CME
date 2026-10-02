# Tech Stack & Free Deployment

Goal from [SCOPE.md](../SCOPE.md): **always computing, no lag, $0 hosting.**

## 1. Chosen stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** everywhere | One language; physics + message types shared by backend and frontend |
| Repo | pnpm workspaces monorepo | `apps/web`, `apps/worker`, `packages/*` |
| Backend runtime | **Cloudflare Workers** | Runs at the edge, free, no cold-start sleep for our pattern |
| Always-on compute | **One Durable Object** (`SpaceWeatherHub`) with an **alarm** every ~5 s | The alarm keeps the loop running with no user present (NFR-1) |
| Watchdog | Cron Trigger `* * * * *` | Re-arms the alarm if it ever stops |
| HTTP router | **Hono** | Tiny, fast, built for Workers |
| Live push | **Hibernatable WebSockets** on the DO | Server → browser push in < 1 s; idle sockets cost nothing |
| Database | **SQLite inside the DO** (`ctx.storage.sql`) | Same process as the compute → no network hop; 5 GB free |
| Hot cache | In-memory LiveState + ring buffers in the DO | Requests never touch the DB (NFR-5) |
| Validation | zod | One schema for WS messages, checked on both ends |
| Frontend build | **Vite + React 18** | Fast build, small bundle |
| 3D | **three.js** via `@react-three/fiber` + `drei` | WebGL scene at 60 fps (NFR-4) |
| Ephemeris | **astronomy-engine** | Planet positions in the browser, every frame, no network |
| Charts | **uPlot** | ~50 KB, draws 10k points in a few ms (Plotly is too heavy for live) |
| State | **Zustand** | 3D loop reads with `getState()` → no React re-render per frame |
| Routing | React Router | `/`, `/sun`, `/replay`, `/events`, `/status` |
| Local cache | IndexedDB (`idb-keyval`) | Paint last state instantly on reload |
| Frontend host | **Cloudflare Pages** | Unlimited static bandwidth, free |
| CI/CD | GitHub Actions → `wrangler deploy` | Free for public repos |
| Local dev | `wrangler dev` + `vite` | Replaces `server.py` |

## 2. Free hosting research (checked 2026-10-02)

The hard requirement is a backend that **never sleeps** and can **push** updates.

| Host | Free tier | Always on? | Verdict |
|---|---|---|---|
| **Cloudflare Workers + Durable Objects** | 100k req/day · DO 13,000 GB-s/day · SQLite 5M reads / 100k writes per day · cron every 1 min · no card | **Yes** (alarm-driven) | **Primary** |
| Oracle Cloud Always Free (ARM VM) | 4 OCPU / 24 GB RAM · 10 TB egress/month · card at signup | Yes (real VM) | **Fallback**. Idle VMs can be reclaimed, and capacity is often short. |
| Render free | 750 h/month | No: sleeps after 15 min idle | ✗ |
| Koyeb free | 1 small service | No: scales to zero after 1 h | ✗ |
| Fly.io / Railway | No free tier now (trial only) | — | ✗ |
| Google Cloud Run | ~360k vCPU-s/month | No: always-on needs ~2.6M | ✗ |
| Hugging Face Spaces | CPU basic | No: paused after 48 h without visitors | ✗ |
| GitHub Actions cron | — | No: 5 min minimum, often delayed | ✗ |

| Database option | Verdict |
|---|---|
| **DO SQLite** | ✔ zero latency, inside the compute |
| Supabase free | ✗ project paused after 1 week inactive |
| Neon free | ✗ scales to zero; per-minute writes burn CU-hours |
| Turso free | OK as an external DB, but adds a network hop |
| Upstash Redis free | ✗ 500k commands/month is too few |

| Frontend host | Verdict |
|---|---|
| **Cloudflare Pages** | ✔ unlimited static bandwidth |
| GitHub Pages | OK (100 GB/month soft limit) |
| Vercel Hobby / Netlify free | Bandwidth caps, non-commercial only |

### Budget check at 1,000 concurrent viewers

| Resource | Our use / day | Free cap / day |
|---|---|---|
| Worker + DO requests | ~17k alarm ticks + a few thousand WS connects and history calls | 100k |
| DO duration | at most 11,059 GB-s if awake all day | 13,000 |
| SQLite row writes | ~4–8k | 100k |
| SQLite row reads | cold start only (requests are served from memory) | 5M |
| Outbound to browsers | not metered | — |

**Main risk:** a traffic spike over 100k requests/day returns error 1027. To avoid it, static files come from Pages (they don't count against the limit), `/history` is edge-cached for 60 s, and WebSockets are used instead of polling.

## 3. Latency budget (NFR-2: ≤ 5 s beyond the source cadence)

| Step | Time |
|---|---|
| NOAA publishes a new minute | t = 0 |
| Adaptive poll notices it (5 s polling in the expected update window) | ≤ 5 s |
| Fetch + parse (304 when nothing changed) | 0.2–0.5 s |
| Compute + write + build delta | < 50 ms |
| WebSocket push to browser | < 300 ms |
| Apply to store + next frame | < 16 ms |
| **Total** | **≈ 1–6 s** |

NOAA feeds support `ETag` / `If-None-Match` and answer `304`, which makes 5 s polling cheap (checked 2026-10-02). The RTSW wind feed is 2.8 MB, so it is downloaded only when it changes: about once a minute.

## 4. Fallback (if Cloudflare limits are ever hit)

Use the same TypeScript code on an **Oracle A1 VM**: Node 22 + Hono + `better-sqlite3` + `ws` behind Caddy (automatic HTTPS). The frontend stays on Pages. The `hub/` module is written against a small `Storage` and `Sockets` interface, so moving hosts means swapping the adapter, not rewriting the logic.

Sources: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) · [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) · [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/) · [Cron triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) · [Pages limits](https://developers.cloudflare.com/pages/platform/limits/) · [Render free](https://render.com/docs/free) · [Koyeb scale-to-zero](https://www.koyeb.com/docs/run-and-scale/scale-to-zero) · [Fly pricing](https://docs.fly.io/about/pricing) · [Cloud Run pricing](https://cloud.google.com/run/pricing) · [Supabase](https://supabase.com/pricing) · [Neon](https://neon.com/pricing) · [Turso](https://turso.tech/pricing)

> Not fully verified: Oracle's official free-tier page could not be fetched (its limits come from secondary sources), and Cloudflare does not document a maximum number of WebSockets per DO. Load-test 1,000 sockets in Phase 1.
