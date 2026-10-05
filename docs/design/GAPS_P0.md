# P0 gaps: fix before the backend is built

From the [gap analysis](GAP_ANALYSIS.md) (2026-10-05, commit `c23e3cf`). See also [P1](GAPS_P1.md) and [P2](GAPS_P2.md).

**Why these come first:** each one is cheaper to get right before `apps/worker` exists than to retrofit afterwards. Most of them decide what the backend code looks like (schema, validation, persistence, restart rules) or how we know it works (contract suite, CI, freshness).

**12 items.** IDs match the gap analysis.

## Order of work

1. [D1](#d1-db-schema-matches-the-contract): the schema matches the contract.
2. [D2 / F3](#d2-runtime-schema-validation): schemas in `packages/shared`, validated at both edges.
3. [T1](#t1-contract-test-suite): the contract test package.
4. [CD1](#cd1-ci-lint-and-formatter): CI with lint and tests.
5. [S1](#s1-delta-log-in-memory): the delta log kept in memory.
6. [R1–R3, R6](#resilience-backend-design): written into the backend design (done), then built.
7. [O1](#o1-measure-freshness-nfr-2): freshness measured.
8. [X4](#x4-secret-handling): secret handling.

## Data model and contract

### D1. DB schema matches the contract

- [ ] **Gap:** `schema.sql` has drifted from the contract.
  - `alert.id` is `INTEGER AUTOINCREMENT`, but the contract uses deterministic string ids (`CME_EARTH:<cmeId>`), and de-duplication depends on them.
  - The schema has no `title` or `message`; its `rule` comment lists 3 of the 6 rules.
  - `flare` lacks `status`, `lat` and `lon`.
- **Do:** make the contract the source of truth. The corrected DDL is in [backend: Storage](backend/DETAILED_DESIGN.md#storage).
- **Done when:** `schema.sql` matches the DDL in the backend design, and a test round-trips a row of each table to its shared type.

### D2. Runtime schema validation

- [ ] **Gap:** nothing is validated at runtime.
  - TECH_STACK chooses zod, but it isn't installed.
  - The client's `isServerMessage` checks only `type`, `seq` and `ts`, so a malformed delta could corrupt the store.
  - Upstream NOAA JSON isn't validated in the design either.
- **Do:** one schema per message in `packages/shared` (zod or valibot); see [contract: Validation](contract/DETAILED_DESIGN.md#validation-and-versioning).
  - **Upstream:** validate strictly; on failure, reject the payload and flag the feed.
  - **Client:** validate at the boundary; on failure, drop the message and resync.
- **Done when:** every server message type has a schema, both the Worker and the client use it, and tests cover a malformed message on each side.

### F3. Validate store updates on the client

- [ ] **Gap:** store updates aren't validated (the client half of D2).
- **Do:** validate at the edge of `stream/client.ts`, before anything reaches the store.
- **Done when:** a test feeds a malformed delta into the stream client and checks that the store is unchanged and a resync is requested.

## Resilience (backend design)

These are written into [backend/DETAILED_DESIGN.md](backend/DETAILED_DESIGN.md). The design is done; each box is ticked when the Worker implements it.

### R1. Fetch timeouts and concurrency limits

- [ ] **Gap:** the poller design has no timeouts, so one hung NOAA request could stall the alarm.
- **Do:**
  - `AbortSignal.timeout(8 s)` on each fetch.
  - Poll the feeds with `Promise.allSettled`.
  - Give each feed its own failure state and exponential backoff (capped at 5 min).
- **Done when:** a test with a never-responding feed shows the tick finishing and the other feeds updating.

### R2. Upstream sanity checks

- [ ] **Gap:** upstream data is trusted as it arrives.
- **Do:**
  - Reject GOES fill values (≤ 0 or −99999).
  - Reject RTSW rows with `active=false`.
  - Keep only the newest row per timestamp.
  - When a feed's shape changes, mark it `error` and keep the last good value (NFR-7).
- **Done when:** fixtures with fill values, inactive rows, duplicates and a changed shape each produce the expected result.

### R3. Restart rules

- [ ] **Gap:** what happens when the Durable Object restarts isn't written down.
- **Do:**
  - On DO start, run migrations and rebuild memory from SQLite inside `blockConcurrencyWhile`.
  - Commit `seq` and the delta in the **same transaction** before broadcasting, so a crash can't reuse a seq.
- **Done when:** a test that restarts the DO mid-stream shows `seq` never repeating and clients resyncing cleanly.

### R6. Alert hysteresis

- [ ] **Gap:** the mock has hysteresis rules, but the backend design didn't.
- **Do:** use the mock's rules as the spec ([backend: Alert engine](backend/DETAILED_DESIGN.md#alert-engine)). For example, Bz raises after 3 points ≤ −10 nT and clears after 10 points > −5 nT.
- **Done when:** the Worker's alert engine passes the same rule tests as the mock.

## Scalability and cost

### S1. Delta log in memory

- [ ] **Gap:** the write budget leaves out `delta_log`. Every delta is a row write, and pruning it is another.
  - One delta per tick (every 5 s) would be 17k + 17k writes a day.
  - One per second would be 86k + 86k, over the 100k free cap.
- **Do:**
  - Emit a delta only when something changed (about 3 a minute, or 4k a day).
  - Keep the 1 h replay log as an **in-memory ring**, and persist only `seq`.
  - After a restart, clients resync with a snapshot, which is cheap.
  - See [backend: Storage](backend/DETAILED_DESIGN.md#storage).
- **Done when:** no SQLite write happens per delta, and the write budget in TECH_STACK includes every table.

## Security

### X4. Secret handling

- [ ] **Gap:** `NASA_API_KEY` handling is planned but not specified end to end.
- **Do:**
  - Store it as a Worker secret.
  - Never put it in the client, the logs or `/health` errors. Strip query strings from logged URLs.
- **Done when:** a test that logs a failed NASA fetch shows no key in the log line or in `/health`.

## Observability

### O1. Measure freshness (NFR-2)

- [ ] **Gap:** NFR-2 (freshness ≤ 5 s beyond cadence) isn't measured anywhere.
- **Do:**
  - Per feed, record `ingest_lag = ingestedAt − (dataTs + cadence)` and `push_lag`.
  - Expose p50 and p95 over the last hour in `/health`.
  - The client reports its own receive lag in `/status`.
- **Done when:** `/health` shows both lags per feed, and `/status` shows the client's lag.

## Testing

### T1. Contract test suite

- [ ] **Gap:** there is no contract suite the real backend must pass. The mock's tests and the client's stream tests run only against the mock.
- **Do:**
  - Move the protocol tests into `packages/contract-tests`, parameterised by `BASE_URL`.
  - Run them against both the mock and the Worker (`wrangler dev`) in CI.
- **Done when:** the suite passes against the mock in CI. The backend is "done" when it passes against the Worker too.

## Delivery

### CD1. CI, lint and formatter

- [ ] **Gap:** there is no CI, linter or formatter.
- **Do:** GitHub Actions running `typecheck`, ESLint (typescript-eslint, react-hooks), a Prettier check, tests, build and the contract suite.
- **Done when:** all of these run on every PR and are required to merge.
