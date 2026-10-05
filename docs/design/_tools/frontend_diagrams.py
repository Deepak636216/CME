from dg import Diagram

OUT = "../frontend/diagrams"
MONO = "cascadia"


def nouns_usecases():
    d = Diagram()
    d.title(40, 20, "Frontend - use cases & UI nouns",
            "Left: what a viewer does on the site.  Right: the things (nouns) the UI is built from.")

    d.zone("sys", 280, 110, 560, 880, "Website (browser)", "green")
    vu = [("u1", "UF1  Live Sun-to-Earth view"), ("u2", "UF2  Switch true / readable scale"),
          ("u3", "UF3  Click a body / sunspot"), ("u4", "UF4  Watch a flare + X-ray curve"),
          ("u5", "UF5  Track a CME + Earth ETA"), ("u6", "UF6  Get an alert (toast, sound)"),
          ("u7", "UF7  Replay the last 7 days"), ("u8", "UF8  Check data age / health")]
    su = [("u9", "UF9  Reconnect and catch up")]
    y = 160
    for id, s in vu:
        d.box(id, 310, y, 500, 62, s, "white", shape="ellipse", size=15)
        y += 82
    y += 20
    for id, s in su:
        d.box(id, 310, y, 500, 62, s, "white", shape="ellipse", size=15)
    d.box("viewer", 40, 440, 170, 70, "Viewer", "green")
    d.box("net", 40, 860, 170, 70, "Network /\nbackend", "orange")
    for id, _ in vu:
        d.arrow("viewer", id)
    d.arrow("net", "u9")

    X0, W, H = 1120, 230, 66
    cols = [X0, X0 + 320, X0 + 640]
    rows = [150, 290, 430, 570, 710, 850]
    d.zone("dom", 1080, 110, 1020, 880, "UI nouns", "purple")

    def n(id, c, r, s, color):
        d.box(id, cols[c], rows[r], W, H, s, color)

    n("conn", 0, 0, "StreamConnection\n(WS, seq, backoff)", "orange")
    n("store", 1, 0, "LiveStore\n(state the UI reads)", "purple")
    n("idb", 2, 0, "LocalCache\n(IndexedDB last state)", "gray")
    n("scene", 1, 1, "Scene\n(3D world, camera)", "blue")
    n("timeline", 0, 1, "Timeline\n(live | replay cursor)", "yellow")
    n("panel", 2, 1, "Panel / Chart\n(X-ray, wind, CME)", "white")
    n("body", 0, 2, "CelestialBody\n(Sun, planets, L1)", "green")
    n("cmeshell", 1, 2, "CmeShell\n(cone, front from DBM)", "red")
    n("toast", 2, 2, "AlertToast\n(level, ack)", "red")
    n("spot", 0, 3, "SunspotMarker\n(region on the Sun)", "yellow")
    n("flare", 1, 3, "FlareMarker\n(pulse, class)", "red")
    n("badge", 2, 3, "FreshnessBadge\n(age, stale)", "gray")
    n("orbit", 0, 4, "OrbitPath\n(ephemeris track)", "green")
    n("sel", 1, 4, "Selection\n(what is clicked)", "white")

    d.arrow("conn", "store", "deltas")
    d.arrow("store", "idb", "save")
    d.arrow("store", "scene")
    d.arrow("timeline", "scene", "time")
    d.arrow("scene", "panel")
    d.arrow("scene", "cmeshell")
    d.arrow("body", "spot", "on Sun")
    d.arrow("spot", "flare", "erupts")
    d.arrow("cmeshell", "toast")
    d.arrow("scene", "body")
    d.line(1120, 463, [[0, 0], [-24, 0], [-24, 280], [-2, 280]])
    d.arrow("flare", "sel", dashed=True)
    d.arrow("toast", "badge", dashed=True)
    d.text("n1", 1100, 950, "Server data reaches the UI only through StreamConnection -> LiveStore.",
           size=14, color="#6741d9")
    d.render(OUT, "01-nouns-usecases")



def api_flow():
    d = Diagram()
    d.title(40, 20, "Frontend - data flow & API calls",
            "From the first byte to a 60 fps scene, then what happens on a dropped connection, a replay, and an alert.")

    d.zone("boot", 40, 100, 1880, 250, "1. Boot - interactive in < 2 s", "green")
    steps = [("b1", "Load app shell\n(Pages CDN,\nservice worker)", "white"),
             ("b2", "Paint last state\nfrom IndexedDB\n(badge: stale)", "gray"),
             ("b3", "GET /api/v1/state\nreplace liveSlice", "blue"),
             ("b4", "Open WS\n/api/v1/stream\n?since=seq", "orange"),
             ("b5", "Badge: live\n(green dot)", "green")]
    x = 80
    for id, s, c in steps:
        d.box(id, x, 170, 280, 110, s, c)
        x += 360
    for a, b in zip(steps, steps[1:]):
        d.arrow(a[0], b[0])

    d.zone("run", 40, 390, 1880, 250, "2. Live - steady state", "blue")
    run = [("r1", "WS message\nsnapshot | delta |\nalert | ping", "orange"),
           ("r2", "Apply to store\nO(changed keys)", "purple"),
           ("r3", "Render loop\nrequestAnimationFrame\n60 fps", "blue"),
           ("r4", "Each frame: ephemeris\n+ CME front (DBM)\ncomputed locally", "teal"),
           ("r5", "Charts redraw\nat most 1 / s", "white")]
    x = 80
    for id, s, c in run:
        d.box(id, x, 460, 280, 110, s, c)
        x += 360
    for a, b in zip(run, run[1:]):
        d.arrow(a[0], b[0])

    d.zone("drop", 40, 680, 600, 330, "3. Connection drops", "red")
    d.box("d1", 80, 740, 520, 70, "Backoff 0.5, 1, 2, 4 ... 30 s (+ jitter)", "white")
    d.box("d2", 80, 840, 520, 70, "Reconnect ?since=lastSeq  ->  missed deltas\n(or a fresh snapshot if > 1 h)", "white", size=15)
    d.box("d3", 80, 930, 520, 60, "3 failures -> poll GET /state every 30 s", "gray", size=15)
    d.arrow("d1", "d2")
    d.arrow("d2", "d3")

    d.zone("rep", 680, 680, 600, 330, "4. Replay (scrub timeline)", "yellow")
    d.box("p1", 720, 740, 520, 70, "timeMode = replay, cursorT = t", "white")
    d.box("p2", 720, 840, 520, 70, "GET /history + /events  (cached)", "teal")
    d.box("p3", 720, 930, 520, 60, "Scene renders at cursorT, not now", "white", size=15)
    d.arrow("p1", "p2")
    d.arrow("p2", "p3")

    d.zone("al", 1320, 680, 600, 330, "5. Alert", "red")
    d.box("a1", 1360, 740, 520, 70, "'alert' message arrives", "orange")
    d.box("a2", 1360, 840, 520, 70, "AlertToast + sound + browser Notification\n(if allowed)", "red", size=15)
    d.box("a3", 1360, 930, 520, 60, "Ack stored in IndexedDB.alertAcks", "gray", size=15)
    d.arrow("a1", "a2")
    d.arrow("a2", "a3")
    d.render(OUT, "03-api-flow")


def components():
    d = Diagram()
    d.title(40, 20, "Frontend - components & router",
            "React Router routes (left) -> page -> component groups -> hooks/stores -> backend endpoints (right).")

    d.text("h1", 40, 100, "ROUTES", size=18, color="#495057")
    d.text("h2", 360, 100, "PAGES", size=18, color="#495057")
    d.text("h3", 700, 100, "COMPONENTS", size=18, color="#495057")
    d.text("h4", 1360, 100, "HOOKS / STORES", size=18, color="#495057")
    d.text("h5", 1760, 100, "BACKEND", size=18, color="#495057")

    routes = [("rt1", "/", "pg1", "LivePage", 170), ("rt2", "/sun", "pg2", "SunPage", 300),
              ("rt3", "/replay?t=", "pg3", "ReplayPage", 430), ("rt4", "/events", "pg4", "EventsPage", 580),
              ("rt5", "/events/:kind/:id", "pg5", "EventDetailPage", 670), ("rt6", "/status", "pg6", "StatusPage", 790),
              ("rt7", "/guide", "pg7", "docs/reconnection\n(existing, static)", 900)]
    for rid, r, pid, p, y in routes:
        d.box(rid, 40, y, 260, 60, r, "white", font=MONO, size=15)
        d.box(pid, 360, y, 260, 60, p, "gray" if rid == "rt7" else "purple", size=15)
        d.arrow(rid, pid)

    # live view = 3D scene + HUD (shared by Live, Sun, Replay pages)
    d.zone("glive", 680, 140, 600, 400, "Live view  =  SceneCanvas (react-three-fiber) + HUD", "blue", size=16)
    sc = [("SunMesh", "SunspotLayer"), ("FlareMarkers", "PlanetBodies"), ("OrbitLines", "L1Probe"),
          ("CmeShells", "CameraRig")]
    y = 185
    for a, b in sc:
        d.box("c-" + a, 710, y, 260, 44, a, "white", size=15)
        d.box("c-" + b, 1000, y, 260, 44, b, "white", size=15)
        y += 56
    d.box("c-x", 710, 420, 170, 44, "XrayChart", "teal", size=15)
    d.box("c-w", 900, 420, 170, 44, "WindPanel", "teal", size=15)
    d.box("c-c", 1090, 420, 170, 44, "CmeCard", "teal", size=15)
    d.box("c-t", 710, 478, 550, 44, "TimelineBar  (live | replay scrubber)", "yellow", size=15)

    d.zone("gev", 680, 565, 600, 175, "Event views", "red", size=16)
    d.box("c-et", 710, 640, 260, 50, "EventTable", "white", size=15)
    d.box("c-ed", 1000, 640, 260, 50, "FlareDetail / CmeDetail", "white", size=15)
    d.zone("gst", 680, 770, 600, 100, "Status", "gray", size=16)
    d.box("c-fh", 900, 798, 360, 50, "FeedHealthTable", "white", size=15)

    for p in ("pg1", "pg2", "pg3"):
        d.arrow(p, "glive")
    d.arrow("pg4", "gev")
    d.arrow("pg5", "gev")
    d.arrow("pg6", "gst")

    hk = [("h-ls", "useLiveStream\n(WS + backoff)", "orange", 160),
          ("h-st", "liveStore / uiStore\n(Zustand)", "purple", 280),
          ("h-eph", "useEphemeris\n(astronomy-engine)", "green", 390),
          ("h-cme", "useCmeFront\n(physics.dbm)", "teal", 490),
          ("h-hist", "useHistory\n(fetch + cache)", "blue", 625),
          ("h-idb", "localCache\n(IndexedDB)", "gray", 785)]
    for id, s, c, y in hk:
        d.box(id, 1360, y, 300, 76, s, c, size=15)
    d.arrow("h-ls", "h-st", "write")
    d.arrow("glive", "h-st", "read")
    d.arrow("glive", "h-eph")
    d.arrow("glive", "h-cme")
    d.arrow("gev", "h-hist")
    d.text("gst-n", 700, 812, "reads\nliveStore.feeds", size=13, color="#495057")

    ep = [("e-ws", "WS /stream", 160, 60), ("e-st", "GET /state", 260, 60),
          ("e-h", "GET /history\nGET /events", 625, 76)]
    for id, s, y, h in ep:
        d.box(id, 1760, y, 220, h, s, "orange", size=15, font=MONO)
    d.arrow("h-ls", "e-ws")
    d.arrow("h-ls", "e-st")
    d.arrow("h-hist", "e-h")
    d.text("idb-n", 1700, 795, "boot: paint from here first,\nthen /state replaces it", size=13, color="#495057")

    d.zone("shell", 40, 1000, 1940, 110, "AppShell - wraps every route", "purple", size=16)
    for i, s in enumerate(["TopBar", "ConnectionBadge", "AlertBell", "AlertToaster", "ScaleToggle", "<Outlet/>"]):
        d.box("sh" + str(i), 80 + i * 310, 1045, 270, 48, s, "white", size=15)
    d.render(OUT, "04-components-router")


if __name__ == "__main__":
    import sys
    for name in sys.argv[1:] or ["nouns_usecases", "api_flow", "components"]:
        globals()[name]()
