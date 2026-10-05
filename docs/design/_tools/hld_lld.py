"""
HLD + LLD diagrams for backend, frontend and contract (the visual form of the
DETAILED_DESIGN pages).

    npx -y mcp-excalidraw-server start
    python hld_lld.py                 # all
    python hld_lld.py b_topology ...  # some
"""
import re

from dg import Diagram

BE, FE, CT = "../backend/diagrams", "../frontend/diagrams", "../contract/diagrams"
MONO = "cascadia"
MUTED = "#495057"


def B(d, id, x, y, s, color="white", w=None, h=None, size=16, shape="rectangle", dashed=False):
    """Box sized to its label (Excalifont is ~0.62 em per char)."""
    lines = s.split("\n")
    w = w or max(150, int(max(len(l) for l in lines) * size * 0.62) + 36)
    h = h or int(len(lines) * size * 1.35) + 28
    if shape == "diamond":
        w, h = int(w * 1.45), int(h * 1.6)
    d.box(id, x, y, w, h, s, color, size=size, shape=shape, dashed=dashed)
    return x, y, w, h


def T(d, id, x, y, s, size=16, color="#1e1e1e", mono=False):
    # renderers collapse runs of spaces; keep column alignment with NBSP
    s = re.sub(r"(?m)(^ +| {2,})", lambda m: "\u00a0" * len(m.group()), s)
    d.text(id, x, y, s, size=size, color=color, font=MONO if mono else "helvetica")


def seq(d, x0, y0, actors, msgs, gap=58, top=None):
    """Sequence diagram. actors: [(id, label, color, x)]; msgs: [(from, to, label, style)]
    style: '' solid, 'd' dashed reply, 'n' note on `from` lifeline."""
    xs = {}
    for id, label, color, x in actors:
        _, _, w, h = B(d, id, x - 100, y0, label, color, w=200, h=64)
        xs[id] = x
    y = y0 + 64 + 40
    rows = []
    for f, t, label, style in msgs:
        rows.append((y, f, t, label, style))
        y += gap
    end = y + 10
    for id, _, _, x in actors:
        d.line(x, y0 + 64, [[0, 0], [0, end - y0 - 64]], dashed=True, arrow=False, color="#adb5bd")
    for i, (y, f, t, label, style) in enumerate(rows):
        if style == "n":
            T(d, f"note{i}", xs[f] + 14, y - 10, label, size=14, color="#e8590c")
            continue
        dx = xs[t] - xs[f]
        d.line(xs[f], y, [[0, 0], [dx, 0]], dashed=(style == "d"),
               color="#2f9e44" if style == "d" else MUTED)
        lx = min(xs[f], xs[t]) + 12
        T(d, f"m{i}", lx, y - 24, label, size=14, mono=True)
    return end


# =========================================================================== BACKEND

def b_topology():
    d = Diagram()
    d.title(40, 20, "Backend HLD - runtime topology",
            "One stateless Worker routes; one Durable Object owns every poll, write and broadcast (single writer, no races).")
    B(d, "br", 40, 300, "Browser", "green", w=180, h=90)

    d.zone("cf", 290, 110, 1210, 590, "Cloudflare  (staging + production, each with its own DO namespace and secrets)", "blue")
    B(d, "pages", 330, 180, "Pages\nstatic site, hashed assets", "green", w=300)
    B(d, "waf", 330, 320, "WAF rate-limit rule\n/stream, /history  60/min/IP", "red", w=300)
    B(d, "wk", 700, 300, "Worker  (Hono router)\nstateless: route, validate,\nedge cache, stub.fetch()", "blue", w=300)
    B(d, "cron", 560, 560, "Cron trigger\nevery minute", "yellow", w=300, h=64)

    d.zone("hub", 1040, 170, 430, 500, "SpaceWeatherHub  (1 Durable Object)\nidFromName('hub'), locationHint enam", "purple", size=15)
    B(d, "mem", 1070, 250, "Memory: LiveState + 7-day rings", "white", w=370, h=64)
    B(d, "sql", 1070, 350, "SQLite  (ctx.storage.sql)", "purple", w=370, h=64)
    B(d, "ws", 1070, 450, "WebSockets (hibernatable)", "green", w=370, h=64)
    B(d, "alarm", 1070, 560, "alarm() loop  every <= 5 s", "yellow", w=370, h=64)

    d.zone("up", 1570, 300, 330, 380, "Upstream (polled once for everyone)", "orange", size=15)
    B(d, "noaa", 1600, 360, "NOAA SWPC JSON\nX-rays, flares, RTSW,\nregions", "orange", w=270)
    B(d, "nasa", 1600, 510, "NASA DONKI\nCME analysis", "orange", w=270)

    d.arrow("br", "pages", "HTTPS")
    d.arrow("br", "waf", "/api/v1")
    d.arrow("waf", "wk")
    d.arrow("wk", "mem")
    d.arrow("cron", "alarm", "watchdog()")
    d.arrow("alarm", "noaa", dashed=True)
    d.arrow("alarm", "nasa", dashed=True)
    d.line(1070, 482, [[0, 0], [-940, 0], [-940, -92]], color="#2f9e44", dashed=True)
    T(d, "push", 330, 492, "WebSocket push: snapshot on connect,\nthen delta / alert as they happen",
      size=15, color="#2f9e44")
    T(d, "etag", 1570, 700, "fetch with If-None-Match\n304 = unchanged (cheap)", size=15, color="#e8590c")

    d.zone("does", 40, 790, 900, 230, "The backend DOES", "green")
    T(d, "does-t", 70, 850,
      "- poll NOAA / NASA once for everyone, on each feed's cadence\n"
      "- normalise, validate and store samples and events\n"
      "- detect flares, attach to regions, DBM forecast, Newell coupling\n"
      "- raise / clear alerts with de-dup and hysteresis\n"
      "- push ONE ordered stream; replay what a reconnect missed\n"
      "- answer history and event queries", size=18)
    d.zone("not", 1000, 790, 900, 230, "It does NOT", "red")
    T(d, "not-t", 1030, 850,
      "- compute anything per request (all reads come from memory)\n"
      "- compute planet / CME positions per frame (the browser does)\n"
      "- keep per-user state (no accounts in v1)\n"
      "- send email, SMS or push\n"
      "- serve the static site (Pages does)", size=18)
    d.render(BE, "05-hld-topology")


def b_components():
    d = Diagram()
    d.title(40, 20, "Backend LLD - modules (apps/worker/src)",
            "Requests enter at the top, clock ticks at the bottom.  hub/ talks to the platform only through two small interfaces.")

    d.zone("edge", 40, 100, 560, 640, "Worker entry  (stateless)", "blue")
    B(d, "idx", 80, 160, "index.ts\nfetch()  /  scheduled()", "blue", w=480)
    B(d, "sec", 80, 290, "security.ts\nOrigin allow-list for /stream\nsecurity headers", "red", w=480)
    B(d, "routes", 80, 440, "routes.ts\n/api/v1/*  - validate params\n(shared schemas), edge cache", "blue", w=480)
    T(d, "rlist", 80, 600, "state . stream . history . events\nregions . cmes/:id . health . admin/test-alert", size=14, mono=True,
      color="#1971c2")
    d.arrow("idx", "sec")
    d.arrow("sec", "routes")

    d.zone("hub", 660, 100, 1300, 900, "hub/  -  the Durable Object", "purple")
    B(d, "do", 700, 160, "SpaceWeatherHub.ts\nrestore on start, alarm(), fetch(), webSocket*", "purple", w=560)
    B(d, "sock", 1320, 160, "sockets.ts\naccept, hello, broadcast once,\nclose codes", "green", w=600)
    B(d, "sched", 700, 320, "scheduler.ts\nper-feed due times, fast windows,\nbackoff", "yellow", w=380)
    B(d, "feeds", 1120, 320, "feeds.ts\nfeed table: URL, cadence,\nstaleAfter, parser", "white", w=360)
    B(d, "poll", 1520, 320, "pollers.ts\ntimeout, ETag, 5 MB cap", "blue", w=400)
    B(d, "norm", 1520, 480, "normalize/\ngoesXray, goesFlares, rtsw,\nregions, donki", "white", w=400)
    B(d, "comp", 1080, 480, "compute/\nflares . cmes . wind . alerts", "teal", w=400)
    B(d, "state", 700, 480, "state.ts\nLiveState, rings,\ndelta builder", "white", w=340)
    B(d, "dlog", 700, 640, "deltaLog.ts\nlast hour of messages\n(memory only)", "gray", w=340)
    B(d, "repo", 1080, 640, "repo.ts\nmigrations, upserts,\nqueries, prune", "purple", w=400)
    B(d, "met", 1520, 640, "metrics.ts\ncounters + JSON log lines", "gray", w=400)
    B(d, "mig", 1080, 800, "migrations/  0001_init.sql ...\nforward-only, additive", "purple", w=400)

    d.line(560, 485, [[0, 0], [80, 0], [80, -293], [140, -293]])
    T(d, "sf", 400, 535, "stub.fetch -> hub", size=14, color="#1971c2")
    d.arrow("do", "sock")
    d.arrow("do", "sched")
    d.arrow("sched", "feeds")
    d.arrow("feeds", "poll")
    d.arrow("poll", "norm")
    d.arrow("norm", "comp")
    d.arrow("comp", "state")
    d.arrow("state", "dlog")
    d.arrow("comp", "repo")
    d.arrow("repo", "mig")
    d.arrow("comp", "met")

    d.zone("ifc", 40, 780, 560, 220, "Hosting adapter", "teal")
    T(d, "ifc-t", 70, 830,
      "hub/ depends only on:\n"
      "  Storage   sql exec / query\n"
      "  Sockets   accept / send / list\n\n"
      "Durable Objects now; Node (better-sqlite3 + ws)\nfor the Oracle fallback.", size=15)

    d.zone("pk", 40, 1040, 1920, 110, "packages/  (shared with the frontend)", "teal")
    B(d, "pk1", 80, 1080, "shared - types, schemas, protocol", "white", w=500, h=50, size=15)
    B(d, "pk2", 640, 1080, "physics - dbm, newell, classFromFlux, isEarthDirected", "white", w=700, h=50, size=15)
    d.render(BE, "04-components-router")


def b_schema():
    d = Diagram()
    d.title(40, 20, "Backend LLD - SQLite schema inside the Durable Object",
            "Columns map 1:1 to packages/shared types.  Times are unix seconds UTC.  Source: backend/schema.sql")
    G = 50

    def col(x, specs):
        y = 120
        for id, name, rows, color, note in specs:
            _, _, _, h = d.table(id, x, y, name, rows, color, w=440, note=note)
            y += h + G + (16 if note else 0)

    col(40, [
        ("xray", "xray_sample  WITHOUT ROWID", ["ts          INTEGER PK", "flux_long   REAL  -- 0.1-0.8 nm",
                                               "flux_short  REAL", "satellite   INTEGER"], "blue", "1 row / min, keep 7 d"),
        ("wind", "wind_sample  WITHOUT ROWID", ["ts          INTEGER PK", "speed, density, temperature REAL",
                                               "bx, by, bz, bt  REAL  -- nT", "newell      REAL  -- derived"],
         "blue", "1 row / min, keep 7 d"),
        ("fstat", "feed_status", ["feed_id     TEXT PK", "etag        TEXT", "last_ok_at  INTEGER",
                                  "data_ts     INTEGER", "error       TEXT  -- query string stripped",
                                  "fail_count  INTEGER  -- drives backoff"], "gray", None),
        ("meta", "meta", ["key   TEXT PK  -- schema_v, seq, alarm_last_at", "value TEXT"], "gray", None),
    ])
    col(540, [
        ("region", "sunspot_region", ["region_no   INTEGER PK", "observed_on TEXT    PK", "lat, lon    REAL",
                                      "location    TEXT  -- N20E46", "area_msh, spot_count INTEGER",
                                      "mag_class   TEXT", "p_m, p_x    INTEGER"], "yellow", "keep 30 d"),
        ("flare", "flare", ["id          TEXT PK  -- begin ISO", "begin_at, peak_at, end_at",
                            "cls         TEXT  -- M2.3", "peak_flux   REAL",
                            "status      TEXT  -- rising|decaying|ended", "region_no   INTEGER",
                            "lat, lon    REAL"], "red", "index flare_begin, keep 30 d"),
    ])
    col(1040, [
        ("cme", "cme", ["id            TEXT PK  -- DONKI id", "launch_at     INTEGER  -- at 21.5 Rs",
                        "speed, lat, lon, half_angle REAL", "earth_directed INTEGER", "flare_id      TEXT",
                        "updated_at    INTEGER"], "red", "index cme_launch, keep 30 d"),
        ("fc", "cme_forecast", ["cme_id        TEXT PK FK", "computed_at   INTEGER", "eta           INTEGER",
                                "arrival_speed REAL", "gamma, w      REAL"], "pink", "recomputed when DONKI revises"),
        ("alert", "alert", ["id        TEXT PK  -- '<RULE>:<refId>'", "rule      TEXT", "level     TEXT  -- watch|warning",
                            "title, message TEXT", "ref_type, ref_id TEXT", "raised_at INTEGER",
                            "cleared_at INTEGER"], "red", "index alert_raised"),
    ])
    d.arrow("flare", "region-body", "region_no")
    d.arrow("fc", "cme-body", "cme_id")

    d.zone("where", 1540, 120, 620, 440, "What is persisted, what isn't", "green")
    T(d, "where-t", 1565, 170,
      "SQLite   samples, regions, flares, CMEs,\n"
      "         forecasts, alerts, feed status\n"
      "         seq in meta - SAME txn as the data\n\n"
      "Memory   LiveState (6 h window, lists)\n"
      "         7-day rings 2 x 10,080 x 9 cols\n"
      "         ~1.5 MB Float64Array\n"
      "         rebuilt from SQLite on start\n\n"
      "Memory   delta log (last hour) ONLY\n"
      "         after restart: ?since -> snapshot", size=15, mono=True)
    d.zone("budget", 1540, 600, 620, 340, "Free-tier budget & upkeep", "yellow")
    T(d, "budget-t", 1565, 650,
      "Writes   ~6-7k rows/day   (cap 100k)\n"
      "Indexes  only the three shown\n\n"
      "Prune    hourly, <= 1,000 rows/batch\n"
      "         samples > 7 d, regions > 30 d\n"
      "         events > 30 d, cleared alerts > 30 d\n\n"
      "Migrate  meta.schema_v; pending files in\n"
      "         one txn in blockConcurrencyWhile", size=15, mono=True)
    d.render(BE, "02-db-schema")


def b_tick():
    d = Diagram()
    d.title(40, 20, "Backend LLD - one alarm() tick",
            "Everything runs on the DO's single thread.  Nothing is written or sent when nothing changed.")
    d.zone("tick", 40, 100, 1370, 620, "alarm()", "yellow")
    W, H = 290, 96
    xs = [80, 410, 740, 1070]
    B(d, "t1", xs[0], 170, "alarm fires\nnow = Date.now()/1000", "yellow", w=W, h=H)
    B(d, "t2", xs[1], 170, "scheduler.due(now)\nfeeds whose time <= now", "white", w=W, h=H)
    B(d, "t3", xs[2], 170, "pollFeed x N in parallel\nPromise.allSettled", "blue", w=W, h=H)
    B(d, "t4", xs[3], 170, "normalize -> validate\n-> diff vs memory\n-> into Delta d", "white", w=W, h=H)
    B(d, "t5", xs[3], 340, "compute(d)\nflare lifecycle, regions,\nNewell, DBM forecasts", "teal", w=W, h=H)
    B(d, "t6", xs[2], 340, "alerts.evaluate\nnew + cleared alerts", "red", w=W, h=H)
    B(d, "t7", xs[1], 340, "refresh FeedStatus\nchanged -> d.feeds", "gray", w=W, h=H)
    d.box("t8", 95, 335, 260, 106, "d empty?", "yellow", shape="diamond")
    B(d, "t9", xs[0], 520, "SQL transaction\nupsert rows\nseq += 1 per msg", "purple", w=W, h=H)
    B(d, "t10", xs[1], 520, "deltaLog.push\nbroadcast\n(serialise once)", "green", w=W, h=H)
    B(d, "t11", xs[2], 520, "metrics.tick\n(+ hourly prune)", "gray", w=W, h=H)
    B(d, "t12", xs[3], 520, "setAlarm(min(next,\nnow + 5 s))", "yellow", w=W, h=H)
    for a, b in [("t1", "t2"), ("t2", "t3"), ("t3", "t4"), ("t4", "t5"), ("t5", "t6"), ("t6", "t7"),
                 ("t7", "t8"), ("t9", "t10"), ("t10", "t11"), ("t11", "t12")]:
        d.arrow(a, b)
    d.arrow("t8", "t9", "no")
    d.line(95, 388, [[0, 0], [-30, 0], [-30, 278], [1120, 278], [1120, 228]], color="#f08c00", dashed=True)
    T(d, "skip", 400, 672, "yes: nothing to write or send - just re-arm", size=14, color="#f08c00")

    d.zone("pf", 1450, 100, 760, 620, "pollFeed(feed)", "blue")
    B(d, "f1", 1490, 160, "fetch(url)\nIf-None-Match: etag\ntimeout 8 s", "blue", w=340)
    B(d, "f304", 1490, 330, "304\nunchanged\nlast_ok_at = now", "green", w=210, h=120)
    B(d, "f200", 1720, 330, "200\nread <= 5 MB, parse\nrows newer than\nstored ts only", "blue", w=230, h=120)
    B(d, "ferr", 1970, 330, "error\nstatus / timeout /\nbad data\nfail_count++", "red", w=210, h=120)
    B(d, "fbo", 1970, 520, "backoff\ncadence x 2^n\ncap 5 min", "orange", w=210)
    for t in ["f304", "f200", "ferr"]:
        d.arrow("f1", t)
    d.arrow("ferr", "fbo")
    T(d, "stale", 1490, 520, "Last good values stay.\nFeedStatus.stale = true once\nnow - data_ts > staleAfter",
      size=15, color="#1971c2")

    d.zone("ft", 40, 760, 1110, 240, "Feed table  (same as FEEDS in apps/mock)", "gray")
    T(d, "ft-t", 70, 810,
      "FeedId       Cadence  Fast window                 staleAfter\n"
      "goes_xray    60 s     5 s, :55 to :20 each min    300 s\n"
      "goes_flares  60 s     5 s while a flare rises     600 s\n"
      "rtsw         60 s     5 s, same window as X-ray   300 s\n"
      "regions      30 min   -                           3 h\n"
      "donki        5 min    -                           1 h", size=15, mono=True)
    d.zone("val", 1190, 760, 1020, 240, "Upstream validation  +  watchdog", "red")
    T(d, "val-t", 1220, 810,
      "GOES    flux > 0; fill values (-99999) dropped\n"
      "RTSW    active=false dropped; one row per ts\n"
      "Region  location must parse, else kept w/o lat/lon\n"
      "DONKI   speed, lat, lon, halfAngle must be numbers\n\n"
      "Cron watchdog (1 min): alarm_last_at > 30 s old\n"
      "  -> log error, re-arm alarm; /health = degraded", size=15, mono=True)
    d.render(BE, "06-lld-tick")


def b_session():
    d = Diagram()
    d.title(40, 20, "Backend LLD - WebSocket session",
            "Resume with ?since, fall back to a snapshot.  Every snapshot / delta / alert carries a seq.")
    end = seq(d, 40, 110, [
        ("c", "Browser", "green", 160), ("w", "Worker", "blue", 620), ("h", "Hub (DO)", "purple", 1020),
        ("r", "delta ring\n(last hour)", "gray", 1360)], [
        ("c", "w", "GET /stream?since=1042  (upgrade)", ""),
        ("w", "", "check Origin allow-list - bad: close 1008", "n"),
        ("w", "h", "stub.fetch(upgrade)", ""),
        ("h", "c", "hello {protocol:1, minClient:1, seq:1050}", "d"),
        ("h", "r", "has 1043?", ""),
        ("r", "h", "yes -> 1043..1050", "d"),
        ("h", "c", "delta 1043 ... 1050    (or snapshot seq 1050)", "d"),
        ("h", "c", "delta / alert as they happen", "d"),
        ("h", "c", "ping  every 15 s", "d"),
        ("c", "h", "pong", ""),
        ("c", "", "sees a seq gap", "n"),
        ("c", "h", "resync", ""),
        ("h", "c", "snapshot (replaces client state)", "d"),
    ], gap=62)

    d.zone("cc", 1530, 110, 620, 260, "Close codes", "red")
    T(d, "cc-t", 1555, 160,
      "1012  service restart (deploy)\n"
      "      -> reconnect after random 0-3 s\n\n"
      "1013  too many sockets (cap per DO)\n"
      "      -> client falls back to polling\n\n"
      "1008  Origin not allowed -> stays closed", size=15, mono=True)
    d.zone("to", 1530, 410, 620, 230, "Timers", "yellow")
    T(d, "to-t", 1555, 460,
      "server ping       every 15 s\n"
      "no pong for 45 s  -> server closes\n"
      "client: no msg 40 s -> drops socket\n\n"
      "hello is additive: old clients\nignore unknown message types", size=15, mono=True)
    d.render(BE, "07-lld-socket-session")


def b_alerts():
    d = Diagram()
    d.title(40, 20, "Backend LLD - alert engine",
            "Ids are deterministic ('<RULE>:<refId>'), so raising twice is a no-op.  Raise = one alert message; clear = in a delta.")
    d.zone("sm", 40, 100, 900, 430, "Life of one alert id", "red")
    B(d, "s0", 80, 260, "not raised", "white", w=180, h=70)
    B(d, "s1", 380, 250, "ACTIVE\nsent once as\n'alert' msg", "red", w=200, h=100)
    B(d, "s2", 700, 250, "CLEARED\nclearedAt set,\nsent in delta", "gray", w=200, h=100)
    d.arrow("s0", "s1", "raise rule")
    d.arrow("s1", "s2", "clear rule")
    T(d, "noop", 330, 170, "raise again with the same id -> no-op (de-dup)", size=15, color="#e03131")
    d.line(800, 350, [[0, 0], [0, 90], [-320, 90], [-320, 0]], color="#868e96", dashed=True)
    T(d, "rer", 520, 448, "FEED_STALE only: re-raised with the same id", size=14, color="#868e96")

    d.zone("rules", 980, 100, 1180, 430, "Rules", "yellow")
    T(d, "rules-t", 1005, 150,
      "Rule        Raise when                    Level    Clear when\n"
      "FLARE_M     running max >= 1e-5 W/m2      watch    flare ended\n"
      "FLARE_X     running max >= 1e-4 W/m2      warning  flare ended\n"
      "CME_EARTH   new/revised CME Earth-bound   warning  eta + 12 h\n"
      "                                                   (raised + 3 d if no eta)\n"
      "BZ_SOUTH    Bz <= -10 nT for 3 min        warning  Bz > -5 nT for 10 min\n"
      "FEED_STALE  a feed goes stale             watch    feed fresh again\n"
      "TEST        POST /admin/test-alert        watch    after 10 min\n\n"
      "id:  FLARE_*:<flareId>  CME_EARTH:<cmeId>  BZ_SOUTH:<first ts>\n"
      "     FEED_STALE:<feedId>  TEST:<ts>:<seq>", size=15, mono=True)

    d.zone("bz", 40, 570, 1300, 260, "BZ_SOUTH hysteresis  (no flapping near the threshold)", "blue")
    B(d, "z1", 80, 650, "Bz <= -10 nT\n3 minutes in a row", "blue", w=260)
    B(d, "z2", 400, 650, "RAISE\nwarning", "red", w=170)
    B(d, "z3", 630, 650, "between -10 and -5\nstays ACTIVE", "white", w=260)
    B(d, "z4", 950, 650, "Bz > -5 nT\n10 minutes in a row\n-> CLEAR", "green", w=240)
    for a, b in [("z1", "z2"), ("z2", "z3"), ("z3", "z4")]:
        d.arrow(a, b)

    d.zone("tst", 1380, 570, 780, 260, "Test alert path (measures delivery)", "purple")
    B(d, "a1", 1420, 640, "POST /api/v1/admin/test-alert\nAuthorization: Bearer ADMIN_TOKEN", "purple", w=700)
    B(d, "a2", 1420, 760, "sent at once, outside the tick  ->  target < 1 s", "green", w=700, h=60)
    d.arrow("a1", "a2")
    d.render(BE, "08-lld-alert-engine")


def b_ops():
    d = Diagram()
    d.title(40, 20, "Backend LLD - security, observability, deployment",
            "How a request is filtered, how the system is watched, and how it ships.")
    d.zone("sec", 40, 100, 2120, 300, "Request pipeline (security)", "red")
    xs = [80, 500, 920, 1340, 1760]
    lbl = [("r1", "Request", "white"), ("r2", "WAF rate limit\n/stream, /history\n~60/min per IP", "red"),
           ("r3", "Origin allow-list\n(/stream only)\nbad -> 1008", "red"),
           ("r4", "Param validation\nshared schemas\nbad -> 400 {error}", "yellow"),
           ("r5", "Hub (DO)\nJSON only, nosniff,\nsocket cap -> 1013", "purple")]
    for x, (id, s, c) in zip(xs, lbl):
        B(d, id, x, 160, s, c, w=340, h=110)
    for a, b in zip(lbl, lbl[1:]):
        d.arrow(a[0], b[0])
    T(d, "sec-n", 80, 310, "Secrets NASA_API_KEY, ADMIN_TOKEN = Wrangler secrets per env; logged URLs drop query strings.   "
                           "/mock/* does not exist in the Worker (contract test asserts 404).", size=14, color="#e03131")

    d.zone("obs", 40, 440, 1040, 520, "Observability", "blue")
    B(d, "o1", 80, 510, "tick", "yellow", w=150, h=60)
    B(d, "o2", 300, 490, "JSON log line per tick\nseq, ms, per-feed st/ms/kb,\nsockets, msgs", "white", w=340)
    B(d, "o3", 300, 640, "Analytics Engine metrics\ningest_lag_s, push_ms,\nalarm_lag_s, sockets, errors", "blue", w=340)
    B(d, "o4", 720, 640, "GET /health\nok | degraded | down", "green", w=320)
    B(d, "o5", 720, 820, "UptimeRobot\nexpects \"status\":\"ok\"", "gray", w=320)
    d.arrow("o1", "o2")
    d.arrow("o1", "o3")
    d.arrow("o3", "o4")
    d.arrow("o5", "o4", "polls")
    T(d, "sli", 80, 800, "SLIs\nfreshness p95  <= 5 s\n/health ok      99.5 % min\nalarm lag      < 30 s",
      size=15, mono=True)

    d.zone("dep", 1120, 440, 1040, 520, "Deployment", "green")
    B(d, "d1", 1160, 510, "PR", "white", w=120, h=60)
    B(d, "d2", 1350, 490, "CI: typecheck, lint, test,\ncontract suite", "yellow", w=340)
    B(d, "d3", 1770, 500, "staging\npreview", "blue", w=170)
    B(d, "d4", 1160, 660, "merge to main", "white", w=200, h=60)
    B(d, "d5", 1770, 650, "production", "green", w=170, h=70)
    d.arrow("d1", "d2")
    d.arrow("d2", "d3")
    d.arrow("d4", "d5", "wrangler deploy")
    T(d, "dep-n", 1160, 770,
      "Rollback   wrangler rollback (schema is additive)\n"
      "Restart    sockets close 1012 -> clients back in 0-3 s\n"
      "           ring empty -> 1 snapshot each (~55 kB)\n"
      "           1,000 clients ~ 55 MB over 3 s", size=15, mono=True)
    d.render(BE, "09-lld-ops")


# ========================================================================== FRONTEND

def f_layers():
    d = Diagram()
    d.title(40, 20, "Frontend HLD - layers and the dependency rule",
            "apps/web: a Vite + React SPA with a three.js scene, on Cloudflare Pages, fed by one WebSocket.")
    layers = [
        ("l1", "shell/", "AppShell . TopBar . ConnectionBadge . FreshnessBadge\nAlertBell . AlertToaster . useAlertDelivery", "purple"),
        ("l2", "pages/", "Live . Status  (built)    Sun . Replay . Events . EventDetail  (planned)", "purple"),
        ("l3", "hud/", "SceneClock . SceneControls . CmeCard . InfoCard . charts/ (uPlot)\nPanelBoundary . SceneBoundary . SceneFallback", "green"),
        ("l4", "scene/", "SceneCanvas (lazy) . SunMesh . SunActivity . PlanetBodies . CmeShells\nCameraRig . Labels . time.ts (sceneTime)", "blue"),
        ("l5", "stream/", "LiveStream (client.ts) . apply.ts . useLiveStream", "orange"),
        ("l6", "store/", "live.ts . ui.ts . alerts.ts   (planned: history.ts)", "yellow"),
        ("l7", "lib/", "pure, unit-tested: series . ephemeris . cme . heliographic . format\nfreshness . alerts . clock . api . localCache . chime . webgl", "gray"),
    ]
    y = 110
    for id, name, mods, c in layers:
        B(d, id, 40, y, name, c, w=170, h=84, size=18)
        T(d, id + "-m", 240, y + 14, mods, size=15)
        y += 108

    # dependency graph
    d.zone("dg", 760, 100, 620, 760, "Who may import whom", "gray")
    B(d, "g-pg", 980, 160, "pages", "purple", w=170, h=56)
    B(d, "g-hud", 810, 290, "hud", "green", w=170, h=56)
    B(d, "g-sc", 1150, 290, "scene", "blue", w=170, h=56)
    B(d, "g-st", 980, 440, "store", "yellow", w=170, h=56)
    B(d, "g-str", 810, 590, "stream", "orange", w=170, h=56)
    B(d, "g-lib", 980, 740, "lib", "gray", w=170, h=56)
    d.arrow("g-pg", "g-hud")
    d.arrow("g-pg", "g-sc")
    d.arrow("g-hud", "g-st", "read")
    d.arrow("g-sc", "g-st", "read")
    d.arrow("g-str", "g-st", "WRITE", color="#e8590c")
    d.arrow("g-str", "g-lib")
    d.arrow("g-st", "g-lib")
    T(d, "dg-n", 1170, 590, "lib: no React,\nno app imports\n\nstream runs under\nnode:test vs the\nreal mock", size=14, color=MUTED)

    d.zone("goals", 1420, 100, 560, 760, "Four goals behind every choice", "teal")
    T(d, "goals-t", 1445, 150,
      "1  Never wait on the network to draw.\n"
      "   IndexedDB cache -> REST -> socket.\n\n"
      "2  60 fps without React.\n"
      "   Per-frame work in useFrame with\n"
      "   getState(), written via refs.\n"
      "   React re-renders ~1 / s.\n\n"
      "3  One writer per kind of state.\n"
      "   stream -> liveStore\n"
      "   user   -> useUi\n"
      "   alerts -> useAlerts\n\n"
      "4  Server time everywhere.\n"
      "   serverNow(clock, clockAt),\n"
      "   never the device clock.", size=16)
    d.render(FE, "05-hld-layers")


def f_state():
    d = Diagram()
    d.title(40, 20, "Frontend LLD - the three stores (one writer each)",
            "Scene reads with getState() inside useFrame; HUD subscribes with hooks (~1 re-render / s).")
    B(d, "w1", 40, 180, "stream/apply.ts", "orange", w=220)
    B(d, "w2", 40, 560, "user input", "green", w=220)
    B(d, "w3", 40, 820, "useAlerts.receive()\n(alert delivery)", "red", w=220)

    d.table("live", 340, 120, "liveStore  (store/live.ts)", [
        "seq        number | null   null until server answers",
        "clock, clockAt              serverNow() inputs",
        "xray, wind  ColumnSeries    Float64Array, cap 10,080",
        "seriesRev  number           bumped on series change",
        "regions, regionsAt          rotated 13.2 deg/day",
        "flares, cmes, alerts, feeds upsert by id, pruned",
        "conn  {status, source, failures, gaps, resyncs}"], "orange", w=620)
    d.table("ui", 340, 470, "useUi  (store/ui.ts)", [
        "scale     readable | true        localStorage",
        "view + viewNonce                 overview|top|sun|earth|focus",
        "keyOpen                          localStorage",
        "selected  Selection | null       opens InfoCard",
        "minimized {xray, wind, cme}      localStorage",
        "panelsHidden"], "green", w=620)
    d.table("al", 340, 790, "useAlerts  (store/alerts.ts)", [
        "acked   Set<id>   IndexedDB  cme:alerts:acked:v1",
        "toasts  Alert[]   memory, at most 3",
        "sound, notify     localStorage"], "red", w=620)
    d.arrow("w1", "live-body")
    d.arrow("w2", "ui-body")
    d.arrow("w3", "al-body")

    B(d, "r1", 1080, 120, "scene/  useFrame\ngetState() - no re-render", "blue", w=380)
    B(d, "r2", 1080, 270, "hud/  hooks\n~1 commit / s", "green", w=380)
    B(d, "r3", 1080, 420, "IndexedDB  6 h window\nsaved every 30 s + pagehide", "gray", w=380)
    d.arrow("live-body", "r1")
    d.arrow("live-body", "r2")
    d.arrow("live-body", "r3")
    d.table("hist", 1560, 560, "history  (planned, Replay)", [
        "range   [from, to]",
        "res     1m | 5m",
        "xray, wind  ColumnSeries",
        "events  {flares, cmes, alerts}",
        "status"], "yellow", w=420,
        note="separate from liveStore: replay never\ncorrupts live; back to live is instant")
    d.arrow("hist", "r2", "in replay", dashed=True)
    d.render(FE, "02-client-state")


def f_boot():
    d = Diagram()
    d.title(40, 20, "Frontend LLD - LiveStream: boot and connection states",
            "Tested end to end in apps/web/test/stream.test.ts against the real mock with chaos.")
    B(d, "s1", 40, 140, "CACHE\nIndexedDB -> applySnapshot\nsource cache, trustSeq false", "gray", w=320)
    B(d, "s2", 440, 140, "REST\nGET /state  (5 s timeout)\n-> applySnapshot", "blue", w=300)
    B(d, "s3", 820, 140, "CONNECTING\nWS /stream?since=<seq>", "yellow", w=300)
    B(d, "s4", 1200, 140, "LIVE\nconn.status = live", "green", w=280)
    for a, b in [("s1", "s2"), ("s2", "s3"), ("s3", "s4")]:
        d.arrow(a, b)
    T(d, "p1", 40, 260, "paint at once", size=14, color="#2f9e44")

    B(d, "s5", 1200, 400, "RESYNCING\nsend {type:'resync'}\nignore until snapshot", "orange", w=280)
    B(d, "s6", 520, 400, "RECONNECTING\n500 ms x 2^(n-1), cap 30 s,\njitter", "red", w=420)
    B(d, "s7", 40, 400, "POLLING  (+ reconnecting)\nGET /state every 30 s", "purple", w=330)
    d.arrow("s4", "s5", "seq gap")
    d.line(1440, 400, [[0, 0], [0, -150]], color="#2f9e44")
    T(d, "snap", 1450, 300, "snapshot", size=14, color="#2f9e44")
    d.arrow("s5", "s6", "10 s, no snapshot")
    d.arrow("s6", "s7", "3 failures")
    d.line(860, 400, [[0, 0], [0, -150]])
    T(d, "retry", 800, 320, "retry", size=15)
    d.line(1250, 250, [[0, 0], [0, 50], [-330, 50], [-330, 150]], color="#e03131")
    T(d, "drop", 960, 258, "close / error / 40 s silence", size=15, color="#e03131")

    d.zone("msg", 40, 600, 860, 240, "In LIVE: applying a message", "green")
    T(d, "msg-t", 70, 650,
      "snapshot  -> replace the store\n"
      "delta     -> seq must be seq + 1 -> apply\n"
      "             (series append, lists upsert, regions replace)\n"
      "alert     -> applyAlert + onAlert (toast, chime ...)\n"
      "seq > n+1 -> RESYNCING\n"
      "ping      -> pong", size=15, mono=True)
    d.zone("side", 940, 600, 560, 240, "Always", "gray")
    T(d, "side-t", 965, 650,
      "save store to IndexedDB every 30 s\n  and on pagehide (6 h window)\n\n"
      "online / tab visible again\n  -> reconnect at once", size=15)
    d.zone("plan", 1540, 100, 640, 300, "Planned changes", "yellow")
    T(d, "plan-t", 1565, 150,
      "[D2/F3] validate every message\n"
      "against the shared schema;\n"
      "bad -> conn.invalid++, drop, resync\n\n"
      "[D3] hello: if minClient >\n"
      "CLIENT_PROTOCOL -> save cache,\n"
      "reload once\n\n"
      "[S2] close 1012 -> wait random 0-3 s\n"
      "     close 1013 -> POLLING", size=16)
    d.render(FE, "06-lld-boot-connection")


def f_alerts():
    d = Diagram()
    d.title(40, 20, "Frontend LLD - alert delivery",
            "From socket to toast in ~0.1 s (tested < 1 s).  Sound and notification are extra layers, never the only one.")
    B(d, "a1", 40, 150, "'alert' message", "orange", w=220)
    B(d, "a2", 330, 150, "applyAlert\n(liveStore)", "orange", w=220)
    B(d, "a3", 620, 150, "onAlert ->\nuseAlerts.receive()", "red", w=260)
    for a, b in [("a1", "a2"), ("a2", "a3")]:
        d.arrow(a, b)
    d.box("q1", 540, 290, 420, 170, "cleared, read or\nalready shown?", "yellow", shape="diamond")
    d.arrow("a3", "q1")
    B(d, "n1", 1060, 340, "no toast", "gray", w=180, h=70)
    d.arrow("q1", "n1")
    T(d, "y1", 975, 340, "yes", size=15)
    B(d, "t1", 620, 540, "Toast  (max 3)\nrole=alert for warnings", "red", w=260)
    d.arrow("q1", "t1")
    T(d, "n1t", 765, 480, "no", size=15)
    d.box("q2", 120, 700, 420, 170, "< 30 min old\nand sound on?", "yellow", shape="diamond")
    d.box("q3", 800, 700, 460, 180, "notify on, permission\ngranted, tab hidden?", "yellow", shape="diamond")
    d.arrow("t1", "q2")
    d.arrow("t1", "q3")
    B(d, "c1", 240, 950, "chime", "teal", w=180, h=64)
    B(d, "c2", 880, 950, "system notification", "purple", w=300, h=64)
    d.arrow("q2", "c1")
    d.arrow("q3", "c2")
    T(d, "y2", 345, 895, "yes", size=15)
    T(d, "y3", 1045, 905, "yes", size=15)

    d.zone("show", 1340, 120, 820, 300, "'Show me' and reading state", "blue")
    T(d, "show-t", 1365, 170,
      "lib/alerts.ts  alertTarget(alert)\n"
      "  FLARE_*   -> Selection: region / flare\n"
      "  CME_EARTH -> Selection: CME (Focus camera)\n"
      "  FEED_STALE-> /status\n\n"
      "acked ids -> IndexedDB cme:alerts:acked:v1\n"
      "  trimmed to current + newest 200\n"
      "AlertBell lists active + last 24 h", size=15, mono=True)
    d.zone("pl", 1340, 460, 820, 170, "Planned [F1]", "yellow")
    T(d, "pl-t", 1365, 510,
      "sw.ts (~60 lines, hand-written):\n"
      "  showNotification() so Android works\n"
      "  offline app shell cache", size=15, mono=True)
    d.render(FE, "07-lld-alert-delivery")


def f_frame():
    d = Diagram()
    d.title(40, 20, "Frontend LLD - one clock, two loops (frame loop vs React)",
            "Everything that moves is a pure function of sceneTime(), so Replay only has to change the time source.")
    d.zone("ts", 40, 100, 760, 420, "Time source  (scene/time.ts)", "yellow")
    B(d, "live", 80, 170, "timeSource = live\nserverNow(clock, clockAt) =\nclock.now + (wall - clockAt)\nx clock.speed", "green", w=330)
    B(d, "rep", 440, 170, "timeSource = replay\nt + elapsed x speed\n(planned)", "yellow", w=320)
    B(d, "st", 260, 380, "sceneTime()", "orange", w=280, h=70, size=20)
    d.arrow("live", "st")
    d.arrow("rep", "st")

    d.zone("fl", 860, 100, 1300, 420, "Frame loop  -  useFrame, 60 fps, no setState ever", "blue")
    items = [("e1", "framePositions\nastronomy-engine, 3 planets\n< 0.1 ms"),
             ("e2", "SunActivity\nspots every 0.25 s,\nflare pulse per frame"),
             ("e3", "CmeShells\ndbmAt() per CME (<= 6)"),
             ("e4", "Labels\nDOM via refs,\ndeclutter (<= 15)")]
    x = 890
    for id, s in items:
        B(d, id, x, 170, s, "white", w=300, h=110)
        x += 315
    B(d, "obj", 1200, 380, "three.js objects + DOM refs", "blue", w=420, h=70)
    for id, _ in items:
        d.arrow(id, "obj")
    d.arrow("st", "e1")

    d.zone("rl", 40, 570, 1100, 330, "React loop  -  ~1 commit / s", "green")
    B(d, "c1", 80, 640, "liveStore\n(or history in replay)", "orange", w=290)
    B(d, "c2", 450, 640, "charts (uPlot)\nredraw <= 1 / s, 6 h window\nlog X-ray, 4 wind panels", "green", w=330)
    B(d, "c3", 450, 780, "ages, countdowns, badges", "green", w=330, h=64)
    d.arrow("c1", "c2")
    d.arrow("c1", "c3")
    T(d, "rl-n", 820, 650, "shared crosshair,\nkeyboard reading (<- ->),\ntable view per chart", size=14, color=MUTED)

    d.zone("rr", 1180, 570, 980, 330, "Rendering rules", "gray")
    T(d, "rr-t", 1205, 620,
      "coords   J2000 ecliptic, 1 unit = 1 AU, (x, z, -y)\n"
      "sun      lon 0 faces Earth (+Z Earth, +X W, +Y N)\n"
      "depth    logarithmic; shaders include logdepth\n"
      "hidden   frameloop paused\n"
      "dpr      capped;  reduced motion slows camera", size=15, mono=True)
    d.render(FE, "08-lld-frame-loop")


def f_replay():
    d = Diagram()
    d.title(40, 20, "Frontend LLD - Replay and Events (planned, UF7 / FR-8)",
            "Replay gets its own store and a worker for parsing, so the live view is never touched.")
    d.zone("rp", 40, 100, 2120, 400, "Replay", "yellow")
    steps = [("p1", "/replay?t=<unix>", "white"),
             ("p2", "history.load\nfrom t - 6 h, to t + 1 h\nsnapped to 5 min [C1]", "yellow"),
             ("p3", "GET /history xray, wind\nGET /events?since=t-7d", "orange"),
             ("p4", "history.worker.ts\nJSON -> Float64Array\ntransferred, no copy", "teal"),
             ("p5", "history store", "yellow")]
    x = 80
    for id, s, c in steps:
        _, _, w, _ = B(d, id, x, 170, s, c, w=330, h=110)
        x += 410
    for a, b in zip(steps, steps[1:]):
        d.arrow(a[0], b[0])
    B(d, "tb", 490, 360, "TimelineBar\n7-day track, flare ticks, CME launches\ndrag or <- ->", "yellow", w=440)
    B(d, "ts", 1310, 360, "useUi.timeSource = replay\nsceneTime() -> t", "orange", w=360)
    d.arrow("tb", "ts", "on move")
    T(d, "url", 1710, 380, "URL ?t= updated on release\n(history.replaceState)", size=14, color=MUTED)

    d.zone("ev", 40, 540, 2120, 340, "Events", "red")
    B(d, "e1", 80, 620, "/events\none table, newest first\nfilter by kind and class", "red", w=340)
    B(d, "e2", 560, 590, "/events/flare/:id\nclass, times, region,\nX-ray curve (1 m)", "white", w=340)
    B(d, "e3", 560, 740, "/events/cme/:id\nGET /cmes/:id; DBM distance\nand speed vs time, arrival", "white", w=380)
    B(d, "e4", 1100, 660, "'Replay this moment'\n/replay?t = beginAt - 30 min", "yellow", w=380)
    d.arrow("e1", "e2")
    d.arrow("e1", "e3")
    d.arrow("e2", "e4")
    d.arrow("e3", "e4")
    T(d, "ev-n", 1560, 640, "data: GET /events?since = now - 7 d\nrows link to detail and replay", size=14, color=MUTED)
    d.render(FE, "09-lld-replay-events")


def f_resilience():
    d = Diagram()
    d.title(40, 20, "Frontend LLD - failure handling and load budget",
            "Each failure degrades one part; the rest of the page keeps working.")
    rows = [("Offline at boot", "cached state, 'SAVED' on clock"),
            ("Socket drops", "'Reconnecting...', catch up via ?since"),
            ("3 failed reconnects", "'Polling', numbers every 30 s"),
            ("Seq gap / bad msg", "silent resync (snapshot)"),
            ("Feed stale on server", "amber age, FreshnessBadge, FEED_STALE"),
            ("No WebGL", "SceneFallback: same facts as text"),
            ("Scene chunk throws", "SceneBoundary -> fallback"),
            ("A chart or card throws", "PanelBoundary: only that panel"),
            ("IndexedDB blocked", "no cache, acks not remembered"),
            ("Notifications blocked", "bell explains; toast + sound stay")]
    d.text("h1", 60, 110, "Failure", size=18, color="#e03131")
    d.text("h2", 440, 110, "What the user sees", size=18, color="#2f9e44")
    y = 150
    for i, (f, s) in enumerate(rows):
        B(d, f"f{i}", 40, y, f, "red", w=320, h=54, size=15)
        B(d, f"s{i}", 420, y, s, "green", w=440, h=54, size=15)
        d.arrow(f"f{i}", f"s{i}")
        y += 70

    d.zone("cs", 940, 100, 1220, 440, "Code splitting  (gzip, bar length ~ size)", "blue")
    chunks = [("index - React, router, stream, stores, shell", 85, "always", "purple"),
              ("SceneCanvas + ephemeris", 271, "Live page with WebGL", "blue"),
              ("HudPanels (uPlot + charts)", 27, "Live page", "green"),
              ("InfoCard", 3, "first click", "white"),
              ("Earth textures (WebP)", 384, "after scene, fades in", "gray")]
    y = 160
    for i, (n, kb, when, c) in enumerate(chunks):
        w = max(30, int(kb * 1.6))
        d.box(f"k{i}", 980, y, w, 40, "", c)
        T(d, f"kn{i}", 980 + w + 16, y + 8, f"{kb} kB  {n}  -  {when}", size=15)
        y += 70
    T(d, "bud", 980, 510, "Budget [T3/F4]: interactive < 2 s on Fast 3G, empty cache (Lighthouse CI)",
      size=15, color="#1971c2")

    d.zone("sx", 940, 580, 1220, 220, "Security, accessibility, testing", "gray")
    T(d, "sx-t", 965, 630,
      "Security  feed text rendered as React text; ESLint react/no-danger\n"
      "          Pages _headers: CSP, HSTS, nosniff, Permissions-Policy\n"
      "A11y      labels are buttons; charts keyboard + tables; reduced motion\n"
      "          planned: WCAG 2.1 AA audit (bell focus trap, toasts)\n"
      "Tests     13 unit files; stream.test.ts with chaos\n"
      "          planned: Playwright e2e, Lighthouse CI, commit rate <= 2/s", size=15, mono=True)
    d.render(FE, "10-lld-resilience")


# ========================================================================== CONTRACT

def c_packages():
    d = Diagram()
    d.title(40, 20, "Contract HLD - the layer both sides depend on",
            "Shapes (shared), formulas that must agree on server and browser (physics), and a reference server (mock).")
    d.zone("pk", 560, 100, 640, 640, "packages/  -  no runtime deps, run in Node, Workers, browsers", "teal")
    B(d, "sh", 600, 180, "packages/shared\nmessage + data shapes,\nschemas (planned)", "teal", w=560)
    B(d, "ph", 600, 380, "packages/physics\nDBM, Newell, GOES class,\nlocation, Earth-directed", "teal", w=560)
    B(d, "ck", 600, 580, "packages/contract-tests  (planned)\nBASE_URL=<server>", "white", w=560, dashed=True)

    B(d, "web", 1340, 180, "apps/web", "blue", w=300)
    B(d, "wk", 1340, 380, "apps/worker  (planned)", "purple", w=300, dashed=True)
    B(d, "mock", 40, 300, "apps/mock\nreference server :8787\n(web's dev server\nvia Vite proxy)", "orange", w=300)
    d.arrow("web", "sh")
    T(d, "both", 1340, 270, "web and worker import\nBOTH packages", size=15, color=MUTED)
    d.arrow("wk", "ph")
    d.arrow("mock", "sh")
    d.arrow("mock", "ph")
    d.arrow("ck", "mock", "runs against", dashed=True)
    d.line(1160, 615, [[0, 0], [330, 0], [330, -170]], dashed=True)
    T(d, "ck-w", 1260, 625, "and against the Worker", size=14, color=MUTED)

    d.zone("units", 40, 780, 1560, 180, "Fixed units and rules", "gray")
    T(d, "units-t", 70, 830,
      "time   unix seconds UTC          distance  km, km/s           flux  W/m2         field  nT\n"
      "angles heliographic degrees: lat north +, lon west +, (0,0) = point facing Earth\n\n"
      "shared and physics never import from an app.   Any number the UI shows that the server also\n"
      "computes comes from physics - so the drawn CME front reaches Earth exactly at the server's eta.",
      size=15, mono=True)
    d.render(CT, "01-hld-packages")


def c_shapes():
    d = Diagram()
    d.title(40, 20, "Contract LLD - messages and data shapes  (packages/shared)",
            "One snapshot type, one delta type, and how a delta merges into state.")
    d.zone("sm", 40, 100, 620, 560, "ServerMessage", "purple")
    B(d, "m1", 80, 160, "snapshot  {seq, ts, state}", "purple", w=540, h=60)
    B(d, "m2", 80, 250, "delta     {seq, ts, ...Delta}", "purple", w=540, h=60)
    B(d, "m3", 80, 340, "alert     {seq, ts, alert}", "red", w=540, h=60)
    B(d, "m4", 80, 430, "ping", "gray", w=540, h=60)
    B(d, "m5", 80, 520, "hello {protocol, minClient, seq}  (planned)", "white", w=540, h=60, dashed=True)
    d.zone("cm", 40, 700, 620, 200, "ClientMessage", "green")
    B(d, "c1", 80, 770, "pong", "green", w=240, h=60)
    B(d, "c2", 360, 770, "resync", "green", w=260, h=60)

    d.table("ls", 760, 110, "LiveState", [
        "clock    Clock {now, speed, mode, scenario}",
        "xray     XraySeries   last 6 h, columnar",
        "wind     WindSeries   last 6 h, columnar",
        "regions  SunspotRegion[]",
        "flares   Flare[]      7 d",
        "cmes     (Cme + CmeForecast)[]  7 d",
        "alerts   Alert[]      active + 24 h",
        "feeds    FeedStatus[]"], "purple", w=560)
    d.arrow("m1", "ls")

    d.zone("mg", 760, 520, 560, 260, "Delta = any subset; merge rules", "yellow")
    T(d, "mg-t", 785, 570,
      "series   APPEND   (by t; dup t ignored)\n"
      "lists    UPSERT   by id\n"
      "regions  REPLACE  whole list\n\n"
      "same message twice -> no change\n"
      "(idempotent)", size=16, mono=True)
    d.line(620, 278, [[0, 0], [90, 0], [90, 302], [140, 302]])

    d.zone("ty", 1380, 100, 780, 520, "Key fields", "gray")
    T(d, "ty-t", 1405, 150,
      "Clock        now, speed,\n"
      "             mode live|mock-replay|mock-scenario\n"
      "Series       t[] + one array per field\n"
      "             -> Float64Array, zero-copy\n"
      "SunspotRegion regionNo, observedOn, lat, lon,\n"
      "             areaMsh, magClass, pM, pX\n"
      "Flare        id, begin/peak/endAt, cls,\n"
      "             peakFlux, status, regionNo\n"
      "Cme          launchAt (21.5 Rs), speed, lat,\n"
      "             lon, halfAngle, earthDirected\n"
      "CmeForecast  eta, arrivalSpeed, gamma, w\n"
      "Alert        id, rule, level, title, message,\n"
      "             refType, refId, raisedAt,\n"
      "             clearedAt\n"
      "FeedStatus   id, cadenceS, staleAfterS,\n"
      "             lastOkAt, dataTs, error, stale\n\n"
      "REST  HistoryResponse, EventsResponse,\n"
      "      HealthResponse", size=15, mono=True)
    d.render(CT, "02-lld-shapes")


def c_delivery():
    d = Diagram()
    d.title(40, 20, "Contract LLD - ordering and delivery guarantees",
            "snapshot, delta and alert share one seq counter that goes up by exactly 1.")
    d.zone("ln", 40, 100, 2120, 230, "The server's sequence", "purple")
    x = 80
    for s in range(1041, 1051):
        kind = "alert" if s == 1046 else "delta"
        B(d, f"q{s}", x, 170, f"{s}\n{kind}", "red" if kind == "alert" else "purple", w=170, h=80)
        x += 205
    T(d, "ln-n", 80, 280, "client has applied n = 1042", size=15, color="#2f9e44")

    d.zone("r1", 40, 390, 1040, 230, "Resume after a drop", "green")
    B(d, "a1", 80, 460, "reconnect\n?since=1042", "green", w=220)
    d.box("a2", 360, 445, 260, 120, "1043 still\nin the ring?", "yellow", shape="diamond")
    B(d, "a3", 700, 430, "send 1043 ... 1050", "purple", w=320, h=60)
    B(d, "a4", 700, 540, "send snapshot (seq 1050)\nreplaces client state", "purple", w=320)
    d.arrow("a1", "a2")
    d.arrow("a2", "a3", "yes")
    d.arrow("a2", "a4", "no")

    d.zone("r2", 1120, 390, 1040, 230, "Gap on a live socket", "red")
    B(d, "g1", 1160, 460, "has 1043,\ngets 1045", "red", w=200)
    B(d, "g2", 1430, 460, "send {type:'resync'}\nignore seq msgs", "orange", w=290)
    B(d, "g3", 1800, 460, "snapshot\narrives", "purple", w=200)
    d.arrow("g1", "g2")
    d.arrow("g2", "g3")

    d.zone("rules", 40, 660, 2120, 200, "The five rules  (tested in apps/web/test/stream.test.ts, also under chaos)", "gray")
    T(d, "rules-t", 70, 710,
      "1  snapshot / delta / alert carry seq, strictly +1 across all three kinds\n"
      "2  ?since=n  ->  every message n+1 ...  OR a fresh snapshot; a snapshot always replaces state\n"
      "3  seq > n + 1  ->  client sends resync and ignores sequenced messages until a snapshot\n"
      "4  applying the same message twice changes nothing (upsert by id, series by t)\n"
      "5  a new alert arrives once as 'alert'; its later changes (clearing) come inside a delta",
      size=16, mono=True)
    d.render(CT, "03-lld-delivery")


def c_validation():
    d = Diagram()
    d.title(40, 20, "Contract LLD - validation [D2] and versioning [D3, D4]",
            "Types are inferred from schemas, so they can't drift.  Additive changes stay in v1.")
    d.zone("v", 40, 100, 2120, 460, "Validation (design)", "blue")
    B(d, "s0", 80, 170, "schema.ts\none schema per type", "teal", w=300)
    B(d, "s1", 80, 330, "TS types\ninferred", "white", w=300)
    d.arrow("s0", "s1")
    B(d, "v1", 480, 170, "server: upstream\nnormalised + params", "purple", w=300)
    B(d, "v2", 860, 170, "validate", "yellow", w=180, h=70)
    B(d, "v3", 1120, 170, "send / store\n(never sends what\nfails its own schema)", "purple", w=320)
    B(d, "w1", 480, 330, "client: onMessage", "blue", w=300, h=70)
    B(d, "w2", 860, 330, "validate", "yellow", w=180, h=70)
    B(d, "w3", 1120, 330, "apply", "green", w=200, h=70)
    B(d, "w4", 1120, 440, "conn.invalid++, drop,\nresync (no partial update)", "red", w=360)
    d.arrow("v1", "v2")
    d.arrow("v2", "v3")
    d.arrow("w1", "w2")
    d.arrow("w2", "w3", "ok")
    d.arrow("w2", "w4")
    T(d, "fail", 1000, 430, "fail", size=15, color="#e03131")
    T(d, "chk", 1500, 170, "checks: finite numbers,\nequal-length series arrays,\nlist caps (<= 2,000 flares)",
      size=15, color="#1971c2")

    d.zone("ver", 40, 600, 1300, 400, "Versioning: is the change additive?", "yellow")
    B(d, "c0", 80, 680, "contract change", "white", w=240, h=64)
    d.box("cq", 380, 640, 400, 150, "new optional field,\ntype or enum value?", "yellow", shape="diamond")
    B(d, "cy", 860, 640, "stays in /api/v1, protocol 1\nclient ignores unknown\nmessage types / rules", "green", w=420)
    B(d, "cn", 860, 840, "rename, remove, unit change\n-> protocol 2, raise minClient,\n/api/v2", "red", w=420)
    d.arrow("c0", "cq")
    d.arrow("cq", "cy", "yes")
    d.arrow("cq", "cn", "no")
    T(d, "cl", 80, 880, "every change: a line in\npackages/shared/CHANGELOG.md", size=15, color="#f08c00")

    d.zone("hist", 1380, 600, 780, 400, "So far, and stored data", "gray")
    T(d, "hist-t", 1405, 650,
      "Phase 2  FeedStatus.staleAfterS added\n"
      "Phase 4  AlertRule 'TEST',\n"
      "         refType 'test' added\n\n"
      "IndexedDB / localStorage keys carry\n"
      "their own ':v1' suffix.\n"
      "New stored shape = new key,\n"
      "never a migration.", size=16, mono=True)
    d.render(CT, "04-lld-validation-versioning")


def c_physics_mock():
    d = Diagram()
    d.title(40, 20, "Contract LLD - physics, the mock reference server, contract tests",
            "A behaviour change goes into the mock first (with a test); the Worker must then pass the same suite.")
    d.zone("ph", 40, 100, 1020, 440, "packages/physics  (all unit-tested)", "teal")
    T(d, "ph-t", 70, 150,
      "dbmAt(t, {v0, w, gamma, r0})   DBM distance, speed\n"
      "dbmTransitTime(input, 1 AU)    bisection on dbmAt\n"
      "dbmForecast({..., launchAt})   {eta, arrivalSpeed}\n"
      "newell(v, by, bz)              coupling dPhi/dt\n"
      "classFromFlux / fluxFromClass  9.96e-6 -> M1.0\n"
      "parseLocation / formatLocation N20E46 <-> lat, lon\n"
      "isEarthDirected(lat, lon, ha)  Earth in the cone\n\n"
      "AU_KM  R_SUN_KM  DONKI_R0_KM = 21.5 Rs\n"
      "DEFAULT_GAMMA = 0.2e-7 /km   SYNODIC 13.2 deg/day", size=15, mono=True)
    B(d, "pd1", 70, 380, "server: dbmForecast -> eta", "purple", w=420, h=60)
    B(d, "pd2", 580, 380, "browser: dbmAt(same gamma, w)", "blue", w=440, h=60)
    T(d, "pd3", 300, 460, "-> the drawn front reaches 1 AU exactly at eta", size=14, color="#099268")

    d.zone("mk", 1100, 100, 1060, 460, "apps/mock  (Node HTTP + ws, :8787, real /api/v1)", "orange")
    B(d, "eng", 1140, 170, "engine.ts\nclock + speed, flares, regions,\nDBM, alerts, ?since log (5,000)", "orange", w=440)
    B(d, "scn", 1640, 170, "scenario.ts + scenarios/\nbig-storm, busy-sun, side-cme,\nfeed-outage, m-flare-only", "yellow", w=480)
    B(d, "cha", 1640, 340, "chaos.ts\nlatency, drops, skipped seqs,\nHTTP failures", "red", w=480)
    B(d, "srv", 1140, 340, "server.ts\nroutes + /mock/* control,\n/mock/ui control page", "white", w=440)
    B(d, "dat", 1140, 480, "docs/reconnection/data  (real NOAA/NASA, shifted to now)", "gray", w=980, h=56, size=15)
    d.arrow("scn", "eng")
    d.arrow("cha", "srv")
    d.arrow("srv", "eng")
    d.line(1610, 480, [[0, 0], [0, -250], [-28, -250]])

    d.zone("ct", 40, 600, 2120, 260, "packages/contract-tests  (planned [T1])", "purple")
    B(d, "t0", 80, 670, "BASE_URL\n+ CONTROL adapter", "purple", w=280)
    B(d, "t1", 460, 640, "mock  (/mock/* triggers)", "orange", w=340, h=60)
    B(d, "t2", 460, 740, "wrangler dev  (fixture upstream)", "purple", w=380, h=60)
    d.arrow("t0", "t1")
    d.arrow("t0", "t2")
    T(d, "tl", 940, 650,
      "GET /state      valid LiveState, sorted, 6 h window\n"
      "boot            hello, then snapshot or deltas; seqs consecutive\n"
      "resume          drop, ?since=n -> exactly n+1 ...\n"
      "too old         ?since=0 -> snapshot          resync -> snapshot\n"
      "alert           test alert < 1 s, appears in state.alerts\n"
      "history/events  shape, snapping, 7-day limit, filters\n"
      "security        /mock/* 404 and bad Origin refused (Worker only)", size=15, mono=True)
    d.render(CT, "05-lld-physics-mock-tests")


ALL = ["b_topology", "b_components", "b_schema", "b_tick", "b_session", "b_alerts", "b_ops",
       "f_layers", "f_state", "f_boot", "f_alerts", "f_frame", "f_replay", "f_resilience",
       "c_packages", "c_shapes", "c_delivery", "c_validation", "c_physics_mock"]

if __name__ == "__main__":
    import sys
    for name in sys.argv[1:] or ALL:
        globals()[name]()
