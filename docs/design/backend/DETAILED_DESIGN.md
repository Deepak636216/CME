# Backend detailed design

Builds on [README.md](README.md) (use cases, endpoints, component sketch) and [../TECH_STACK.md](../TECH_STACK.md). It closes the backend gaps in [../GAP_ANALYSIS.md](../GAP_ANALYSIS.md); gap ids are shown in brackets, e.g. [S1].

**Status:** not built. The mock (`apps/mock`) implements the same contract and is the reference behaviour; where this design and the mock agree, the mock's tests are the spec.

## 1. Responsibilities

| The backend does | It does not |
|---|---|
| Poll NOAA and NASA once for everyone, on each feed's cadence | Compute anything per request |
| Normalise, validate and store samples and events | Compute positions of planets or CME fronts per frame (the browser does) |
| Detect flares, attach them to regions, forecast CME arrival (DBM), compute Newell coupling | Keep per-user state (no accounts in v1) |
| Raise and clear alerts with de-duplication and hysteresis | Send email, SMS or push (out of scope) |
| Push one ordered stream of changes to every browser; replay what a reconnecting browser missed | Serve the static site (Cloudflare Pages does) |
| Answer history and event queries | |

## 2. Runtime topology

```
                 ┌──────────────── Cloudflare ────────────────────────────────────────────┐
 Browser ──HTTPS─┤ Pages (static, hashed assets)                                          │
    │            │                                                                        │
    └──/api/v1 ──┤ Worker (Hono router) ── stub.fetch() ──► SpaceWeatherHub (1 Durable Object)
                 │   • rate-limit rule (WAF)                 • alarm loop (every ≤5 s)   │
                 │   • edge cache for /history               • memory: LiveState + rings │
                 │                                           • SQLite (ctx.storage.sql)  │
                 │ Cron trigger (every minute) ──► hub.watchdog()   • WebSockets (hibernatable)
                 └───────────────────────────────────────────────┬────────────────────────┘
                                                                 │ fetch, If-None-Match
                                                  NOAA SWPC JSON · NASA DONKI
```

- **One Durable Object, named `"hub"`** (`idFromName("hub")`), with `locationHint: "enam"` so it runs near NOAA's US-east servers. It is the **single writer**: every poll, computation, write and broadcast happens on its one thread, so there are no races to design around.
- **The Worker is stateless.** It routes, validates query parameters, applies the edge cache, and forwards to the DO. It never polls.
- **Two environments**, `staging` and `production`, each with its own DO namespace and secrets [CD2].

## 3. Components

```
apps/worker/src/
  index.ts              Worker entry: fetch() → Hono app; scheduled() → hub.watchdog()
  routes.ts             /api/v1/* routes; query validation (shared schemas); edge cache for /history
  security.ts           Origin allow-list for /stream, security headers on API responses
  hub/
    SpaceWeatherHub.ts  the Durable Object: constructor (restore), alarm(), fetch(), webSocket* handlers
    scheduler.ts        per-feed due times, adaptive windows, backoff after failures
    feeds.ts            feed table (§5.1): URL, cadence, staleAfter, parser
    pollers.ts          fetchFeed(): timeout, ETag, size cap, status → FeedResult
    normalize/          goesXray.ts, goesFlares.ts, rtsw.ts, regions.ts, donki.ts   (JSON → rows, validated)
    compute/
      flares.ts         flare lifecycle from flare list + live flux; region attach
      cmes.ts           Earth-directed test + DBM forecast (packages/physics)
      wind.ts           Newell per row (packages/physics)
      alerts.ts         rule evaluation, hysteresis, de-dup (§6)
    state.ts            in-memory LiveState, ring buffers, delta builder
    deltaLog.ts         in-memory ring of the last hour of sequenced messages
    repo.ts             SQLite: migrations, upserts, queries, pruning
    sockets.ts          accept, hello, broadcast-once, close codes
    metrics.ts          counters + structured log lines (§9)
  migrations/           0001_init.sql, 0002_… (forward-only, additive)
```

Hosting adapter: `hub/` depends only on two small interfaces, `Storage` (SQL exec/query) and `Sockets` (accept/send/list). They are implemented for Durable Objects now and for Node (`better-sqlite3` + `ws`) for the Oracle fallback ([TECH_STACK §4](../TECH_STACK.md#4-fallback-if-cloudflare-limits-are-ever-hit)).

## 4. Storage

### 4.1 Schema (corrected to match the contract) [D1]

Source of truth for shapes is `packages/shared`; the table columns map one-to-one to its fields. Times are unix seconds UTC. This replaces [schema.sql](schema.sql), which is updated to match.

```sql
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);           -- schema_v, seq, alarm_last_at

CREATE TABLE feed_status (
  feed_id     TEXT PRIMARY KEY,          -- FeedId: goes_xray | goes_flares | rtsw | regions | donki
  etag        TEXT,
  last_ok_at  INTEGER,
  data_ts     INTEGER,                   -- newest data time in the feed
  error       TEXT,                      -- last error, URL query string stripped [X4]
  fail_count  INTEGER NOT NULL DEFAULT 0 -- consecutive failures (drives backoff)
);

CREATE TABLE xray_sample (ts INTEGER PRIMARY KEY, flux_long REAL, flux_short REAL, satellite INTEGER) WITHOUT ROWID;

CREATE TABLE wind_sample (
  ts INTEGER PRIMARY KEY, speed REAL, density REAL, temperature REAL,
  bx REAL, by REAL, bz REAL, bt REAL, newell REAL
) WITHOUT ROWID;

CREATE TABLE sunspot_region (
  region_no INTEGER NOT NULL, observed_on TEXT NOT NULL,          -- YYYY-MM-DD
  lat REAL, lon REAL, location TEXT,                              -- lon at observed time (rotated on read)
  area_msh INTEGER, mag_class TEXT, spot_count INTEGER, p_m INTEGER, p_x INTEGER,
  PRIMARY KEY (region_no, observed_on)
) WITHOUT ROWID;

CREATE TABLE flare (
  id TEXT PRIMARY KEY,                   -- begin time ISO from GOES, stable
  begin_at INTEGER NOT NULL, peak_at INTEGER, end_at INTEGER,
  cls TEXT NOT NULL, peak_flux REAL NOT NULL,
  status TEXT NOT NULL,                  -- rising | decaying | ended
  region_no INTEGER, lat REAL, lon REAL
);
CREATE INDEX flare_begin ON flare(begin_at);

CREATE TABLE cme (
  id TEXT PRIMARY KEY,                   -- DONKI activity id
  launch_at INTEGER NOT NULL,            -- time at 21.5 Rs
  speed REAL NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, half_angle REAL NOT NULL,
  earth_directed INTEGER NOT NULL, flare_id TEXT, updated_at INTEGER NOT NULL
);
CREATE INDEX cme_launch ON cme(launch_at);

CREATE TABLE cme_forecast (
  cme_id TEXT PRIMARY KEY REFERENCES cme(id),
  computed_at INTEGER NOT NULL, eta INTEGER, arrival_speed REAL, gamma REAL NOT NULL, w REAL NOT NULL
);

CREATE TABLE alert (
  id TEXT PRIMARY KEY,                   -- deterministic: "<RULE>:<refId>", the de-dup key
  rule TEXT NOT NULL,                    -- FLARE_M | FLARE_X | CME_EARTH | BZ_SOUTH | FEED_STALE | TEST
  level TEXT NOT NULL,                   -- watch | warning
  title TEXT NOT NULL, message TEXT NOT NULL,
  ref_type TEXT NOT NULL, ref_id TEXT NOT NULL,
  raised_at INTEGER NOT NULL, cleared_at INTEGER
);
CREATE INDEX alert_raised ON alert(raised_at);
```

Changes from the old file:

- `alert.id` is the deterministic string, with `title` and `message` added.
- `flare` gains `status`, `lat` and `lon`.
- `feed_status` gains `fail_count`.
- `delta_log` is removed (see §4.3).
- Sample tables are `WITHOUT ROWID`: one B-tree per table, which means fewer row writes.

### 4.2 Migrations

- `meta.schema_v` holds the applied version. On start, inside `blockConcurrencyWhile`, the DO applies each pending `migrations/NNNN_*.sql` in one transaction.
- Migrations are **forward-only and additive** (new tables, new nullable columns). A rollback of the code never needs a down-migration [CD3].
- A test rebuilds the DB from all migrations and checks that every table round-trips to the shared types.

### 4.3 What is persisted and what isn't [S1, R3]

| Data | Where | Why |
|---|---|---|
| Samples, regions, flares, CMEs, forecasts, alerts, feed status | SQLite | Survive restarts; needed for `/history`, `/events` and rebuilding memory |
| `seq` | SQLite `meta`, written in the **same transaction** as the tick's data | A crash can never reuse a seq for different content |
| LiveState (6 h series window, lists, feeds) | Memory, rebuilt from SQLite on start | Every read is served from memory (NFR-5) |
| 7-day series at 1 min | Memory rings (2 × 10,080 rows × 9 columns ≈ 1.5 MB as Float64Array) | `/history` without DB reads |
| Delta log (last hour of sequenced messages) | **Memory ring only** | Persisting it would cost one write per delta plus one per prune. After a restart the ring is empty, so a client asking `?since=` gets a snapshot, which is correct and cheap |

Write budget with this design: about 2,900 sample rows/day + ~100 events + ~300 feed-status updates + prunes (~2,900) ≈ **6–7k row writes/day** against the 100k free cap. Index updates may count as extra row writes; check the Cloudflare billing docs and keep secondary indexes to the three above.

### 4.4 Retention (UC9)

Run as part of the tick **once an hour**, in batches of ≤ 1,000 rows:

- samples: older than 7 days
- regions: `observed_on` older than 30 days
- flares, CMEs and forecasts: older than 30 days
- alerts: cleared more than 30 days ago

## 5. The live loop

### 5.1 Feeds

| FeedId | URL (NOAA SWPC unless noted) | Normal cadence | Fast window | staleAfter |
|---|---|---|---|---|
| `goes_xray` | `json/goes/primary/xrays-6-hour.json` | 60 s | 5 s from :55 to :20 past each minute | 300 s |
| `goes_flares` | `json/goes/primary/xray-flares-latest.json` (+ `-7-day` every 10 min) | 60 s | 5 s while a flare is rising | 600 s |
| `rtsw` | `json/rtsw/rtsw_wind_1m.json`, `rtsw_mag_1m.json` | 60 s | 5 s window as for X-rays | 300 s |
| `regions` | `json/solar_regions.json` | 30 min | — | 3 h |
| `donki` | `api.nasa.gov/DONKI/CMEAnalysis?startDate=<−7 d>&mostAccurateOnly=true` | 5 min | — | 1 h |

These cadences and thresholds match `FEEDS` in `apps/mock/src/engine.ts`, which the frontend already uses.

### 5.2 One tick (`alarm()`)

```
alarm():
  now = Date.now()/1000
  due = scheduler.due(now)                                   # feeds whose next time ≤ now
  results = await Promise.allSettled(due.map(pollFeed))      # in parallel, each with an 8 s timeout [R1]
  d = new Delta()
  for r in results: normalize → validate → diff against memory → append/upsert into d   [R2]
  compute(d): flare lifecycle, region attach, Newell on new wind rows, CME forecasts
  alerts.evaluate(state, d) → new alerts list + cleared alerts into d.alerts            [R6]
  feeds: refresh FeedStatus; changed ones into d.feeds
  if d is empty and no new alerts: schedule next alarm; return                          [S1]
  sql.transaction:
     upsert rows; seq += 1 per message; meta.seq = seq                                  [R3]
  messages = [delta(seq₁, d), alert(seq₂, a₁), …]
  deltaLog.push(messages); sockets.broadcast(messages)   # each serialised once          [S3]
  metrics.tick(...)                                                                      [O1, O2]
  setAlarm(min(scheduler.next(), now + 5 s))
  (once an hour: prune)
```

**`pollFeed(feed)`:**

1. `fetch(url, { headers: { "If-None-Match": etag }, signal: AbortSignal.timeout(8000) })`.
2. A `304` means unchanged: update `last_ok_at`.
3. A `200` reads at most 5 MB (RTSW is ~2.8 MB), then parses JSON. Only rows newer than the newest stored `ts` are normalised.
4. On error (status, timeout, parse or validation): set `error`, increment `fail_count`, and back off at `cadence × 2^fail_count`, capped at 5 min. The last good values stay; `FeedStatus.stale` goes true once `now − data_ts > staleAfter` [R2, NFR-7].

**Upstream validation:**

- GOES flux must be > 0, and fill values (−99999) are dropped.
- RTSW rows with `active=false` are dropped, and only one row is kept per timestamp (the active spacecraft).
- Region locations must parse (`parseLocation`); odd ones are kept without lat/lon.
- DONKI needs `speed`, `latitude`, `longitude` and `halfAngle` as numbers; otherwise the CME is skipped and logged.

### 5.3 Computation

| What | Rule | Code |
|---|---|---|
| Flare lifecycle | From the GOES flare list: begin, peak and end times. While no end time is known, `status = rising` until the long-channel flux turns down, then `decaying`; the class follows the running maximum (`classFromFlux`) | `compute/flares.ts` |
| Flare → region | Use the list's region number if present, else the region whose location is within 10° at flare time | `compute/flares.ts` |
| Earth-directed | `isEarthDirected(lat, lon, halfAngle)`: Earth (0,0) inside the cone | `packages/physics` |
| CME arrival | `dbmForecast({ v0: speed, w, gamma: 0.2e-7, launchAt })`, w = median RTSW speed over the last 6 h (400 km/s if none). Recomputed when DONKI revises the CME | `compute/cmes.ts` |
| Newell coupling | `newell(v, by, bz)` per wind row, stored with the row | `compute/wind.ts` |

The browser draws CME fronts with the same `dbmAt()` and the forecast's `gamma` and `w`, so the drawn front reaches 1 AU exactly at `eta` (tested in `apps/web/test/cme.test.ts`).

### 5.4 Watchdog (cron, every minute) [R4]

`scheduled()` calls `hub.watchdog()`:

- If `meta.alarm_last_at` is more than 30 s old, it logs an error and re-arms the alarm.
- It records the alarm lag; `/health` reports `degraded` while the lag is over 30 s.

## 6. Alert engine [R6]

Ids are deterministic, so raising twice is a no-op (de-duplication). Each alert is sent once as an `alert` message when raised; clearing it sends the updated object in a `delta.alerts`. These rules are the ones the mock implements and tests.

| Rule | Raise when | Level | Clear when | id |
|---|---|---|---|---|
| `FLARE_M` | Flare running max ≥ 1e-5 W/m² | watch | Flare ended | `FLARE_M:<flareId>` |
| `FLARE_X` | Flare running max ≥ 1e-4 W/m² | warning | Flare ended | `FLARE_X:<flareId>` |
| `CME_EARTH` | A new or revised CME is Earth-directed | warning | `eta + 12 h` (or `raisedAt + 3 d` if no ETA) | `CME_EARTH:<cmeId>` |
| `BZ_SOUTH` | 3 consecutive minutes with Bz ≤ −10 nT | warning | 10 consecutive minutes with Bz > −5 nT (hysteresis) | `BZ_SOUTH:<first ts>` |
| `FEED_STALE` | A feed becomes stale | watch | The feed is fresh again (re-raised with the same id if it goes stale again) | `FEED_STALE:<feedId>` |
| `TEST` | `POST /api/v1/admin/test-alert` with the admin token (secret) | watch | After 10 min | `TEST:<ts>:<seq>` |

The test alert is sent at once, outside the tick, so delivery time can be measured (PLAN Phase 4: < 1 s).

## 7. API

All routes are under `/api/v1`. Every query parameter is validated with the shared schemas; a bad request gets `400 {error}`.

| Route | Served from | Caching |
|---|---|---|
| `GET /state` | Memory: a serialised `LiveState` string, rebuilt only when `seq` changes | `Cache-Control: no-store`; `ETag: "<seq>"`, so `If-None-Match` gets a 304 [C2] |
| `WS /stream?since=<seq>` | Memory delta ring | — |
| `GET /history?series&res&from&to` | Memory rings | Edge cache. `from`/`to` must be multiples of the resolution (60 or 300 s), or the request is rejected [C1]. `s-maxage=60`; a range ending more than 1 h ago gets `max-age=86400, immutable` |
| `GET /events?type&since` | SQLite (indexed by time) | `s-maxage=30` |
| `GET /regions`, `GET /cmes/:id` | Memory | `s-maxage=30` |
| `GET /health` | Memory + metrics | `no-store` |
| `POST /admin/test-alert` | — | Needs `Authorization: Bearer <ADMIN_TOKEN>` (secret); not linked from the UI |

### 7.1 WebSocket session

```
client → GET /api/v1/stream?since=1042   (Origin checked against the allow-list [X2])
server → {type:"hello", protocol:1, minClient:1, seq:1050}                 [D3]
server → if 1042 is in the ring: delta 1043 … 1050   else: snapshot(seq 1050)
server → delta / alert as they happen; {type:"ping"} every 15 s
client → {type:"resync"} on a seq gap → server sends a snapshot
```

**Close codes:**

| Code | Meaning | What the client does |
|---|---|---|
| 1012 | Service restart | Reconnects after a random 0–3 s [S2] |
| 1013 | Too many sockets | Falls back to polling [S3] |
| 1008 | Origin not allowed | Stays closed |

A socket that sends nothing (no pong) for 45 s is closed [S4].

The hello message is a protocol addition. Old clients ignore unknown message types (`isServerMessage` returns false), so it is backward compatible.

## 8. Security

| Concern | Measure |
|---|---|
| Abuse | One Cloudflare rate-limiting rule: `/api/v1/stream` and `/api/v1/history` limited per IP (e.g. 60/min). Socket cap per DO (§7.1) [X2, S3] |
| Cross-site use of the socket | `Origin` allow-list (production domain, Pages preview domains, localhost in dev) [X2] |
| Secrets | `NASA_API_KEY` and `ADMIN_TOKEN` as Wrangler secrets per environment. Logged URLs have their query strings removed [X4] |
| Injection | All responses are JSON; feed text is passed as data and the frontend renders it as text [X3] |
| Mock-only routes | `/mock/*` doesn't exist in the Worker; a contract test asserts 404 [X5] |
| Headers | API responses: `X-Content-Type-Options: nosniff`, `Content-Type: application/json; charset=utf-8`; CORS not needed (same origin via Pages → Worker route) |

## 9. Observability [O1–O3]

**Structured log**, one JSON line per tick:

```json
{"evt":"tick","seq":1050,"ms":412,"feeds":{"goes_xray":{"st":304,"ms":180},"rtsw":{"st":200,"ms":390,"rows":1,"kb":2810}},"sockets":812,"msgs":2}
```

**Metrics** (Workers Analytics Engine, free tier):

| Metric | Meaning |
|---|---|
| `ingest_lag_s` per feed | `ingestedAt − dataTs − cadence`: the part of NFR-2 the backend adds |
| `push_ms` | From tick start to broadcast done |
| `alarm_lag_s` | How late the alarm fired |
| `sockets` | Open WebSockets |
| `msgs_per_min` | Sequenced messages per minute |
| `errors` per feed | Failed polls |

**`/health`** returns `{status: ok|degraded|down, clock, feeds[], lag: {p50, p95} per feed, alarmLagS, sockets, seq}`.

**Service levels:**

| SLI | Target |
|---|---|
| Freshness: p95 of `ingest_lag_s` + `push_ms` | ≤ 5 s |
| `/health` returns `ok` | 99.5 % of minutes |
| Alarm lag | < 30 s |

UptimeRobot checks `/health` for `"status":"ok"`.

## 10. Testing

| Level | What |
|---|---|
| Unit | Normalisers on saved real payloads (`docs/reconnection/data/*.json`) including bad rows; flare lifecycle; alert rules (port `apps/mock/test/engine.test.ts`) |
| Contract [T1] | `packages/contract-tests`, run with `BASE_URL` against `wrangler dev` (with a fixture upstream) and against the mock. Covers snapshot+delta order, `?since` replay, resync, history shape, events, 404 on `/mock/*` |
| Golden [T4] | A real DONKI CME's forecast ETA within ±1 min of the DBM test values |
| Load [S5] | 1,000 sockets (k6 or a Node script) in Phase 1. Measure DO CPU per broadcast, request count and duration |

## 11. Deployment

- `wrangler.toml` with `[env.staging]` and `[env.production]`. The DO class is migrated with `new_sqlite_classes = ["SpaceWeatherHub"]`.
- **CI:** on a PR, typecheck, lint, test and the contract suite run, and a preview deploy goes to staging. On `main`, it deploys to production.
- **Rollback:** `wrangler rollback`. Schema changes are additive, so old code runs on the new schema [CD3].
- **Restart behaviour:** a deploy restarts the DO. Sockets close with 1012 and clients reconnect over 0–3 s with `?since`. The delta ring is empty after a restart, so clients get one snapshot each. A snapshot is ~55 kB (measured on the mock), so 1,000 clients cost ~55 MB of output once, spread over the 0–3 s window.
