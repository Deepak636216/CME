# Mock Backend

A stand-in for the real backend, so the frontend can be built and tested for usability first. It serves the same `/api/v1` REST and WebSocket contract as the real backend ([design](../../docs/design/backend/README.md)), using the types in [`packages/shared`](../../packages/shared/src/index.ts). Once the real backend exists, the frontend only changes its base URL.

```bash
npm install                      # once, from the repo root
npm run mock                     # http://localhost:8787 (auto-restarts on code change)
```

Open **http://localhost:8787/mock/ui** to pick scenarios, change speed and inject faults while you watch the UI.

## What it plays

| Layer | Source |
|---|---|
| Background | The saved NOAA/NASA pulls in `docs/reconnection/data/` (GOES X-ray, RTSW wind and field, flares, DONKI CMEs, sunspot regions), shifted so they line up with "now" and looped forever. 7 days of history are filled in at startup. |
| Scenario (optional) | Scripted regions, flares, CMEs (with their arrival at Earth) and feed outages, layered on top. |
| Physics | Real formulas from [`packages/physics`](../../packages/physics/src/index.ts): drag-based CME arrival, Newell coupling, flare classes. These are the same functions the frontend and the real backend will use. |
| Alerts | Same rules as the design: flare ≥ M1 / ≥ X1, Earth-directed CME, Bz ≤ −10 nT for 3 min, stale feed. |

## Scenarios ([scenarios/](scenarios/))

| Name | What happens | Wall time | Tests |
|---|---|---|---|
| `big-storm` | X2.4 flare → 1,900 km/s halo CME → arrival with Bz −24 nT | ~5 min | Whole story; alerts; CME ETA |
| `m-flare-only` | M3.1 flare, no CME | ~2 min | UI doesn't over-alarm |
| `side-cme` | M6 limb flare, CME misses Earth | ~2 min | No false "Earth" alert |
| `feed-outage` | Solar wind down 20 min, then X-ray down 10 min | ~6 min | Stale badges, "data delayed" alert |
| `busy-sun` | 5 regions, 5 flares, 2 CMEs | ~5 min | Crowded UI |

Each file lists `tasks`: questions a usability tester should be able to answer after watching. To write a new scenario, copy one and change its `events`. Times (`at`) are in **simulated minutes**. A `speed` event can be pinned to a CME's arrival with `"arrivalOf": "<cme id>", "offsetMin": -20`, so the playback slows down right before impact.

## Command line

```bash
npm run mock -- --scenario big-storm
npm run mock -- --speed 60
npm run mock -- --chaos latency=800,drop=45,skip=20,fail=0.1
npm run mock -- --port 9000
```

## Endpoints

| | Path | Notes |
|---|---|---|
| GET | `/api/v1/state` | Full `LiveState`, last 6 h of series (~55 KB) |
| WS | `/api/v1/stream?since=<seq>` | `snapshot`, then `delta` / `alert` / `ping`. With `since`, replays only the missed messages. Send `{"type":"resync"}` to get a fresh snapshot. |
| GET | `/api/v1/history?series=xray\|wind&res=1m\|5m&from=&to=` | Up to 7 days |
| GET | `/api/v1/events?type=flare,cme,alert&since=` | |
| GET | `/api/v1/regions`, `/api/v1/cmes/:id`, `/api/v1/health` | |
| GET | `/mock`, `/mock/ui` | Mock only: status JSON, control page |
| POST | `/mock/scenario {name}`, `/mock/speed {speed}`, `/mock/chaos {...}`, `/mock/reset` | Mock only. `{name: null}` stops the scenario. |

**Time:** every timestamp is unix seconds in *simulated* time. The browser must use `clock.now` from the server, not `Date.now()`: `serverNow = clock.now + (Date.now()/1000 − receivedAt) × clock.speed`. In production `speed` is 1, so the same code works unchanged.

## Tests

```bash
npm test          # physics + engine: plays every scenario in fast simulated time
```
