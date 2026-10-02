# Scope: Real-Time Solar Activity & Alert Website

## 1. Use case

A website that shows, **live**, what the Sun is doing and whether it matters for Earth.

The user opens the site and sees:

1. **The inner solar system, Sun → Earth**, drawn from real orbital positions (Mercury, Venus, Earth, plus the L1 monitor point).
2. **The Sun's face**, with today's sunspot regions placed at their real (approximate) positions.
3. **Flares and CMEs as they happen**: where on the Sun a flare fired, how strong it is, and a CME cloud travelling outward toward Earth.
4. **Alerts** when something significant happens (big flare, Earth-directed CME, strong southward Bz).

The physics chain behind it comes from the existing reconnection work in [reconnection/](reconnection/index.html): **reconnection → flare → CME → arrival at Earth → Earth coupling**.

**Who uses it:** students, space-weather enthusiasts, and researchers who want one live view instead of five NOAA/NASA pages.

## 2. Scope

| In scope (v1) | Out of scope (v1) |
|---|---|
| Sun → Earth only (Mercury, Venus, Earth, L1) | Outer planets, moons, spacecraft other than L1 monitors |
| Sunspot regions at approximate positions | Full-resolution solar imagery / magnetograms |
| Live flares (GOES) and CMEs (DONKI) | Our own flare/CME *prediction* models (later ML phase) |
| CME travel animated with the drag-based model | MHD simulations (e.g. ENLIL-level) |
| In-browser alerts | SMS / email / mobile push (later) |
| Public website, no login | User accounts, saved settings on server |

## 3. Data sources

| What | Source | Update rate |
|---|---|---|
| Planet positions | Ephemeris computed locally (e.g. `astronomy-engine`), no network call | Computed every frame |
| Sunspot regions | NOAA SWPC `json/solar_regions.json` | Daily |
| Flares / X-ray flux | NOAA GOES `json/goes/primary/xrays-*.json`, `xray-flares-*.json` | 1 min |
| CMEs | NASA DONKI `CMEAnalysis` | Minutes–hours |
| Solar wind & IMF at L1 | NOAA RTSW `rtsw_wind_1m.json`, `rtsw_mag_1m.json` | 1 min |

> "Real time" means **as fresh as the source allows**. Our job is to add no delay of our own on top of it.

## 4. Functional requirements

| ID | Requirement |
|---|---|
| FR-1 | Render Sun, Mercury, Venus, Earth and L1 at their real positions for the current time, to scale (with an optional "readable" scale toggle). |
| FR-2 | Show active sunspot regions on the Sun at their reported latitude/longitude, sized by area. |
| FR-3 | When a flare is detected, mark its region on the Sun and show its class (C/M/X) and the live X-ray curve. |
| FR-4 | For each CME, draw a cone/cloud leaving the Sun in its real direction and animate it with the drag-based model; show the predicted Earth arrival time. |
| FR-5 | Show current solar wind speed, density, Bz and Newell coupling at L1. |
| FR-6 | Raise an alert banner/sound for: flare ≥ M1, Earth-directed CME, Bz ≤ −10 nT. |
| FR-7 | Show a "data age" next to every live value, and a clear "stale" state if a feed stops. |
| FR-8 | Let the user scrub back over the last 7 days of events. |
| FR-9 | Fall back to the last good snapshot if a feed is down, never a blank screen. |

## 5. Non-functional requirements

**The main goal: the system computes continuously, and the user always sees current data with no lag.**

| ID | Requirement | Target |
|---|---|---|
| NFR-1 **Continuous computing** | The backend runs 24/7, polling every feed on its own cadence and recomputing derived values (DBM arrival, Newell coupling, alerts) as soon as new data lands. No computation waits for a user request. | Always on |
| NFR-2 **Freshness** | Time from a new value appearing at NOAA/NASA to it showing on the user's screen. | ≤ 5 s (beyond source cadence) |
| NFR-3 **Push, not poll** | Backend pushes updates to browsers (WebSocket or Server-Sent Events). The browser never reloads to get new data. | — |
| NFR-4 **Smooth rendering** | 3D scene (WebGL) stays fluid; planet motion and CME travel are interpolated in the browser between data updates. | 60 fps desktop, ≥ 30 fps mobile |
| NFR-5 **Fast first load** | On connect, the server sends the latest computed state at once, so nothing waits on upstream feeds. | Interactive in < 2 s |
| NFR-6 **Accuracy** | Positions and values match the sources; computed values use the published formulas (see [research-notes.md](research-notes.md)). | Planet positions < 0.1° error |
| NFR-7 **Resilience** | One failing feed never blocks the others; retries with backoff; last good value kept and flagged as stale. | — |
| NFR-8 **Scale** | Upstream feeds are fetched **once by the server**, not once per user; all users share the same computed state. | 1,000+ concurrent viewers |
| NFR-9 **Availability** | Deployed as a public website. | ≥ 99.5 % uptime |

### How the design meets the lag goal

```
NOAA / NASA feeds ──► Backend pollers (per feed cadence)
                         │
                         ▼
                  Compute engine (DBM, Newell, alerts)  ──► in-memory latest state (+ 7-day store)
                         │
                         ▼  push on change (WebSocket / SSE)
                  Browser: WebGL scene, interpolates between updates, renders at 60 fps
```

- **Heavy work on the server, once.** Users only receive small "what changed" messages.
- **Smooth motion in the browser.** Planet positions come from a local ephemeris and CME fronts from the DBM formula, so the browser animates every frame without asking the server.
- **No request-time computation.** Every value is already computed before anyone asks for it.
