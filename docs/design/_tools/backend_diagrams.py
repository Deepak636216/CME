from dg import Diagram

OUT = "../backend/diagrams"
MONO = "cascadia"


def nouns_usecases():
    d = Diagram()
    d.title(40, 20, "Backend - use cases & domain nouns",
            "Left: who asks the backend for what.  Right: the things (nouns) the backend stores and computes.")

    # ---- use cases ----------------------------------------------------------
    d.zone("sys", 280, 110, 560, 860, "Space-Weather Backend (always on)", "blue")
    vu = [("uc1", "UC1  Get current state"), ("uc2", "UC2  Subscribe to live updates"),
          ("uc3", "UC3  Query 7-day history"), ("uc4", "UC4  Check feed health")]
    su = [("uc5", "UC5  Poll upstream feed"), ("uc6", "UC6  Compute derived values"),
          ("uc7", "UC7  Evaluate alert rules"), ("uc8", "UC8  Broadcast delta"),
          ("uc9", "UC9  Prune old data")]
    y = 160
    for id, s in vu:
        d.box(id, 320, y, 480, 62, s, "white", shape="ellipse")
        y += 84
    y += 30
    for id, s in su:
        d.box(id, 320, y, 480, 62, s, "white", shape="ellipse")
        y += 84
    d.box("viewer", 40, 290, 170, 70, "Viewer\n(browser)", "green")
    d.box("clock", 40, 690, 170, 70, "Scheduler\n(DO alarm)", "yellow")
    d.box("feeds", 880, 470, 170, 90, "NOAA SWPC\nNASA DONKI", "orange")
    for id, _ in vu:
        d.arrow("viewer", id)
    for id, _ in su:
        d.arrow("clock", id)
    d.arrow("uc5", "feeds", dashed=True)
    d.text("feeds-n", 880, 570, "polled with\nIf-None-Match", size=14, color="#e8590c")

    # ---- domain nouns -------------------------------------------------------
    X0, W, H = 1120, 230, 66
    cols = [X0, X0 + 320, X0 + 640]
    rows = [150, 290, 430, 570, 710, 850]
    d.zone("dom", 1080, 110, 1020, 860, "Domain nouns", "purple")

    def n(id, c, r, s, color):
        d.box(id, cols[c], rows[r], W, H, s, color)

    n("feed", 0, 0, "Feed\n(source + cadence)", "orange")
    n("fstat", 1, 0, "FeedStatus\n(last ok, age, error)", "gray")
    n("xray", 0, 1, "XraySample\n(GOES flux, 1 min)", "blue")
    n("flare", 1, 1, "Flare\n(class, peak, region)", "red")
    n("region", 2, 1, "SunspotRegion\n(NOAA #, lat/lon, area)", "yellow")
    n("cme", 1, 2, "CME\n(speed, lat/lon, width)", "red")
    n("fc", 2, 2, "ArrivalForecast\n(DBM: ETA, speed)", "pink")
    n("wind", 0, 3, "WindSample\n(V, n, Bz, Bt @ L1)", "blue")
    n("coup", 1, 3, "CouplingIndex\n(Newell dPhi/dt)", "teal")
    n("alert", 2, 3, "Alert\n(rule, level, time)", "red")
    n("planet", 0, 4, "PlanetState\n(ephemeris x,y,z)", "green")
    n("live", 1, 4, "LiveState\n(latest of everything)", "purple")
    n("sub", 2, 4, "Subscriber\n(open WebSocket)", "green")
    n("ev", 1, 5, "DeltaLog\n(resume on reconnect)", "gray")

    d.arrow("feed", "fstat", "health")
    d.arrow("feed", "xray", "produces")
    d.arrow("xray", "flare", "detects")
    d.arrow("flare", "region", "in")
    d.arrow("flare", "cme", "may launch")
    d.arrow("cme", "fc", "DBM")
    d.arrow("wind", "coup", "Newell")
    d.arrow("coup", "alert")
    d.arrow("fc", "alert")
    d.arrow("planet", "live")
    d.arrow("live", "sub", "push")
    d.arrow("live", "ev", "append")
    d.text("n1", 1100, 930, "Flare >= M1, Earth-directed CME and Bz <= -10 nT raise an Alert.  "
           "Feed also produces WindSample, SunspotRegion and CME.", size=14, color="#6741d9")
    d.render(OUT, "01-nouns-usecases")


def db_schema():
    d = Diagram()
    d.title(40, 20, "Backend - database schema (SQLite inside the Durable Object)",
            "All times are unix seconds (UTC).  PK = primary key, FK = foreign key.  Hot data also lives in memory ring buffers.")
    G = 60  # vertical gap

    def col(x, specs):
        y = 120
        for id, name, rows, color, note in specs:
            _, _, _, h = d.table(id, x, y, name, rows, color, w=430, note=note)
            y += h + G + (16 if note else 0)

    col(40, [
        ("xray", "xray_sample", ["ts          INTEGER PK", "flux_long   REAL  -- 0.1-0.8 nm",
                                 "flux_short  REAL  -- 0.05-0.4 nm", "satellite   INTEGER"], "blue", "1 row / min, keep 7 d"),
        ("wind", "wind_sample", ["ts          INTEGER PK", "speed       REAL  -- km/s", "density     REAL  -- p/cc",
                                 "temperature REAL", "bx, by, bz  REAL  -- nT GSM", "bt          REAL",
                                 "newell      REAL  -- derived"], "blue", "1 row / min, keep 7 d"),
        ("fstat", "feed_status", ["feed_id     TEXT PK", "etag        TEXT", "last_ok_at  INTEGER",
                                  "data_ts     INTEGER", "error       TEXT"], "gray", "written only when state changes"),
    ])
    col(530, [
        ("region", "sunspot_region", ["region_no   INTEGER PK", "observed_on TEXT    PK", "lat, lon    REAL  -- deg",
                                      "location    TEXT  -- N20E46", "area_msh    INTEGER", "mag_class   TEXT",
                                      "spot_count  INTEGER", "p_m, p_x    INTEGER -- flare %"], "yellow", "daily, keep 30 d"),
        ("flare", "flare", ["id          TEXT PK  -- begin ts", "begin_at    INTEGER", "peak_at     INTEGER",
                            "end_at      INTEGER", "class       TEXT  -- M2.3", "peak_flux   REAL",
                            "region_no   INTEGER FK"], "red", "keep 30 d"),
        ("alert", "alert", ["id          INTEGER PK", "rule        TEXT  -- FLARE_M|CME_EARTH|BZ_SOUTH",
                            "level       TEXT  -- watch|warning", "ref_type    TEXT", "ref_id      TEXT",
                            "raised_at   INTEGER", "cleared_at  INTEGER"], "red", "keep 30 d"),
    ])
    col(1020, [
        ("fc", "cme_forecast", ["cme_id        TEXT PK FK", "computed_at   INTEGER", "eta           INTEGER",
                                "arrival_speed REAL", "gamma, w      REAL  -- DBM params"], "pink", "1 per CME, recomputed on update"),
        ("cme", "cme", ["id            TEXT PK  -- DONKI id", "launch_at     INTEGER  -- t at 21.5 Rs",
                        "speed         REAL", "lat, lon      REAL", "half_angle    REAL",
                        "earth_directed INTEGER", "flare_id      TEXT FK"], "red", "keep 30 d"),
        ("dl", "delta_log", ["seq         INTEGER PK", "ts          INTEGER", "kind        TEXT",
                             "payload     TEXT  -- JSON"], "gray", "keep 1 h (reconnect resume)"),
        ("meta", "meta", ["key         TEXT PK  -- seq, schema_v", "value       TEXT"], "gray", None),
    ])

    d.arrow("flare", "region-body", "region_no")
    d.arrow("cme", "flare", "flare_id")
    d.arrow("fc-body", "cme", "cme_id")
    d.arrow("alert", "flare-body", "ref", dashed=True)

    d.zone("notes", 1500, 120, 560, 380, "Why this fits the free tier", "green")
    d.text("notes-t", 1520, 170,
           "Storage  SQLite in the DO (5 GB free).\n\n"
           "Writes   ~2 samples/min + rare events\n"
           "         ~4-8k rows/day   (cap 100k/day)\n\n"
           "Reads    hot path uses memory ring buffers;\n"
           "         SQLite read only on cold start\n"
           "         -> far below 5M/day\n\n"
           "Prune    UC9 runs hourly:\n"
           "         samples > 7 d, events > 30 d,\n"
           "         delta_log > 1 h\n\n"
           "Planets  not stored - computed from\n"
           "         ephemeris on demand",
           size=15, font=MONO)
    d.render(OUT, "02-db-schema")


def api_flow():
    d = Diagram()
    d.title(40, 20, "Backend - data flow & API endpoints",
            "Top: the ingest loop that never stops.  Bottom: how a browser reads state and receives pushes.  Right: endpoint list.")

    # ---- ingest loop --------------------------------------------------------
    d.zone("loop", 40, 100, 1500, 450, "1. Ingest loop - inside the Durable Object, runs without any user", "yellow")
    bw, bh = 240, 92
    d.box("tick", 80, 170, bw, bh, "Alarm tick\n(every ~5 s)", "yellow")
    d.box("sched", 370, 170, bw, bh, "Adaptive scheduler\nwhich feeds are due?", "white")
    d.box("fetch", 660, 170, bw, bh, "Fetch due feeds\nin parallel\n(If-None-Match)", "blue")
    d.box("up", 1090, 170, 300, bh, "NOAA SWPC / NASA DONKI\n304 = unchanged (cheap)\n200 = new data", "orange")
    d.arrow("tick", "sched")
    d.arrow("sched", "fetch")
    d.arrow("fetch", "up", "GET", dashed=True)

    xs = [80, 370, 660, 950, 1240]
    labels = [("norm", "Parse + normalize\nkeep only new rows", "white"),
              ("comp", "Compute\nflare detect, DBM,\nNewell, alert rules", "teal"),
              ("pers", "Persist\nSQLite + ring buffers", "purple"),
              ("delta", "Build delta\nseq + 1, delta_log", "gray"),
              ("bcast", "Broadcast\nto every WebSocket", "green")]
    for x, (id, s, c) in zip(xs, labels):
        d.box(id, x, 360, bw, bh, s, c)
    for a, b in zip(labels, labels[1:]):
        d.arrow(a[0], b[0])
    d.line(780, 262, [[0, 0], [0, 48], [-580, 48], [-580, 98]], label="200 only")
    d.line(1360, 452, [[0, 0], [0, 50], [-1300, 50], [-1300, -237], [-1280, -237]], dashed=True)
    d.text("rearm", 400, 510, "setAlarm(next due)  -  a 1-minute cron also re-arms the alarm if it ever stops",
           size=14, color="#f08c00")

    # ---- request paths ------------------------------------------------------
    d.zone("req", 40, 590, 1500, 330, "2. Request paths - browser to edge to Durable Object", "blue")
    d.box("br", 70, 690, 200, 100, "Browser\n(frontend)", "green")
    d.box("wk", 420, 690, 260, 100, "Worker (edge)\nHono router\n/api/v1/*", "blue")
    d.box("do", 800, 690, 260, 100, "SpaceWeatherHub\nDurable Object\n(one instance)", "purple")
    d.box("mem", 1180, 690, 300, 100, "LiveState in memory\n+ ring buffers\n(no DB read per request)", "white")
    d.arrow("br", "wk", "HTTPS / WS")
    d.arrow("wk", "do", "stub.fetch")
    d.arrow("do", "mem", "read")
    d.line(930, 790, [[0, 0], [0, 80], [-760, 80], [-760, 2]], dashed=True, color="#2f9e44")
    d.text("pushlbl", 470, 880, "WebSocket push: snapshot on connect, then deltas (hibernatable socket)",
           size=14, color="#2f9e44")

    # ---- endpoint list ------------------------------------------------------
    d.zone("ep", 1580, 100, 860, 820, "3. Endpoints", "gray")
    d.text("ep-ours-h", 1600, 150, "OUR API  (new)", size=18, color="#1971c2")
    d.text("ep-ours", 1600, 182,
           "GET  /api/v1/state              full LiveState (bootstrap)\n"
           "WS   /api/v1/stream?since=<seq>  snapshot | delta | alert | ping\n"
           "GET  /api/v1/history            ?series=xray|wind&res=1m|5m\n"
           "                                &from=&to=   (edge-cached 60 s)\n"
           "GET  /api/v1/events             ?type=flare|cme|alert&since=\n"
           "GET  /api/v1/regions            today's sunspot regions\n"
           "GET  /api/v1/cmes/:id           CME + DBM forecast\n"
           "GET  /api/v1/health             FeedStatus of every feed\n"
           "cron * * * * *                  watchdog -> DO.ensureAlarm()",
           size=14, font=MONO)
    d.text("ep-up-h", 1600, 400, "UPSTREAM  (existing - already used by docs/reconnection)", size=18, color="#e8590c")
    d.text("ep-up", 1600, 432,
           "services.swpc.noaa.gov/json/                         poll\n"
           "  goes/primary/xrays-6-hour.json      159 KB  adaptive ~5 s\n"
           "  goes/primary/xray-flares-latest.json  1 KB  adaptive ~5 s\n"
           "  goes/primary/xray-flares-7-day.json  15 KB  10 min\n"
           "  rtsw/rtsw_wind_1m.json             2.8 MB  adaptive ~5 s\n"
           "  rtsw/rtsw_mag_1m.json              1.6 MB  adaptive ~5 s\n"
           "  solar_regions.json                 135 KB  30 min\n"
           "api.nasa.gov/DONKI/CMEAnalysis                 5 min (own key)",
           size=14, font=MONO)
    d.text("ep-repo-h", 1600, 640, "EXISTING REPO PIECES", size=18, color="#6741d9")
    d.text("ep-repo", 1600, 672,
           "scripts/build_snapshot.py -> seeds DB + offline snapshot\n"
           "server.py                 -> replaced by `wrangler dev`\n"
           "index.html fetchJSON()    -> switches to /api/v1/*\n\n"
           "All NOAA feeds send ETag + Last-Modified and answer\n"
           "304 to conditional GETs (checked 2026-10-02).",
           size=14, font=MONO)
    d.render(OUT, "03-api-flow")


def components():
    d = Diagram()
    d.title(40, 20, "Backend - components & router",
            "How a request (left) or a clock tick (bottom) reaches each module.  One Durable Object owns all state.")

    d.zone("edge", 40, 100, 560, 760, "Worker entry  (src/index.ts)", "blue")
    d.box("fetchh", 80, 160, 220, 70, "fetch()\nHTTP + WS", "blue")
    d.box("cronh", 80, 720, 220, 70, "scheduled()\ncron * * * * *", "yellow")
    d.box("hono", 340, 160, 220, 70, "Hono router\n/api/v1", "blue")
    routes = [("r-state", "GET /state"), ("r-stream", "WS /stream"), ("r-hist", "GET /history"),
              ("r-ev", "GET /events"), ("r-reg", "GET /regions, /cmes/:id"), ("r-health", "GET /health")]
    y = 270
    for id, s in routes:
        d.box(id, 340, y, 220, 52, s, "white", size=15, font=MONO)
        y += 70
    d.arrow("fetchh", "hono")
    d.text("mw", 80, 260, "middleware:\nCORS, cache\nheaders, rate\nlimit /history", size=14, color="#1971c2")

    d.zone("hub", 680, 100, 1180, 760, "SpaceWeatherHub  Durable Object  (src/hub/)", "purple")
    d.box("hrouter", 720, 160, 240, 70, "Hub router\n(internal paths)", "purple")
    d.box("ws", 720, 300, 240, 70, "SocketManager\naccept / hibernate", "green")
    d.box("q", 720, 440, 240, 70, "QueryService\nstate, history, events", "white")
    d.box("mem", 1060, 440, 260, 70, "MemoryState\nLiveState + ring buffers", "white")
    d.box("repo", 1060, 600, 260, 70, "Repository\nSQLite (ctx.storage.sql)", "purple")
    d.box("bc", 1060, 300, 260, 70, "Broadcaster\ndelta -> all sockets", "green")
    d.box("alarm", 720, 740, 240, 70, "alarm()\ningest tick", "yellow")
    d.box("sched", 1060, 740, 260, 70, "FeedScheduler\nadaptive due-times", "white")
    d.box("poll", 1440, 740, 380, 70, "Pollers: goes, flares, rtsw,\nregions, donki", "blue")
    d.box("norm", 1440, 600, 380, 70, "Normalizers\nNOAA/NASA JSON -> rows", "white")
    d.box("comp", 1440, 440, 380, 70, "Compute (packages/physics)\nflareDetect, dbm, newell", "teal")
    d.box("alerts", 1440, 300, 380, 70, "AlertEngine\nrules + de-duplication", "red")
    d.box("prune", 1440, 160, 380, 70, "Pruner (hourly)", "gray")

    d.arrow("hono", "hrouter", "stub.fetch")
    d.text("rt-n", 340, 690, "every route forwards\nto the Hub", size=13, color="#1971c2")
    d.arrow("hrouter", "ws")
    d.arrow("ws", "q")
    d.arrow("q", "mem")
    d.arrow("mem", "repo", "cold start")
    d.arrow("cronh", "alarm", "ensureAlarm()")
    d.arrow("alarm", "sched")
    d.arrow("sched", "poll")
    d.arrow("poll", "norm")
    d.arrow("norm", "comp")
    d.arrow("comp", "alerts")
    d.arrow("norm", "repo", "rows")
    d.arrow("comp", "mem", "derived")
    d.arrow("alerts", "bc")
    d.arrow("bc", "ws")
    d.text("prune-n", 1440, 240, "Pruner deletes old rows via Repository", size=13, color="#868e96")

    d.zone("shared", 40, 900, 1820, 120, "packages/  (shared by backend and frontend)", "teal")
    d.box("pk1", 80, 945, 440, 56, "shared/types.ts  - LiveState, Delta, Alert", "white", size=15)
    d.box("pk2", 540, 945, 520, 56, "physics/  - dbm(), newell(), classFromFlux()", "white", size=15)
    d.box("pk3", 1120, 945, 460, 56, "protocol/  - WS message schema (zod)", "white", size=15)
    d.render(OUT, "04-components-router")


if __name__ == "__main__":
    import sys
    for name in sys.argv[1:] or ["nouns_usecases", "db_schema", "api_flow", "components"]:
        globals()[name]()
