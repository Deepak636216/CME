# Magnetic Reconnection → Flare → CME: Research Notes

> The full interactive guide is at [reconnection/index.html](reconnection/index.html). Note: NOAA's `/products/solar-wind/*` feeds now return 404. Use `/json/rtsw/rtsw_mag_1m.json` and `/json/rtsw/rtsw_wind_1m.json` instead.

The goal: simulate the chain of events from **magnetic reconnection** on the Sun to a **solar flare** and a **coronal mass ejection (CME)**, drawing the curves from live data wherever possible.

---

## 1. The idea in plain words

1. **Magnetic stress builds up.** Twisted magnetic field above a sunspot region stores a lot of energy, often as a *flux rope* (a twisted bundle of field lines).
2. **The rope starts to rise.** As it lifts, field lines on either side of it are stretched into a thin *current sheet* underneath.
3. **Reconnection happens.** In the current sheet, oppositely pointing field lines break and reconnect. Stored magnetic energy is released very quickly as heat, fast particles and motion.
4. **Two results come out of the same event.**
   - **Downward, the flare.** Energy rushes down the field lines, heats the lower atmosphere and makes bright X-ray emission. GOES measures this as the flare curve.
   - **Upward, the CME.** Reconnection cuts the rope loose, and it is thrown out into space as a CME.
5. **The CME travels to Earth.** The solar wind drags on it along the way, speeding up slow CMEs and slowing down fast ones.
6. **Reconnection happens again at Earth.** If the CME's magnetic field points south (negative Bz), it reconnects with Earth's magnetic field and drives a geomagnetic storm.

This is the **standard flare model (CSHKP)**. A single reconnection event produces both the flare and the CME.

```
        CME (flux rope) ↑  ── travels to Earth ──►  reconnects with Earth's field (Bz < 0)
                        │
        ─── X ───  ← reconnection point (current sheet)
                        │
        flare loops ↓  → X-ray flare (GOES curve)
```

---

## 2. The key curves (what to simulate)

| # | Curve | What it shows | Simple formula |
|---|---|---|---|
| 1 | **Reconnection rate** | How fast magnetic flux is being reconnected | Inflow speed = **M × vA**, with M ≈ 0.01–0.1 (measured flares give about 0.015–0.07) |
| 2 | **Energy release rate** | Power released by reconnection | **P ≈ (B² / μ₀) · M · vA · A** |
| 3 | **Flare X-ray curve** | Brightness of the flare over time | Fast rise, slow exponential decay (GOES shape) |
| 4 | **CME speed & height** | CME motion near the Sun | Speeds up during the flare's rise, then coasts |
| 5 | **CME travel to Earth** | Speed and distance vs. time | Drag-based model (below) |
| 6 | **Earth reconnection rate** | How strongly the CME/solar wind drives Earth | Newell coupling (below) |

**Alfvén speed:** vA = B / √(μ₀ ρ), the speed at which magnetic disturbances travel through plasma.

### Neupert effect (the link between reconnection and the flare curve)
The rate of energy release by reconnection follows the **slope** of the soft X-ray curve:

> energy release rate ∝ d(X-ray flux)/dt

So taking the derivative of the live GOES curve gives a **reconnection/energy-release proxy curve** built from real data.

### Drag-Based Model (CME → Earth)
```
a = −γ (v − w) |v − w|
```
- v = CME speed (from NASA DONKI)
- w = solar wind speed (**live from NOAA**)
- γ = drag parameter, typically about 0.1–2 × 10⁻⁷ km⁻¹ (default 0.2 × 10⁻⁷)

It has a closed-form solution (for v₀ > w), so no numerical solver is needed:
```
v(t) = (v₀ − w) / (1 + γ (v₀ − w) t) + w
r(t) = (1/γ) · ln(1 + γ (v₀ − w) t) + w·t + r₀      (r₀ ≈ 20 solar radii)
```
**Arrival time** is the time t when r(t) = 1 AU.

### Newell coupling (reconnection at Earth)
```
dΦ/dt = v^(4/3) · Bt^(2/3) · sin^(8/3)(θ / 2),     θ = atan2(By, Bz)
```
All inputs are **live NOAA data**. The value is largest when Bz points strongly south.

---

## 3. Which variables can come from real-time data

| Variable | Source | Live? |
|---|---|---|
| X-ray flux (flare curve) | NOAA GOES `json/goes/primary/xrays-6-hour.json` | ✅ (checked, working) |
| Current/latest flare class, start/peak/end | NOAA GOES `json/goes/primary/xray-flares-latest.json` | ✅ (checked, working) |
| Flare catalogue | NASA DONKI `FLR` | ✅ (near real time) |
| CME speed, direction, time | NASA DONKI `CMEAnalysis` (used by the legacy dashboard) | ✅ (near real time) |
| Solar wind speed, density | NOAA RTSW wind feed `json/rtsw/rtsw_wind_1m.json` | ✅ |
| Bx, By, Bz, Bt | NOAA RTSW mag feed `json/rtsw/rtsw_mag_1m.json` | ✅ |
| Coronal field B, density, current sheet size | **Not measured live**: user-adjustable parameters with typical values (B ≈ 50–300 G, n ≈ 10⁹–10¹⁰ cm⁻³) | ❌ |

**Important limit:** nobody measures reconnection inside the Sun's corona in real time. The solar part of the simulation is a **physics model tuned by live data**: the flare class and timing come from GOES, and the CME speed comes from DONKI. The Earth part (drag model and Newell coupling) runs directly on live measurements.

---

## 4. Proposed simulation (simple version)

A single timeline with four linked panels:

1. **Reconnection panel.** An animated 2D X-point diagram (field lines moving in and snapping). Its speed is set by the reconnection rate, and the rate curve comes from d(GOES)/dt.
2. **Flare panel.** The live GOES X-ray curve with flare class bands (A/B/C/M/X) and the latest flare's begin, peak and end marked.
3. **CME panel.** CME height and speed near the Sun (acceleration lined up with the flare rise), then the drag-model trip to Earth using the live solar wind speed, with the predicted arrival time.
4. **Earth panel.** The live Newell coupling curve, showing how hard the solar wind is driving Earth right now.

**Controls:** coronal B, density, reconnection rate M and drag γ as sliders with sensible defaults. Everything else comes from live feeds.

---

## 5. Sources

- CSHKP standard model and reconnection rates from flare ribbons: [Magnetic Reconnection Rates and Energy Release in a Confined X-class Flare (arXiv:1509.07089)](https://arxiv.org/pdf/1509.07089), [Flare ribbon reconnection flux database (ApJ)](https://iopscience.iop.org/article/10.3847/1538-4357/aa7ed6), [Reconnection in a flare MHD simulation (arXiv:2505.11186)](https://arxiv.org/pdf/2505.11186), [Reconnected flux and CME speeds (arXiv:1504.02905)](https://arxiv.org/pdf/1504.02905)
- Drag-Based Model: [CCMC DBM info](https://ccmc.gsfc.nasa.gov/static/files/CDBM_info.pdf), [DBM parameter distributions (arXiv:2201.12049)](https://arxiv.org/pdf/2201.12049), [Drag-Based Ensemble Model (ApJ)](https://iopscience.iop.org/article/10.3847/1538-4357/aaaa66)
- Newell coupling function: [Newell et al. 2007, JGR](https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2006JA012015)
- Live data: [NOAA SWPC GOES JSON](https://services.swpc.noaa.gov/json/goes/primary/), NASA DONKI (`api.nasa.gov/DONKI/FLR`, `CMEAnalysis`)
