# System design gap analysis

Checked on 2026-10-05 against the code on `claude/cme-phase3-sun` (commit `c23e3cf`) and the design in this folder.

**Question:** does the design, and what's built so far, follow system-design best practice? Where it doesn't, what should change, and when?

**State of the build:**

- **Done:** the contract (`packages/shared`), physics (`packages/physics`), the mock backend (`apps/mock`), and the frontend through Phase 3 plus Phase 4 alerts (`apps/web`).
- **Not started:** the real backend (`apps/worker`), CI and deployment. The backend findings below are therefore about the **design**; the frontend findings are about **design and code**.

The detailed designs that close these gaps are [frontend/DETAILED_DESIGN.md](frontend/DETAILED_DESIGN.md), [backend/DETAILED_DESIGN.md](backend/DETAILED_DESIGN.md) and [contract/DETAILED_DESIGN.md](contract/DETAILED_DESIGN.md).

## 1. Summary

| Area | Verdict | One line |
|---|---|---|
| Requirements and NFRs | ✅ Strong | Measurable NFRs, a latency budget and a cost budget, all traceable to IDs |
| Architecture | ✅ Strong | Single writer, compute-on-ingest, push not poll, shared read model; the right shape for this problem |
| API and protocol | 🟡 Partial | Versioned paths and sequenced, resumable messages; but no runtime validation and no protocol version on the socket |
| Data model | 🔴 Gap | `schema.sql` has drifted from the contract (alert ids, rules, text, flare fields) |
| Consistency and ordering | ✅ Strong | Monotonic `seq`, gap → resync, idempotent upserts; tested under injected faults |
| Resilience | 🟡 Partial | Excellent on the client; the backend design lacks fetch timeouts, upstream sanity checks and restart rules |
| Scalability and capacity | 🟡 Partial | Fan-out is cheap, but the write budget leaves out `delta_log`, and the reconnect storm after a deploy isn't handled |
| Performance | ✅ / 🟡 | 60 fps design with no per-frame React work; the < 2 s cold load has never been measured on a throttled network |
| Caching | 🟡 Partial | IndexedDB first paint and ETag polling are good; the edge cache on `/history` has no cache-key normalisation, so it would rarely hit |
| Security | 🔴 Gap | No CSP or security headers, WebSocket origin check, rate limiting or input schema |
| Observability | 🔴 Gap | `/health` only: no metrics, structured logs, freshness SLI or client error reports |
| Testing | 🟡 Partial | 78 unit and integration tests, with chaos; but no contract suite the real backend must pass, and no committed end-to-end or visual tests |
| CI/CD and environments | 🔴 Gap | No CI, lint, formatter, staging environment or rollback plan yet (Phase 0) |
| Documentation | 🟡 Partial | Good design docs, but the file layout, stack (pnpm, zod) and schema have drifted from the code; no decision records |
| Accessibility and UX | ✅ / 🟡 | Keyboard reading, tables, reduced motion and shape+colour; no formal WCAG audit; phone notifications need a service worker |

✅ meets best practice · 🟡 partly · 🔴 missing or wrong

## 2. What is already good practice (keep it)

1. **Compute once, on ingest, by a single writer.** One Durable Object polls, computes and stores; every reader gets the same precomputed state (NFR-1, NFR-5, NFR-8). There are no request-time joins, and no fan-in to upstream services per user.
2. **Push with a resumable, ordered log.**
   - Every message carries a strictly increasing `seq`, and `?since=` replays from a delta log.
   - A gap triggers a resync. Upserts are idempotent.
   - This is the standard event-sourced read-model pattern, and `test/stream.test.ts` proves it under latency, drops, skipped messages and HTTP failures.
3. **Snapshot + delta.** A full `LiveState` on connect, then small changes, so bandwidth is proportional to change, not to viewers × state.
4. **Move work to the edge that can do it best.**
   - The server sends only inputs: orbits come from an ephemeris, and CME fronts come from `dbmAt()` in the browser.
   - The same function runs on both sides (`packages/physics`), so the server's ETA and the drawn CME can't disagree.
5. **Graceful degradation.** Cache first paint, then polling fallback, then stale badges, then a WebGL fallback and error boundaries per panel: never a blank screen (FR-9).
6. **Contract first, with a mock.**
   - The frontend was built against a mock with fault injection, so usability and resilience were tested before the backend existed.
   - This is consumer-driven development done right.
7. **Explicit latency and cost budgets** ([TECH_STACK.md](TECH_STACK.md) §2–3) with the free-tier limits named.
8. **Columnar time series** on the wire and in `Float64Array`s on the client: small JSON, fast parse, and zero-copy into uPlot.
9. **Time handled in one convention** (unix seconds UTC everywhere), with a server clock offset (`serverNow`) so client clock skew doesn't matter.

## 3. Gaps and recommendations

Priority: **P0** fix before the backend is built · **P1** before public launch · **P2** after launch.

### 3.1 Data model and contract

| # | Gap | Evidence | Recommendation | P |
|---|---|---|---|---|
| D1 | The DB schema has drifted from the contract | `schema.sql`: `alert.id INTEGER AUTOINCREMENT`, but the contract uses deterministic string ids (`CME_EARTH:<cmeId>`), which de-duplication depends on. The schema has no `title`/`message`; its `rule` comment lists 3 of 6 rules; `flare` lacks `status`, `lat`, `lon`. | Make the contract the source of truth; corrected DDL in [backend/DETAILED_DESIGN.md §4](backend/DETAILED_DESIGN.md#4-storage). Add a test that a row round-trips to the shared type. | P0 |
| D2 | No runtime schema validation | TECH_STACK chooses zod, but none is installed. The client's `isServerMessage` only checks `type`, `seq` and `ts`, so a malformed delta could corrupt the store. Upstream NOAA JSON is not validated in the design either. | One schema per message in `packages/shared` (zod or valibot); see [contract §3](contract/DETAILED_DESIGN.md#3-validation). Validate upstream payloads strictly (reject and flag the feed); validate on the client at the boundary, and drop and resync on failure. | P0 |
| D3 | No protocol version on the socket | `/api/v1` versions REST, but a WS message has no version, and old tabs stay open for days. | Server sends `{type:"hello", protocol: 1, minClient: 1}` first; the client reloads itself (after a cache save) when `minClient` exceeds its own. Additive changes only within a version. | P1 |
| D4 | Contract changes aren't reviewed as such | Fields were added during frontend work (`staleAfterS`, `TEST`) with no changelog. | A `CHANGELOG` section in `packages/shared`, and the contract test suite (T1) gating changes. | P2 |

### 3.2 Resilience and correctness (backend design)

| # | Gap | Recommendation | P |
|---|---|---|---|
| R1 | No fetch timeouts or concurrency limits in the poller design: one hung NOAA request could stall the alarm | `AbortSignal.timeout(8 s)` per fetch; feeds polled with `Promise.allSettled`; each feed has its own failure state and exponential backoff (cap 5 min) | P0 |
| R2 | No upstream sanity checks | Reject GOES fill values (≤ 0 or −99999) and RTSW rows with `active=false`; keep only the newest row per timestamp; mark the feed `error` when its shape changes, keeping the last good value (NFR-7) | P0 |
| R3 | Restart rules not written down | On DO start: `blockConcurrencyWhile` to run migrations and rebuild memory from SQLite; `seq` and the delta are committed in the **same transaction** before broadcast, so a crash can't reuse a seq | P0 |
| R4 | Alarm-stall detection only re-arms | The cron watchdog also records `alarm_lag_s`; over 30 s, it is logged as an error and `/health` turns `degraded` | P1 |
| R5 | Single Durable Object is a single point of failure | Accepted for v1 (the platform restarts DOs in seconds; FR-9 covers the client). Write down the target: RTO < 1 min, RPO = last committed tick. The Oracle fallback must be a tested runbook, not just a paragraph | P1 |
| R6 | Alert evaluation lacks hysteresis rules in the design | The mock has them (Bz: 3 points ≤ −10 nT to raise, 10 points > −5 nT to clear); copy these into the backend design as the spec ([backend §6](backend/DETAILED_DESIGN.md#6-alert-engine)) | P0 |

### 3.3 Scalability and cost

| # | Gap | Recommendation | P |
|---|---|---|---|
| S1 | **Write budget omits `delta_log`.** Every delta is a row write, and pruning it is another. One delta per tick (every 5 s) would be 17k + 17k a day; one per second, 86k + 86k, over the 100k free cap | Emit a delta only when something changed (in practice ~3/min, about 4k a day). Keep the 1 h replay log as an **in-memory ring**, persisting only `seq`. After a restart, clients resync with a snapshot, which is cheap. See [backend §4.3](backend/DETAILED_DESIGN.md#43-what-is-persisted-and-what-isnt) | P0 |
| S2 | Reconnect storm after a deploy or restart: every socket drops at once | The client already uses jittered backoff (base 500 ms); also spread the first retry over 0–3 s after a server-initiated close (close code 1012), and serve `/state` from a cached serialised string | P1 |
| S3 | Broadcast cost | Serialise each message **once** and send the same string to every socket. Count sockets; above a limit (start at 5,000), new connections get a 1013 close and the client falls back to polling | P1 |
| S4 | Slow consumers | Workers can't read `bufferedAmount`; drop a socket that hasn't answered a ping for 45 s (the client already drops sockets silent for 40 s) | P2 |
| S5 | Only one load test is planned, at the end | Run a 1,000-socket test in Phase 1, as soon as the stream works, so the free-tier assumptions are checked early | P1 |

### 3.4 Caching

| # | Gap | Recommendation | P |
|---|---|---|---|
| C1 | `/history?from&to` is edge-cached, but every client asks for different seconds, so it would almost never hit | Snap `from`/`to` to the resolution bucket (1 min / 5 min) on the client **and** reject unsnapped values on the server; cache key = path + snapped query; `Cache-Control: public, s-maxage=60`; past-only ranges (to < now − 1 h) get `max-age=86400, immutable` | P1 |
| C2 | `/state` has no conditional GET | `ETag: "<seq>"`; `If-None-Match` → 304. Helps the polling fallback | P2 |
| C3 | Static assets | Hashed file names are already immutable; add `Cache-Control: immutable` for `/assets/*` and `no-cache` for `index.html` in Pages `_headers` | P1 |

### 3.5 Security

The site is public and read-only, with no accounts, so the risks are abuse, injection into the page, and the NASA key.

| # | Gap | Recommendation | P |
|---|---|---|---|
| X1 | No security headers | Pages `_headers`: a CSP of `default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'` (React inline styles), plus `frame-ancestors 'none'`, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy` | P1 |
| X2 | No WebSocket origin check or rate limit | Reject `Origin` not in an allow-list; one Cloudflare rate-limiting rule (free) on `/api/v1/stream` and `/history` per IP | P1 |
| X3 | Upstream text reaches the UI | Region and CME notes are rendered as text by React (safe today); keep it that way: never `dangerouslySetInnerHTML` for feed data. Lint rule `react/no-danger` | P1 |
| X4 | Secrets | `NASA_API_KEY` as a Worker secret (planned). Never in the client, logs or `/health` errors (strip query strings from logged URLs) | P0 |
| X5 | Mock control endpoints | `/mock/*` exist only in the mock; the Worker must not include them. A contract test asserts `POST /mock/reset` → 404 on the real backend | P1 |
| X6 | Dependency hygiene | `npm audit` in CI; Dependabot or Renovate weekly | P1 |

### 3.6 Observability

| # | Gap | Recommendation | P |
|---|---|---|---|
| O1 | NFR-2 (freshness ≤ 5 s beyond cadence) is not measured anywhere | Per feed, record `ingest_lag = ingestedAt − (dataTs + cadence)` and `push_lag`; expose p50/p95 over the last hour in `/health`; the client reports its own receive lag in `/status` | P0 |
| O2 | No metrics or structured logs | JSON logs, one line per tick (`feed`, `status`, `ms`, `bytes`, `304`); counters to Workers Analytics Engine (free): sockets, deltas/min, alarm lag, errors | P1 |
| O3 | No SLOs or alerting | SLIs: freshness p95, `/health` uptime, alarm lag. Alerts: an UptimeRobot check on `/health` (planned) **plus** a check that `health.feeds[*].stale == false` | P1 |
| O4 | Client errors are invisible | `window.onerror` + error boundaries → `POST /api/v1/telemetry` (sampled, no PII); or a free Sentry tier | P2 |

### 3.7 Testing

| # | Gap | Recommendation | P |
|---|---|---|---|
| T1 | **No contract suite the real backend must pass.** The mock's tests and the client's stream tests run only against the mock | Move the protocol tests into `packages/contract-tests`, parameterised by `BASE_URL`; run them against the mock and the Worker (`wrangler dev`) in CI. The backend is "done" when this suite passes | P0 |
| T2 | Browser checks were run ad hoc (Playwright scripts in a scratch folder) | Commit `apps/web/e2e/` with Playwright: boot, scenarios (big-storm alerts, feed-outage stale state), reconnect, phone layout; screenshot diffs for the scene with a fixed clock | P1 |
| T3 | No performance regression check | Lighthouse CI on the built site (budget: main JS ≤ 100 kB gzipped, LCP < 2 s on "Fast 3G"); the React-commit counter used during development as a test (≤ 2 commits/s with the scene running) | P1 |
| T4 | Physics accuracy only spot-checked | Add golden tests against a published DONKI event (the Phase 3 "done when") and JPL Horizons positions (NFR-6 < 0.1°) | P1 |

### 3.8 Delivery

| # | Gap | Recommendation | P |
|---|---|---|---|
| CD1 | No CI, linter or formatter | GitHub Actions: `typecheck`, ESLint (typescript-eslint, react-hooks), Prettier check, tests, build, contract suite; required on PRs | P0 |
| CD2 | No staging environment | Two Wrangler environments (`staging`, `production`), each with its own DO namespace; Pages preview deployments per PR, pointed at staging | P1 |
| CD3 | No rollback plan | `wrangler rollback` for the Worker, Pages "rollback to deployment"; schema migrations are forward-only and additive, so a rollback never needs a down-migration | P1 |
| CD4 | Dead code and legacy | `server.py`, the root `index.html` and `legacy/` predate this design; remove them or move them under `docs/` once `/guide` is served | P2 |

### 3.9 Frontend-specific

| # | Gap | Recommendation | P |
|---|---|---|---|
| F1 | Background notifications fail on Android Chrome, where `new Notification()` is not allowed from a page; only a service worker can show one | Add a minimal service worker (also gives an offline app shell): `registration.showNotification()` when available; the current try/catch already falls back to the toast | P1 |
| F2 | No-lag rule 4 (parse history in a Web Worker) isn't built yet | Build it with Replay: `history.worker.ts` turns JSON into `Float64Array`s and transfers them | P1 (with Replay) |
| F3 | Store updates aren't validated (see D2) | Validate at the edge of `stream/client.ts` | P0 |
| F4 | Cold-load budget unmeasured | The main chunk is 256 kB (85 kB gzipped) and the scene chunk 924 kB (250 kB gzipped, lazy). Measure with Lighthouse (T3); if needed, split React Router and the stream client into separate chunks | P1 |
| F5 | No formal accessibility audit | WCAG 2.1 AA pass on the Live page with the panels, info card, toasts and bell; the scene already has text equivalents (cards, tables) | P1 |

### 3.10 Documentation

| # | Gap | Recommendation | P |
|---|---|---|---|
| DOC1 | Design and code have drifted | TECH_STACK says pnpm and zod (npm is used, zod isn't installed); the frontend README lists `SunspotLayer`, `FlareMarkers`, `cmeFront.ts`, `history.ts` (built as `SunActivity`, `lib/cme.ts`; `history.ts` not yet); the backend layout still shows `packages/protocol`. The detailed designs here describe the code as it is; update the three READMEs to link to them | P1 |
| DOC2 | No decision records | Short ADRs in `docs/design/adr/` for the decisions that are hard to undo: one DO as single writer; DO SQLite; physics shared with the client; snapshot+delta over WS; frontend-first with a mock | P2 |
| DOC3 | No runbook | `docs/ops/RUNBOOK.md`: feed down, alarm stalled, 1027 errors, NOAA URL change, moving to the Oracle fallback | P1 |

## 4. What to do, in order

**Before writing backend code (P0):**

1. D1 schema matches the contract.
2. D2/F3 schemas in `packages/shared`, validated at both edges.
3. T1 contract test package.
4. CD1 CI with lint and tests.
5. S1 delta log in memory.
6. R1–R3 and R6 written into the backend design (done in [backend/DETAILED_DESIGN.md](backend/DETAILED_DESIGN.md)).
7. O1 freshness measured.
8. X4 secret handling.

**Before launch (P1):**

- Security headers, origin check and rate limit.
- `/history` cache keys.
- Hello/protocol version.
- Reconnect-storm spread.
- Early load test.
- Staging and rollback.
- Service worker for notifications.
- Playwright and Lighthouse in CI.
- WCAG audit.
- Runbook.
- Docs synced.

**After launch (P2):** conditional `/state`, client telemetry, contract changelog, ADRs, legacy clean-up, slow-consumer handling.
