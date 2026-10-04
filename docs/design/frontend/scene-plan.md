# Step 4 plan: the 3D scene (UF1, UF2)

Part of [PLAN.md](../PLAN.md) Phase 2. Goal: the Live page shows the Sun, Mercury, Venus, Earth and the L1 monitor point at their real positions for the current server time. It stays smooth (60 fps) and never re-renders React per frame. One toggle switches between true and readable scale.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Libraries | `three` + `@react-three/fiber` 8 + `@react-three/drei` 9 (OrbitControls, Html labels, Line) | r3f 8 supports React 18 (r3f 9 needs React 19); drei is tree-shaken |
| Ephemeris | `astronomy-engine` `HelioVector` → rotate EQJ → J2000 ecliptic (`Rotation_EQJ_ECL`) | Runs in the browser, no network; a fixed frame doesn't drift over the years |
| Units / axes | 1 scene unit = 1 AU. Ecliptic (x, y, z) → three (x, z, −y), so ecliptic north is +Y (up) | Planets orbit counter-clockwise seen from above, as in textbooks |
| Scene time | `serverNow()` from the store clock, read in `useFrame` via `getState()` | Mock scenarios at ×60 move the planets correctly; no React re-render per frame |
| L1 | On the Sun–Earth line, 0.01 AU (≈ 1.5 million km) sunward of Earth | Where DSCOVR / ACE sit; the wind data comes from there |
| Sun orientation | Sun group turned so heliographic longitude 0 faces Earth every frame | Sunspots (Phase 3) are given in Earth-facing heliographic coordinates |
| True scale | Real radii (Sun 0.00465 AU; Earth 4.3e-5 AU) + fixed-pixel markers and labels so tiny bodies can be found | FR-1 "to scale"; you still need to see where Earth is |
| Readable scale | Distances unchanged, radii enlarged (Sun 0.06 AU, planets 0.010–0.016 AU). One exception: L1 (0.01 AU from Earth) would sit inside the enlarged Earth, so it is drawn just outside it on the same Sun–Earth line | Geometry stays true for CME paths (Phase 3); only sizes change |
| Toggle | `ui.scale` in a new `store/ui.ts` (saved in localStorage); radii and camera animate over ~600 ms | UF2: one toggle, animated camera |
| Bundle | `SceneCanvas` is `React.lazy`-loaded; other pages never download three.js | Keeps cold load interactive in < 2 s |
| No WebGL | Message with the key numbers instead of a blank area | FR-9: never a blank screen |
| Hidden tab | r3f `frameloop` paused while `document.hidden` | No GPU use in background tabs |

## Sub-steps (one commit each)

| | What | Done when |
|---|---|---|
| ✅ **4a** | `lib/ephemeris.ts`: body positions, L1, orbit paths, Earth-facing direction; unit tests | Earth lies on the −X axis at the March equinox and on +Z at the June solstice (±0.5°, the J2000 frame offset); orbits run counter-clockwise from above; L1 is 0.01 AU from Earth |
| ✅ **4b** | `scene/`: SceneCanvas (lazy), SunMesh, PlanetBodies, OrbitLines, L1Probe, labels, OrbitControls, star backdrop; Live page layout | `/` renders the scene from the store clock with no console errors; other routes don't load three.js |
| ✅ **4c** | `store/ui.ts` + ScaleToggle + CameraRig (animated radii and camera presets) | Toggle switches scale smoothly; choice survives reload |
| ✅ **4d** | Robustness: WebGL fallback, pause when hidden, reduced motion, dpr cap, phone layout | Fallback shows when WebGL is off; no horizontal scroll at 390 px |

## Not in step 4

Sunspots, flare markers, CME shells and click-to-select (Phase 3); charts (step 5); timeline/replay (Phase 4).

## Verifying 60 fps

Headless Chromium renders WebGL in software, so frame rate measured here is meaningless. What can be checked here: React commits per second while the scene runs (should be ~1, from the age tickers, not 60) and that `useFrame` work stays small. The real 60 fps check is a manual one on a desktop browser (DevTools → Performance), listed as a usability-test item.

## Notes from building it

- r3f 8 logs a one-time `THREE.Clock … deprecated` warning with three 0.186. It is harmless and goes away with r3f 9 (which needs React 19).
- Found while checking 4b: the ConnectionBadge stayed on "Connecting…" at real-time speed, because the client only went live on the first message and a quiet server sends nothing for up to a minute. It now goes live when the socket opens.
- 4c: camera presets are Overview, Top (true geometry, orbits as circles) and Earth (behind and beside Earth, looking sunward, following Earth along its orbit). At true scale a ring marks each planet and L1, since they are smaller than a pixel.
- 4d, measured in headless Chromium: with the scene running, 5 React commits in 5 s (the 1 s age tickers) against 125 animation frames, so the 3D loop does not re-render React. WebGL off → text fallback with the same positions, and the scene chunk is never downloaded. Scene chunk blocked → error boundary shows the same fallback. On portrait screens the Overview and Top cameras pull back so Earth's orbit fits across.

## Real surfaces (after the design review)

From the design review (Look, P1): bodies are no longer flat colours. All shaders live in `apps/web/src/scene/materials.ts`.

| Body | How | Download |
|---|---|---|
| Sun | Shader: limb darkening I(μ) = 1 − 0.6(1 − μ), Worley-noise granulation that slowly evolves, faculae near the limb, detail fades when the Sun is small on screen; camera-facing corona quad with 1/r² falloff and faint streamers | 0 |
| Earth | NASA Blue Marble (day), Black Marble (city lights), cloud composite; lit by the real Sun direction, ocean glint, blue Fresnel rim and an atmosphere halo shell. Oriented from Greenwich sidereal time and precession/nutation (`earthAxes`), so the day/night line is the real one for the scene time | 384 kB WebP |
| Venus | Shader: banded cream cloud deck, soft terminator | 0 |
| Mercury | Shader: grey rock with Worley craters, hard terminator | 0 |

- Earth draws as flat blue until its maps arrive, then fades in over 0.6 s; if they never arrive (offline) it stays flat. Credits: `apps/web/public/textures/CREDITS.md`.
- Tests: the Sun is overhead at 1.85° E on 20 Mar 2026 12:00 UTC and at 23.44° N, 54.2° E at the June solstice (both within 0.3°); Earth's axes are orthonormal with a 23.44° tilt.
- Measured after the change: 5 React commits in 5 s with the scene animating, as before.

## Context on screen (after the design review)

From the design review (Understand, P1):

- **Clock** (`hud/SceneClock.tsx`): the moment being drawn, in UTC, with LIVE / DELAYED / SAVED, and a note whenever time isn't real (mock data, a scenario, a speed other than ×1).
- **Sun–Earth line** (`scene/SunEarthLine.tsx`): dashed, labelled with sunlight time (8 min 19 s at 1 AU) and solar-wind time at the speed measured at L1 right now (e.g. ~5.2 days at 334 km/s; "400 km/s (typical)" before any data). The L1 label adds how far ahead of Earth the wind measured there is (~1 h).
- **Key** (`hud/SceneKey.tsx`): what each mark means, how much sizes are enlarged (Earth ×376, Sun ×13) or that they are true, and the NASA credit. Open on a first desktop visit, closed on phones, then remembered.
- **Decluttering** (`scene/declutter.ts`): labels hide when they would collide, judged by on-screen distance (L1 next to Earth; the callout when the line is short). The callout sits at the line's on-screen midpoint, so perspective can't push it onto the Sun.
- Text in the scene is written from the render loop straight into the DOM, so all of this costs no React re-renders (still ~1 commit/s).

## Phase 3: what's on the Sun

- **Sunspot groups** (`scene/SunActivity.tsx`, `lib/sunActivity.ts`): each NOAA region is drawn inside the photosphere shader at its heliographic lat/lon (+Z faces Earth, +X west, +Y north): dark umbra, filamented penumbra with a ragged edge, faculae around it that stand out toward the limb. Angular radius from area: r/R = √(2·area·10⁻⁶) (820 MSH ≈ 2.3°), ×1.6 at readable scale. Longitudes rotate forward at 13.2°/day from when the server sent them, so spots glide toward the west limb and slide off it.
- **Flares**: located flares that are under way or ended < 30 min ago get a white-hot kernel in the shader plus a camera-facing glow (visible even when the Sun is small), both pulsing while rising and fading after the end. Strength is log-scaled by class (C1 0.25, M1 0.5, X1 0.75). Flares without a position (the mock's replayed GOES list) can't be placed; they still show in the X-ray chart and as corona brightening, which follows the live X-ray flux.
- **Labels**: one priority pass (the flare first, then regions biggest first); a label that would overlap one already placed is hidden, and the flaring region's own label gives way to the flare label. Region labels need the Sun ≥ 115 px in radius on screen; the flare label ≥ 40 px.
- **Sun camera view**: from Earth's side, aimed a little below centre so the disc sits above the data panels.
- Not modelled: the B0 and P tilts of the solar axis as seen from Earth (up to 7° and 26°).

## Phase 3: CMEs

- **Shells** (`scene/CmeShells.tsx`, `lib/cme.ts`): the ice-cream-cone model: a spherical cap (cone half-angle from DONKI) drawn additive and brighter toward its silhouette like a coronagraph CME, on a faint cone back to the Sun. Orange = Earth-directed, blue = misses Earth.
- **Direction**: lat/lon are relative to the Sun–Earth line *at launch*; the CME then moves radially in that fixed direction (the Sun's rotation does not carry it).
- **Distance**: `dbmAt()` every frame with the forecast's γ and w, the same function the server used for the ETA, so the front reaches 1 AU exactly at `forecast.eta` (tested, with matching arrival speed). Before the DONKI time (21.5 Rs) it is extrapolated back at launch speed so it appears from the flare site. Drawn from 1.5 Rs to 1.6 AU, dimming with distance.
- **Card** (`hud/CmeCard.tsx`): up to two CMEs in flight, Earth-directed first: source flare and region, width, speed now, distance, and for Earth-directed ones the arrival time (UTC), countdown and arrival speed. On phones: one compact strip under the clock.
- **Labels**: only the CMEs the cards list, once the front is clear of the Sun on screen, never over a higher-priority label.

## Phase 3: info cards (UF3) and minimizing

- **Selecting**: every body has an invisible hit sphere (`scene/HitTarget.tsx`) of its drawn size but never under 12 px on screen, so planets at true scale stay clickable. Scene labels are real buttons (click, or Tab + Enter). A click on the Sun picks the region whose spot is under the pointer (within 2.5 spot radii), else the Sun. CMEs are selected from their label or card title; their large translucent shells don't catch clicks, so they never steal clicks meant for planets behind them.
- **Info card** (`hud/InfoCard.tsx`, lazy, 3 kB): Earth (distance, light time, where the Sun is overhead now, X-rays, wind at L1, next CME arrival); Venus/Mercury (distance from Sun and Earth, angle from the Sun in Earth's sky, morning/evening); Sun (X-rays, flares in 24 h by class, regions on the disc, CMEs in flight); L1 (wind values and lead time); a region (location now, area in Earths, magnetic class in plain words, NOAA flare chances, days to the west limb, its flares); a CME (source, direction, width, speed, distance, arrival, model). Esc or ✕ closes; the Key steps aside while it is open.
- **Focus**: flies to the selected object and follows it (planets from their sunlit side, a region straight down, a CME side-on). A new selection doesn't drag the camera; Focus does.
- **Minimizing**: the X-ray and wind panels and the CME cards collapse to their header line (the wind header then shows speed · Bz); remembered across reloads. CME cards start compact, since full cards covered Earth. The eye button hides every overlay (clock and controls stay); not remembered.
- Layout: `--hud-full` is an expanded panel's height, `--hud-space` the room the strip takes (shrinks when panels are minimized or hidden), which the Key, info card and phone cards position against. Below 1500 px wide the clock and CME cards sit under the control row.
