"""
Tiny helper for building Excalidraw diagrams as element lists for the
mcp-excalidraw-server CLI (agent-friendly format).

Each diagram script calls the helpers, then `render(name, out_dir)`, which
clears the canvas, adds the elements, and exports .excalidraw + .png.

Usage: python docs/design/_tools/build_all.py
"""
import json
import subprocess
import sys
import time
from pathlib import Path

C = {  # (fill, stroke)
    "blue": ("#a5d8ff", "#1971c2"), "green": ("#b2f2bb", "#2f9e44"),
    "yellow": ("#ffec99", "#f08c00"), "red": ("#ffc9c9", "#e03131"),
    "purple": ("#d0bfff", "#6741d9"), "gray": ("#e9ecef", "#495057"),
    "orange": ("#ffd8a8", "#e8590c"), "teal": ("#96f2d7", "#099268"),
    "pink": ("#fcc2d7", "#c2255c"), "white": ("#ffffff", "#495057"),
}
ZONE = {k: (f, s) for k, (f, s) in {
    "blue": ("#e7f5ff", "#1971c2"), "green": ("#ebfbee", "#2f9e44"),
    "yellow": ("#fff9db", "#f08c00"), "purple": ("#f3f0ff", "#6741d9"),
    "gray": ("#f8f9fa", "#868e96"), "orange": ("#fff4e6", "#e8590c"),
    "red": ("#fff5f5", "#e03131"), "teal": ("#e6fcf5", "#099268"),
}.items()}

CLI = ["npx", "-y", "mcp-excalidraw-server"]


class Diagram:
    def __init__(self):
        self.els = []

    # ---- primitives -------------------------------------------------------
    def text(self, id, x, y, s, size=16, color="#1e1e1e", w=None, font="helvetica", align="left"):
        lines = s.split("\n")
        w = w or int(max(len(l) for l in lines) * size * 0.56) + 10
        h = int(len(lines) * size * 1.25) + 4
        self.els.append({"id": id, "type": "text", "x": x, "y": y, "width": w, "height": h,
                         "text": s, "fontSize": size, "fontFamily": font, "strokeColor": color,
                         "textAlign": align})
        return id

    def title(self, x, y, s, sub=None):
        self.text("title", x, y, s, size=28)
        if sub:
            self.text("subtitle", x, y + 42, sub, size=16, color="#495057")

    def box(self, id, x, y, w, h, s, color="blue", size=16, shape="rectangle", dashed=False, font="helvetica"):
        f, st = C[color]
        el = {"id": id, "type": shape, "x": x, "y": y, "width": w, "height": h, "text": s,
              "backgroundColor": f, "strokeColor": st, "fillStyle": "solid", "strokeWidth": 2,
              "roughness": 0, "fontSize": size, "fontFamily": font}
        if shape == "rectangle":
            el["roundness"] = {"type": 3}
        if dashed:
            el["strokeStyle"] = "dashed"
        self.els.append(el)
        return id

    def zone(self, id, x, y, w, h, label, color="gray", size=18):
        f, st = ZONE[color]
        self.els.append({"id": id, "type": "rectangle", "x": x, "y": y, "width": w, "height": h,
                         "backgroundColor": f, "strokeColor": st, "fillStyle": "solid",
                         "strokeStyle": "dashed", "strokeWidth": 2, "roughness": 0,
                         "roundness": {"type": 3}})
        self.text(id + "-lbl", x + 16, y + 10, label, size=size, color=st)
        return id

    def arrow(self, a, b, label=None, dashed=False, color="#495057", points=None, elbowed=False, x=0, y=0):
        el = {"type": "arrow", "x": x, "y": y, "startElementId": a, "endElementId": b,
              "strokeColor": color, "strokeWidth": 2, "roughness": 0, "endArrowhead": "arrow"}
        if label:
            el["text"] = label
            el["fontSize"] = 14
        if dashed:
            el["strokeStyle"] = "dashed"
        if points:
            el["points"] = points
            el["roundness"] = {"type": 2}
        if elbowed:
            el["elbowed"] = True
        self.els.append(el)

    def line(self, x, y, points, color="#495057", dashed=False, arrow=True, label=None):
        el = {"type": "arrow", "x": x, "y": y, "points": points, "strokeColor": color,
              "strokeWidth": 2, "roughness": 0, "endArrowhead": "arrow" if arrow else None}
        if dashed:
            el["strokeStyle"] = "dashed"
        if label:
            el["text"] = label
            el["fontSize"] = 14
        self.els.append(el)

    def table(self, id, x, y, name, rows, color="blue", w=None, note=None):
        """ER-style table: coloured header + white body with monospace fields."""
        size = 14
        w = w or max(240, int(max(len(r) for r in rows + [name]) * size * 0.62) + 30)
        hh = 40
        bh = int(len(rows) * size * 1.25) + 24
        self.box(id, x, y, w, hh, name, color=color, size=17)
        f, st = C[color]
        self.els.append({"id": id + "-body", "type": "rectangle", "x": x, "y": y + hh, "width": w,
                         "height": bh, "backgroundColor": "#ffffff", "strokeColor": st,
                         "fillStyle": "solid", "strokeWidth": 2, "roughness": 0})
        self.text(id + "-rows", x + 12, y + hh + 12, "\n".join(rows), size=size, font="cascadia")
        if note:
            self.text(id + "-note", x, y + hh + bh + 6, note, size=13, color="#868e96")
        return (x, y, w, hh + bh)

    # ---- output -----------------------------------------------------------
    def render(self, out_dir, name):
        out_dir = Path(out_dir)
        (out_dir / "src").mkdir(parents=True, exist_ok=True)
        run("clear", "--yes")
        time.sleep(0.8)
        p = subprocess.run(CLI + ["add", "-"], input=json.dumps(self.els), text=True,
                           capture_output=True, shell=sys.platform == "win32")
        if p.returncode:
            raise SystemExit(f"add failed: {p.stderr}\n{p.stdout}")
        time.sleep(2.0)
        run("export", "--out", str(out_dir / "src" / f"{name}.excalidraw"))
        run("screenshot", "--out", str(out_dir / f"{name}.png"))
        print(f"rendered {out_dir / name}.png  ({len(self.els)} elements)")


def run(*args):
    p = subprocess.run(CLI + list(args), text=True, capture_output=True, shell=sys.platform == "win32")
    if p.returncode:
        raise SystemExit(f"{' '.join(args)} failed ({p.returncode}): {p.stderr}\n{p.stdout}")
    return p.stdout
