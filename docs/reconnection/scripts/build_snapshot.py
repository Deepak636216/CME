"""
Build data/snapshot.js, the offline fallback used by ../index.html when live feeds are unreachable.

Usage:
    python build_snapshot.py            # uses the JSON files already in ../data
    python build_snapshot.py --refresh  # downloads fresh NOAA / NASA data first
"""
import json
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"

today = datetime.now(timezone.utc).date()
SOURCES = {
    "goes_xrays_3day.json": "https://services.swpc.noaa.gov/json/goes/primary/xrays-3-day.json",
    "goes_flares_7day.json": "https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json",
    "rtsw_mag_1m.json": "https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json",
    "rtsw_wind_1m.json": "https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json",
    "donki_cme.json": "https://api.nasa.gov/DONKI/CMEAnalysis?startDate={}&endDate={}"
                      "&mostAccurateOnly=true&api_key=DEMO_KEY".format(today - timedelta(days=30), today),
}


def load(name):
    return json.loads((DATA / name).read_text())


def main():
    if "--refresh" in sys.argv:
        for name, url in SOURCES.items():
            print("download", url)
            urllib.request.urlretrieve(url, DATA / name)

    goes = sorted(([r["time_tag"], r["flux"]] for r in load("goes_xrays_3day.json")
                   if r["energy"] == "0.1-0.8nm" and r["flux"]), key=lambda x: x[0])
    mag = {r["time_tag"]: r for r in load("rtsw_mag_1m.json") if r.get("active") and r.get("bz_gsm") is not None}
    wind = {r["time_tag"]: r for r in load("rtsw_wind_1m.json") if r.get("active") and r.get("proton_speed")}
    keys = sorted(set(mag) & set(wind))
    sw = [[k + "Z", wind[k]["proton_speed"], wind[k]["proton_density"],
           mag[k]["by_gsm"], mag[k]["bz_gsm"], mag[k]["bt"]] for k in keys]
    cmes = [{"time": c["time21_5"], "speed": c["speed"], "lat": c["latitude"], "lon": c["longitude"],
             "halfAngle": c["halfAngle"], "id": c.get("associatedCMEID")}
            for c in load("donki_cme.json") if c.get("speed")]
    flares = [{"begin": f["begin_time"], "max": f["max_time"], "end": f["end_time"], "cls": f["max_class"]}
              for f in load("goes_flares_7day.json") if f.get("max_class")]

    snap = {"generated": datetime.now(timezone.utc).isoformat(timespec="minutes"),
            "goes": goes, "sw": sw, "cmes": cmes, "flares": flares}
    out = DATA / "snapshot.js"
    out.write_text("window.SNAPSHOT = " + json.dumps(snap, separators=(",", ":")) + ";\n")
    print(f"wrote {out}  goes={len(goes)} sw={len(sw)} cmes={len(cmes)} flares={len(flares)}"
          f"  size={out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
