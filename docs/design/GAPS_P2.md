# P2 gaps: after launch

From the [gap analysis](GAP_ANALYSIS.md) (2026-10-05, commit `c23e3cf`). See also [P0](GAPS_P0.md) and [P1](GAPS_P1.md).

**Why these can wait:** each one improves efficiency, insight or upkeep, but the site is correct, safe and operable without it.

**6 items.** IDs match the gap analysis.

| ID | Item | Area |
|---|---|---|
| [C2](#c2-conditional-get-on-state) | Conditional GET on `/state` | Caching |
| [O4](#o4-client-error-reports) | Client error reports | Observability |
| [D4](#d4-contract-changelog) | Contract changelog | Contract |
| [DOC2](#doc2-decision-records) | Decision records (ADRs) | Documentation |
| [CD4](#cd4-remove-legacy-code) | Remove legacy code | Delivery |
| [S4](#s4-slow-consumers) | Drop slow consumers | Scalability |

## Caching

### C2. Conditional GET on `/state`

- [ ] **Gap:** `/state` has no conditional GET.
- **Do:** send `ETag: "<seq>"`, and answer `If-None-Match` with 304. This helps the polling fallback.

## Observability

### O4. Client error reports

- [ ] **Gap:** client errors are invisible.
- **Do:** send `window.onerror` and error-boundary errors to `POST /api/v1/telemetry` (sampled, no PII), or use a free Sentry tier.

## Contract

### D4. Contract changelog

- [ ] **Gap:** contract changes aren't reviewed as such. Fields were added during frontend work (`staleAfterS`, `TEST`) with no changelog.
- **Do:** add a `CHANGELOG` section in `packages/shared`, and let the contract test suite ([P0 T1](GAPS_P0.md#t1-contract-test-suite)) gate changes.

## Documentation

### DOC2. Decision records

- [ ] **Gap:** there are no decision records.
- **Do:** write short ADRs in `docs/design/adr/` for the decisions that are hard to undo:
  - One DO as the single writer.
  - DO SQLite.
  - Physics shared with the client.
  - Snapshot + delta over WebSocket.
  - Frontend first, with a mock.

## Delivery

### CD4. Remove legacy code

- [ ] **Gap:** `server.py`, the root `index.html` and `legacy/` predate this design.
- **Do:** remove them, or move them under `docs/` once `/guide` is served.

## Scalability

### S4. Slow consumers

- [ ] **Gap:** Workers can't read `bufferedAmount`, so a slow socket can't be detected directly.
- **Do:** drop a socket that hasn't answered a ping for 45 s. The client already drops sockets that have been silent for 40 s.
