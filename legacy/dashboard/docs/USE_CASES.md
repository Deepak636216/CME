# Real-Time Solar Observatory — Use Cases

## Problem

Space weather data (solar wind, the interplanetary magnetic field, coronal mass ejections) is published by NOAA and NASA as raw JSON feeds and catalogues. That data is hard to read, split across many sources, and gives no quick sense of whether conditions are calm or a storm is coming.

## Goal

Pull live space weather data into one browser dashboard and show it as metrics, charts and a 3D Sun–Earth model. Anyone can then see what the Sun is doing now and whether Earth is likely to be affected.

## Users

- **Space weather enthusiasts / students**: want to understand and watch solar activity.
- **Educators**: need a visual way to explain solar wind, magnetic fields and CMEs.
- **Researchers / analysts**: want a quick live overview and exportable data.
- **Aurora watchers / radio & satellite hobbyists**: care about incoming storm conditions.

## Use Cases

### UC-1: Monitor current solar wind conditions
**Actor:** Any user
**Goal:** See the solar wind's speed, density and temperature right now.
**Flow:** The app fetches NOAA SWPC plasma data → shows the latest values as live metric cards → plots speed and density over time.
**Outcome:** The user knows whether the solar wind is slow, moderate or fast.

### UC-2: Watch the interplanetary magnetic field (IMF)
**Actor:** Any user
**Goal:** Track Bx, By, Bz and total field strength (Bt).
**Flow:** The app fetches NOAA magnetic field data → charts the three components → highlights Bz.
**Outcome:** The user can spot a southward Bz (negative), the main sign of possible geomagnetic storms.

### UC-3: Get alerted to storm-prone conditions
**Actor:** Any user
**Goal:** Learn without interpreting raw numbers that conditions are becoming disturbed.
**Flow:** The app compares live Bz, Bt and wind speed against thresholds → color-codes the metrics and raises visual alerts.
**Outcome:** The user gets a quick "quiet vs. active" read of space weather.

### UC-4: Track recent coronal mass ejections (CMEs)
**Actor:** Any user
**Goal:** See which CMEs have happened recently and how strong they were.
**Flow:** The app queries NASA DONKI for recent CMEs → lists them in time order with speed, source location and instruments → plots them on a scatter chart sized and colored by speed.
**Outcome:** The user knows about recent eruptions and which ones matter most.

### UC-5: Review CME details and possible Earth impact
**Actor:** Researcher / enthusiast
**Goal:** Understand a single CME and whether it may reach Earth.
**Flow:** The user opens a CME event → sees NASA's analysis, source location, speed and estimated arrival.
**Outcome:** The user can judge whether a given CME is likely to affect Earth and roughly when.

### UC-6: Visualize the Sun–Earth system in 3D
**Actor:** Any user, especially educators and students
**Goal:** Build a feel for how solar activity travels to Earth.
**Flow:** A 3D scene shows the Sun, Earth and its magnetosphere. The scene also shows solar wind particles driven by live speed and density, magnetic field lines shaped by live Bx, By and Bz, and CME particle bursts launched from their real source locations. Hovering over an object shows its live values.
**Outcome:** The abstract numbers become a picture you can explore.

### UC-7: Keep the view up to date
**Actor:** Any user
**Goal:** Keep the data current without reloading the page.
**Flow:** The user enables auto-refresh (every 5 minutes) or clicks Refresh → the header shows the live status, last update time and how many APIs responded.
**Outcome:** The user trusts that what they see is current.

### UC-8: Export data for offline analysis
**Actor:** Researcher / analyst
**Goal:** Save the current data set for further work.
**Flow:** The user clicks Export → the current solar wind, magnetic field and CME data downloads as JSON.
**Outcome:** The data can be used in notebooks, reports or other tools.

### UC-9: Keep working when live sources are unavailable
**Actor:** Any user (including local development)
**Goal:** Still get a working dashboard when an API is blocked or down.
**Flow:** The app tries a direct call first, then CORS proxies, then falls back to realistic sample data, and shows which source is active.
**Outcome:** The dashboard always renders something meaningful and is honest about where the data came from.

## Data Sources

| Source | Provides |
|---|---|
| NOAA SWPC – Solar Wind Plasma | Speed, density, temperature |
| NOAA SWPC – Magnetic Field | Bx, By, Bz, Bt |
| NASA DONKI – CME Analysis | CME events, speed, source, direction |

## Out of Scope (for now)

- Official forecasting or warnings (the app is informational, not authoritative)
- Solar imagery (SDO, SOHO, STEREO), listed as future enhancements in `api.md`
