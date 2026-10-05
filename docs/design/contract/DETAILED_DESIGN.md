# Contract layer detailed design: `packages/shared`, `packages/physics`, `apps/mock`

The layer both sides depend on. It holds:

- the message and data shapes (`shared`)
- the formulas that must give the same answer on the server and in the browser (`physics`)
- a stand-in server that implements the contract (`mock`), used to build and test the frontend before the backend exists.

Gap ids from [../GAP_ANALYSIS.md](../GAP_ANALYSIS.md) are in brackets.

## 1. Packages and who uses them

```
packages/shared   ← apps/web, apps/mock, apps/worker (planned), packages/contract-tests (planned)
packages/physics  ← apps/web (CME fronts, classes, locations), apps/mock, apps/worker (planned)
apps/mock         ← apps/web dev server (Vite proxy) and apps/web/test/stream.test.ts
```

Rules:

- `shared` and `physics` have **no runtime dependencies**, run in Node, Workers and browsers, and never import from an app.
- **Units are fixed:** unix seconds UTC; km and km/s; W/m² for flux; nT for the field; heliographic degrees with lat north positive, lon west positive, and (0,0) = the point facing Earth.

## 2. `packages/shared`: the contract

### 2.1 Shapes (as built)

| Type | Key fields | Notes |
|---|---|---|
| `Clock` | `now, speed, mode (live \| mock-replay \| mock-scenario), scenario` | The client computes the current server time from it |
| `XraySeries`, `WindSeries` | columnar arrays `t[]` + one array per field | Small JSON, zero-copy into `Float64Array` |
| `SunspotRegion` | `regionNo, observedOn, lat, lon, location, areaMsh, magClass, spotCount, pM, pX` | `lon` refers to the time the message was made |
| `Flare` | `id, beginAt, peakAt, endAt, cls, peakFlux, status, regionNo, lat, lon` | `cls` is the running class while rising |
| `Cme` + `CmeForecast` | `launchAt` (at 21.5 Rs), `speed, lat, lon, halfAngle, earthDirected, flareId`; forecast `eta, arrivalSpeed, gamma, w` | The browser animates with the same `gamma` and `w` |
| `Alert` | `id` (deterministic), `rule, level, title, message, refType, refId, raisedAt, clearedAt` | `rule` ∈ FLARE_M, FLARE_X, CME_EARTH, BZ_SOUTH, FEED_STALE, TEST |
| `FeedStatus` | `id, label, cadenceS, staleAfterS, lastOkAt, dataTs, error, stale` | The client re-checks staleness with `staleAfterS` while disconnected |
| `LiveState` | everything above; series = last 6 h; flares and CMEs 7 d; alerts active + 24 h | The snapshot |
| `Delta` | any subset | Series **appended**, lists **upserted by id**, `regions` **replaced** |
| `ServerMessage` | `snapshot \| delta \| alert` (sequenced) `\| ping` | |
| `ClientMessage` | `pong \| resync` | |
| REST | `HistoryResponse`, `EventsResponse`, `HealthResponse` | |

### 2.2 Ordering and delivery guarantees

1. Every `snapshot`, `delta` and `alert` has a `seq`, strictly increasing by 1 across all three kinds.
2. A client that has applied `seq = n` may reconnect with `?since=n`. The server then sends either every message `n+1…` or a fresh `snapshot`. A snapshot always replaces the client's state.
3. A client that sees `seq > n + 1` sends `{type:"resync"}` and ignores sequenced messages until a snapshot arrives.
4. Applying the same message twice changes nothing, because upserts are keyed by id and series by `t`.
5. A newly raised alert is delivered as an `alert` message once. Its later changes (clearing) arrive inside a `delta`.

These are tested end to end in `apps/web/test/stream.test.ts`, including under chaos (latency, drops, skipped messages, HTTP 503s).

## 3. Validation [D2] (built)

- **Schemas** live in `packages/shared/src/schema.ts` (zod 4, `zod/mini` build). The interfaces in `index.ts` stay the readable reference. Compile-time `Same<>` checks make `tsc` fail if a schema and its interface disagree (tested by breaking one on purpose).
- **What's checked:**
  - Every number is finite.
  - Series columns are as long as `t`, and `t` never goes backwards.
  - Enums are closed.
  - Lists are capped (`LIMITS`: e.g. ≤ 2,000 flares, ≤ 20,160 series rows), a cheap guard against a broken upstream.
  - A missing sample is `null` (JSON has no NaN): `Sample = number | null`.
- **Client** (`stream/client.ts`) validates every socket message, every `GET /state` response and the IndexedDB cache before use:
  - An unknown message type is ignored.
  - Any other failure is never applied. It is counted in `conn.invalid` (shown on `/status` with the reason), and if it carried a `seq`, the client resyncs.
  - A cache that no longer matches is skipped.
- **Server:**
  - The mock validates `/history` queries with `historyQuerySchema`.
  - A test asserts that every message the mock sends in every scenario matches the schemas.
  - The Worker must do the same, and also validate upstream data after normalising.
- **Cost:** about 9 kB gzipped in the boot bundle.

## 4. Versioning [D3, D4]

| Change | Allowed within `/api/v1` and protocol 1? |
|---|---|
| New optional field, new message type | Yes. Old clients drop unknown fields and ignore unknown message types |
| New enum value (e.g. a new alert rule) | Only together with raising `minClient` in `hello`: clients validate enums strictly, so an old tab would reject the message and resync. Raising `minClient` makes old tabs reload first |
| Renamed or removed field, changed unit or meaning | No: new protocol version, with `minClient` raised in `hello` and the `/api/v2` path |

- Every contract change gets a line in `packages/shared/CHANGELOG.md`.
- **So far:**
  - `FeedStatus.staleAfterS` was added in Phase 2.
  - `AlertRule "TEST"` and `refType "test"` were added in Phase 4.
- IndexedDB and localStorage keys carry their own `:v1` suffix. Changing a stored shape means a new key, never a migration.

## 5. `packages/physics`

| Function | What | Tested |
|---|---|---|
| `dbmAt(t, {v0, w, gamma, r0})` | Drag-based model distance and speed at time t after launch (Vršnak et al. 2013) | ✔ |
| `dbmTransitTime(input, target = 1 AU)` | Time for the front to reach `target` (bisection on `dbmAt`) | ✔ |
| `dbmForecast({..., launchAt})` | `{eta, arrivalSpeed}` | ✔ |
| `newell(v, by, bz)` | Newell coupling dΦ/dt = v^4/3 · B_T^2/3 · sin^8/3(θ/2) | ✔ |
| `classFromFlux`, `fluxFromClass` | GOES class ⇄ flux; rounds within a class (9.96e-6 → M1.0) | ✔ |
| `parseLocation`, `formatLocation` | `N20E46` ⇄ {lat, lon} | ✔ |
| `angularSeparation`, `isEarthDirected` | Earth inside the CME cone | ✔ |

Constants: `AU_KM`, `R_SUN_KM`, `DONKI_R0_KM = 21.5 Rs`, `DEFAULT_GAMMA = 0.2e-7 km⁻¹`, `SYNODIC_DEG_PER_DAY = 13.2`.

**Rule:** any number shown in the UI that the server also computes must come from this package, so the drawn CME front reaches Earth exactly at the server's `eta`.

**Planned [T4]:** golden tests against a published DONKI event and JPL Horizons positions.

## 6. `apps/mock`: the reference server

**What it is:**

- A Node HTTP + WebSocket server (`ws`) on `:8787` serving the real `/api/v1` contract.
- Data is replayed from the saved NOAA/NASA files in `docs/reconnection/data`, shifted to "now", with 7 days of backfill.

| Part | Role |
|---|---|
| `engine.ts` | The simulated hub: clock with speed, minute generation, flare lifecycle, region rotation, CME forecasts (`physics`), alert rules with hysteresis, feed status, message log for `?since` (5,000 messages) |
| `scenario.ts` + `scenarios/*.json` | Scripted events at chosen times: `big-storm`, `busy-sun`, `side-cme`, `feed-outage`, `m-flare-only` |
| `chaos.ts` | Fault injection: latency, socket drops, skipped seqs, HTTP failure rate |
| `server.ts` | Routes; `/mock/*` control endpoints (scenario, speed, chaos, reset, test alert) and a control page at `/mock/ui` |

**Its role after the Worker exists:**

- It stays as the frontend's dev server and the reference for the contract suite.
- **A behaviour change goes into the mock first**, with a test; then into the Worker, which must pass the same suite [T1].

## 7. Contract test suite [T1] (built)

`packages/contract-tests` (`npm run test:contract`) runs every test against:

- the in-process mock (the default, part of `npm test` and CI), or
- any server: `CONTRACT_BASE_URL=http://…`, plus `CONTRACT_CONTROL=mock` if that server has the `/mock/*` controls, and `CONTRACT_WAIT_MS=150000` for a real-time server, which sends a delta about once a minute.

Every message and response is checked against the schemas. Tests that need to trigger events are skipped when the server can't be driven.

| Test | Asserts |
|---|---|
| `GET /state` | Valid `LiveState`; series sorted; 6 h window |
| Stream boot | snapshot first, then consecutive seqs (`hello` to be added with protocol versioning, P1) |
| Resume | Drop, reconnect with `?since=n`: receives exactly `n+1…` |
| Can't replay | `?since` ahead of the server (it restarted) → snapshot |
| Resync | `{type:"resync"}` → snapshot |
| Alert delivery | Triggered test alert arrives in < 1 s; appears in `state.alerts` |
| History | Shape, inside the requested range, 400 on bad queries (snapping rules with P1 C1) |
| Events | Filters by type and `since` |
| Security | `/mock/*` → 404 (Worker only); bad `Origin` refused (Worker only) |

The client's `stream.test.ts` cases (gap, half-open socket, polling fallback, cache rules) stay in `apps/web`, since they test the client, but run against both servers in CI.
