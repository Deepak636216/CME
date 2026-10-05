# P1 gaps: fix before public launch

From the [gap analysis](GAP_ANALYSIS.md) (2026-10-05, commit `c23e3cf`). See also [P0](GAPS_P0.md) and [P2](GAPS_P2.md).

**Why before launch:** none of these block building the backend, but each one matters once strangers use the site. They cover abuse and injection, surviving a deploy with every socket open, knowing when it's broken, and being able to roll back.

**26 items.** IDs match the gap analysis.

## Launch checklist at a glance

| Theme | Items |
|---|---|
| Security | X1 headers · X2 origin check and rate limit · X3 no raw HTML · X5 no mock endpoints · X6 dependency hygiene |
| Protocol and resilience | D3 hello/protocol version · R4 alarm lag · R5 RTO/RPO and fallback runbook |
| Scale | S2 reconnect storm · S3 broadcast cost · S5 early load test |
| Caching | C1 `/history` cache keys · C3 static asset headers |
| Observability | O2 metrics and logs · O3 SLOs and alerting |
| Testing | T2 Playwright · T3 Lighthouse · T4 physics golden tests |
| Delivery | CD2 staging · CD3 rollback |
| Frontend | F1 service worker · F2 history worker · F4 cold load · F5 WCAG audit |
| Docs | DOC1 docs synced · DOC3 runbook |

## Protocol and contract

### D3. Protocol version on the socket

- [ ] **Gap:** `/api/v1` versions REST, but WebSocket messages carry no version, and old tabs stay open for days.
- **Do:**
  - The server sends `{type:"hello", protocol: 1, minClient: 1}` first.
  - The client reloads itself (after saving its cache) when `minClient` exceeds its own version.
  - Only additive changes are allowed within a version.
- **Done when:** a test with `minClient` raised shows an old client saving its cache and reloading.

## Resilience

### R4. Alarm-stall detection

- [ ] **Gap:** the watchdog only re-arms a stalled alarm.
- **Do:** the cron watchdog also records `alarm_lag_s`. Over 30 s, it logs an error and `/health` turns `degraded`.

### R5. Single Durable Object as a single point of failure

- [ ] **Gap:** accepted for v1 (the platform restarts DOs in seconds, and FR-9 covers the client), but the targets aren't written down.
- **Do:** write down the targets: RTO < 1 min, RPO = the last committed tick. Turn the Oracle fallback into a tested runbook, not just a paragraph.

## Scalability

### S2. Reconnect storm after a deploy or restart

- [ ] **Gap:** every socket drops at once.
- **Do:**
  - The client already uses jittered backoff (base 500 ms). After a server-initiated close (code 1012), it should also spread its first retry over 0–3 s.
  - Serve `/state` from a cached serialised string.

### S3. Broadcast cost

- [ ] **Do:**
  - Serialise each message **once** and send the same string to every socket.
  - Count sockets. Above a limit (start at 5,000), close new connections with 1013, and the client falls back to polling.

### S5. Early load test

- [ ] **Gap:** only one load test is planned, at the end.
- **Do:** run a 1,000-socket test in Phase 1, as soon as the stream works, to check the free-tier assumptions early.

## Caching

### C1. `/history` cache keys

- [ ] **Gap:** `/history?from&to` is edge-cached, but every client asks for different seconds, so the cache would almost never hit.
- **Do:**
  - Snap `from` and `to` to the resolution bucket (1 min or 5 min) on the client, **and** reject unsnapped values on the server.
  - Cache key = path + snapped query.
  - `Cache-Control: public, s-maxage=60`.
  - Ranges entirely in the past (`to < now − 1 h`) get `max-age=86400, immutable`.

### C3. Static asset headers

- [ ] **Do:** hashed file names are already immutable. In Pages `_headers`, add `Cache-Control: immutable` for `/assets/*` and `no-cache` for `index.html`.

## Security

The site is public and read-only, with no accounts, so the risks are abuse, injection into the page, and the NASA key (that one is [P0 X4](GAPS_P0.md#x4-secret-handling)).

### X1. Security headers

- [ ] **Do:** in Pages `_headers`:
  - A CSP of `default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'` (React inline styles).
  - `frame-ancestors 'none'`.
  - HSTS.
  - `X-Content-Type-Options: nosniff`.
  - `Referrer-Policy: strict-origin-when-cross-origin`.
  - `Permissions-Policy`.

### X2. WebSocket origin check and rate limit

- [ ] **Do:** reject an `Origin` that isn't in an allow-list. Add one Cloudflare rate-limiting rule (free) per IP on `/api/v1/stream` and `/history`.

### X3. Upstream text reaches the UI

- [ ] **Do:** region and CME notes are rendered as text by React, which is safe today. Keep it that way: never use `dangerouslySetInnerHTML` for feed data, and enforce it with the lint rule `react/no-danger`.

### X5. Mock control endpoints

- [ ] **Do:** `/mock/*` exists only in the mock, and the Worker must not include it. A contract test asserts that `POST /mock/reset` returns 404 on the real backend.

### X6. Dependency hygiene

- [ ] **Do:** run `npm audit` in CI, and set up weekly Dependabot or Renovate.

## Observability

### O2. Metrics and structured logs

- [ ] **Do:**
  - JSON logs, one line per tick (`feed`, `status`, `ms`, `bytes`, `304`).
  - Counters to Workers Analytics Engine (free): sockets, deltas per minute, alarm lag, errors.

### O3. SLOs and alerting

- [ ] **Do:**
  - **SLIs:** freshness p95, `/health` uptime, alarm lag.
  - **Alerts:** an UptimeRobot check on `/health` (planned), **plus** a check that `health.feeds[*].stale == false`.

## Testing

### T2. Committed end-to-end tests

- [ ] **Gap:** browser checks were run ad hoc, with Playwright scripts in a scratch folder.
- **Do:** commit `apps/web/e2e/` with Playwright tests for boot, the scenarios (big-storm alerts, the stale state during a feed outage), reconnect and the phone layout. Add screenshot diffs of the scene with a fixed clock.

### T3. Performance regression check

- [ ] **Do:**
  - Lighthouse CI on the built site. Budget: main JS ≤ 100 kB gzipped, LCP < 2 s on "Fast 3G".
  - Turn the React-commit counter used during development into a test: ≤ 2 commits/s with the scene running.

### T4. Physics accuracy

- [ ] **Gap:** physics accuracy has only been spot-checked.
- **Do:** add golden tests against a published DONKI event (the Phase 3 "done when") and against JPL Horizons positions (NFR-6: < 0.1°).

## Delivery

### CD2. Staging environment

- [ ] **Do:** two Wrangler environments (`staging`, `production`), each with its own DO namespace. Pages preview deployments per PR, pointed at staging.

### CD3. Rollback plan

- [ ] **Do:** `wrangler rollback` for the Worker and "rollback to deployment" for Pages. Schema migrations are forward-only and additive, so a rollback never needs a down-migration.

## Frontend

### F1. Service worker for notifications

- [ ] **Gap:** background notifications fail on Android Chrome, which doesn't allow `new Notification()` from a page. Only a service worker can show one.
- **Do:** add a minimal service worker, which also gives an offline app shell. Use `registration.showNotification()` when it's available; the current try/catch already falls back to the toast.

### F2. Parse history in a Web Worker (with Replay)

- [ ] **Gap:** no-lag rule 4 isn't built yet.
- **Do:** build it with Replay: `history.worker.ts` turns the JSON into `Float64Array`s and transfers them.

### F4. Cold-load budget

- [ ] **Gap:** the < 2 s cold load has never been measured. The main chunk is 256 kB (85 kB gzipped) and the lazy scene chunk 924 kB (250 kB gzipped).
- **Do:** measure with Lighthouse (T3). If needed, split React Router and the stream client into separate chunks.

### F5. Accessibility audit

- [ ] **Do:** a WCAG 2.1 AA pass on the Live page, covering the panels, info card, toasts and bell. The scene already has text equivalents (cards, tables).

## Documentation

### DOC1. Design and code have drifted

- [ ] **Gap:**
  - TECH_STACK says pnpm and zod, but npm is used and zod isn't installed.
  - The frontend README lists `SunspotLayer`, `FlareMarkers`, `cmeFront.ts` and `history.ts`. The code has `SunActivity` and `lib/cme.ts` instead, and `history.ts` isn't built yet.
  - The backend layout still shows `packages/protocol`.
- **Do:** the detailed designs describe the code as it is. Update the three READMEs to link to them.

### DOC3. Runbook

- [ ] **Do:** write `docs/ops/RUNBOOK.md` covering: a feed is down, the alarm has stalled, 1027 errors, a NOAA URL change, and moving to the Oracle fallback.
