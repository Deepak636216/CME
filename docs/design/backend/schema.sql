-- SQLite schema for SpaceWeatherHub (Durable Object storage).
-- All times are unix seconds UTC. Columns map one-to-one to the types in packages/shared.
-- Design and reasoning: DETAILED_DESIGN.md section 4. The delta log is kept in memory, not here.

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);           -- schema_v, seq, alarm_last_at

CREATE TABLE IF NOT EXISTS feed_status (
  feed_id     TEXT PRIMARY KEY,          -- FeedId: goes_xray | goes_flares | rtsw | regions | donki
  etag        TEXT,
  last_ok_at  INTEGER,
  data_ts     INTEGER,                   -- newest data time in the feed
  error       TEXT,                      -- last error, URL query string stripped [X4]
  fail_count  INTEGER NOT NULL DEFAULT 0 -- consecutive failures (drives backoff)
);

CREATE TABLE IF NOT EXISTS xray_sample (ts INTEGER PRIMARY KEY, flux_long REAL, flux_short REAL, satellite INTEGER) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS wind_sample (
  ts INTEGER PRIMARY KEY, speed REAL, density REAL, temperature REAL,
  bx REAL, by REAL, bz REAL, bt REAL, newell REAL
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS sunspot_region (
  region_no INTEGER NOT NULL, observed_on TEXT NOT NULL,          -- YYYY-MM-DD
  lat REAL, lon REAL, location TEXT,                              -- lon at observed time (rotated on read)
  area_msh INTEGER, mag_class TEXT, spot_count INTEGER, p_m INTEGER, p_x INTEGER,
  PRIMARY KEY (region_no, observed_on)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS flare (
  id TEXT PRIMARY KEY,                   -- begin time ISO from GOES, stable
  begin_at INTEGER NOT NULL, peak_at INTEGER, end_at INTEGER,
  cls TEXT NOT NULL, peak_flux REAL NOT NULL,
  status TEXT NOT NULL,                  -- rising | decaying | ended
  region_no INTEGER, lat REAL, lon REAL
);
CREATE INDEX IF NOT EXISTS flare_begin ON flare(begin_at);

CREATE TABLE IF NOT EXISTS cme (
  id TEXT PRIMARY KEY,                   -- DONKI activity id
  launch_at INTEGER NOT NULL,            -- time at 21.5 Rs
  speed REAL NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, half_angle REAL NOT NULL,
  earth_directed INTEGER NOT NULL, flare_id TEXT, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cme_launch ON cme(launch_at);

CREATE TABLE IF NOT EXISTS cme_forecast (
  cme_id TEXT PRIMARY KEY REFERENCES cme(id),
  computed_at INTEGER NOT NULL, eta INTEGER, arrival_speed REAL, gamma REAL NOT NULL, w REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS alert (
  id TEXT PRIMARY KEY,                   -- deterministic: "<RULE>:<refId>", the de-dup key
  rule TEXT NOT NULL,                    -- FLARE_M | FLARE_X | CME_EARTH | BZ_SOUTH | FEED_STALE | TEST
  level TEXT NOT NULL,                   -- watch | warning
  title TEXT NOT NULL, message TEXT NOT NULL,
  ref_type TEXT NOT NULL, ref_id TEXT NOT NULL,
  raised_at INTEGER NOT NULL, cleared_at INTEGER
);
CREATE INDEX IF NOT EXISTS alert_raised ON alert(raised_at);
