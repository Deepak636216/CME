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



if __name__ == "__main__":
    import sys
    for name in sys.argv[1:] or ["nouns_usecases", "api_flow"]:
        globals()[name]()
