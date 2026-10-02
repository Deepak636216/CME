-- SQLite schema for SpaceWeatherHub (Durable Object storage).
-- All times are unix seconds UTC. See diagrams/02-db-schema.png.

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,          -- 'seq', 'schema_v'
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feed_status (
  feed_id    TEXT PRIMARY KEY,     -- 'goes_xray', 'rtsw_wind', ...
  etag       TEXT,
  last_ok_at INTEGER,
  data_ts    INTEGER,              -- newest data timestamp in the feed
  error      TEXT
);

CREATE TABLE IF NOT EXISTS xray_sample (
  ts         INTEGER PRIMARY KEY,
  flux_long  REAL,                 -- 0.1-0.8 nm, W/m^2
  flux_short REAL,                 -- 0.05-0.4 nm
  satellite  INTEGER
);

CREATE TABLE IF NOT EXISTS wind_sample (
  ts          INTEGER PRIMARY KEY,
  speed       REAL,                -- km/s
  density     REAL,                -- p/cc
  temperature REAL,                -- K
  bx REAL, by REAL, bz REAL,       -- nT, GSM
  bt          REAL,
  newell      REAL                 -- derived coupling
);

CREATE TABLE IF NOT EXISTS sunspot_region (
  region_no   INTEGER NOT NULL,
  observed_on TEXT    NOT NULL,    -- YYYY-MM-DD
  lat REAL, lon REAL,              -- heliographic deg (lon relative to central meridian)
  location    TEXT,                -- e.g. N20E46
  area_msh    INTEGER,
  mag_class   TEXT,
  spot_count  INTEGER,
  p_m INTEGER, p_x INTEGER,        -- flare probability %
  PRIMARY KEY (region_no, observed_on)
);

CREATE TABLE IF NOT EXISTS flare (
  id        TEXT PRIMARY KEY,      -- begin time ISO
  begin_at  INTEGER NOT NULL,
  peak_at   INTEGER,
  end_at    INTEGER,
  class     TEXT,                  -- e.g. M2.3
  peak_flux REAL,
  region_no INTEGER                -- -> sunspot_region.region_no
);
CREATE INDEX IF NOT EXISTS flare_peak ON flare(peak_at);

CREATE TABLE IF NOT EXISTS cme (
  id             TEXT PRIMARY KEY, -- DONKI activity id
  launch_at      INTEGER NOT NULL, -- time at 21.5 Rs
  speed          REAL,
  lat REAL, lon REAL,
  half_angle     REAL,
  earth_directed INTEGER NOT NULL DEFAULT 0,
  flare_id       TEXT REFERENCES flare(id),
  updated_at     INTEGER
);

CREATE TABLE IF NOT EXISTS cme_forecast (
  cme_id        TEXT PRIMARY KEY REFERENCES cme(id),
  computed_at   INTEGER NOT NULL,
  eta           INTEGER,           -- predicted Earth arrival
  arrival_speed REAL,
  gamma REAL, w REAL               -- DBM drag parameter and ambient wind speed
);

CREATE TABLE IF NOT EXISTS alert (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  rule       TEXT NOT NULL,        -- FLARE_M | CME_EARTH | BZ_SOUTH
  level      TEXT NOT NULL,        -- watch | warning
  ref_type   TEXT,                 -- flare | cme | wind
  ref_id     TEXT,
  raised_at  INTEGER NOT NULL,
  cleared_at INTEGER
);
CREATE INDEX IF NOT EXISTS alert_raised ON alert(raised_at);

CREATE TABLE IF NOT EXISTS delta_log (
  seq     INTEGER PRIMARY KEY,
  ts      INTEGER NOT NULL,
  kind    TEXT NOT NULL,           -- delta | alert
  payload TEXT NOT NULL            -- JSON
);
