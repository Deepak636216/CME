/** A tiny control panel for testers: pick a scenario, change speed, inject faults, watch messages. */
export const CONTROL_PAGE = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mock Backend Control</title>
<style>
  :root { --bg:#f6f7f9; --card:#fff; --ink:#1d2330; --mute:#667085; --line:#e4e7ec; --acc:#2f6fed; --warn:#d92d20; --ok:#12b76a; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f1218; --card:#181c25; --ink:#e6e9ef; --mute:#98a2b3; --line:#2a3040; --acc:#6b9bff; --warn:#f97066; --ok:#32d583; } }
  * { box-sizing: border-box }
  body { margin:0; font:14px/1.45 system-ui, sans-serif; background:var(--bg); color:var(--ink); }
  main { max-width:1100px; margin:0 auto; padding:20px 16px; display:grid; gap:16px; grid-template-columns: 1fr 1fr; }
  @media (max-width: 800px) { main { grid-template-columns: 1fr } }
  h1 { grid-column:1/-1; margin:0; font-size:20px }
  h1 small { color:var(--mute); font-weight:400; font-size:13px }
  section { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px 16px; }
  h2 { margin:0 0 10px; font-size:13px; text-transform:uppercase; letter-spacing:.05em; color:var(--mute) }
  button { font:inherit; border:1px solid var(--line); background:transparent; color:var(--ink); border-radius:7px; padding:6px 10px; cursor:pointer }
  button:hover { border-color:var(--acc) }
  button.on { background:var(--acc); border-color:var(--acc); color:#fff }
  .scn { display:grid; gap:8px }
  .scn button { text-align:left; padding:8px 10px }
  .scn small { display:block; color:var(--mute) }
  .row { display:flex; gap:6px; flex-wrap:wrap; align-items:center }
  dl { display:grid; grid-template-columns:auto 1fr; gap:4px 12px; margin:0 }
  dt { color:var(--mute) }
  dd { margin:0; font-variant-numeric: tabular-nums }
  label { display:flex; gap:6px; align-items:center }
  input { font:inherit; width:80px; padding:4px 6px; border:1px solid var(--line); border-radius:6px; background:transparent; color:var(--ink) }
  #log { grid-column:1/-1 }
  #msgs { font:12px/1.5 ui-monospace, monospace; max-height:260px; overflow:auto; margin:0; white-space:pre-wrap }
  .alert { color:var(--warn) } .dot { display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--warn) } .dot.ok { background:var(--ok) }
</style>
</head>
<body>
<main>
  <h1>Mock backend <small>serves /api/v1 like the real one · <span class="dot" id="dot"></span> <span id="conn">connecting</span></small></h1>
  <section>
    <h2>Scenario</h2>
    <div class="scn" id="scn"></div>
  </section>
  <section>
    <h2>Clock</h2>
    <dl id="clock"></dl>
    <h2 style="margin-top:14px">Speed</h2>
    <div class="row" id="speeds"></div>
  </section>
  <section>
    <h2>Faults (chaos)</h2>
    <div class="row">
      <label>latency ms <input id="latencyMs" type="number" min="0"></label>
      <label>drop every s <input id="dropEveryS" type="number" min="0"></label>
      <label>skip every Nth <input id="skipEveryN" type="number" min="0"></label>
      <label>HTTP fail rate <input id="httpFailRate" type="number" min="0" max="1" step="0.05"></label>
    </div>
    <div class="row" style="margin-top:10px"><button id="chaosApply">Apply</button><button id="chaosOff">All off</button><button id="reset">Reset engine</button></div>
  </section>
  <section>
    <h2>Engine</h2>
    <dl id="eng"></dl>
  </section>
  <section id="log">
    <h2>Last messages on /api/v1/stream</h2>
    <pre id="msgs"></pre>
  </section>
</main>
<script>
const $ = (id) => document.getElementById(id);
const post = (p, body) => fetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
const fmt = (t) => new Date(t * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC";
const dl = (el, rows) => el.innerHTML = rows.map(([k, v]) => "<dt>" + k + "</dt><dd>" + v + "</dd>").join("");
let st = null;

async function refresh() {
  st = await fetch("/mock").then(r => r.json());
  const c = st.clock;
  dl($("clock"), [["sim time", fmt(c.now)], ["speed", c.speed + "x"], ["mode", c.mode], ["scenario", c.scenario || "-"],
    ["next event", st.nextEvent ? st.nextEvent.type + " at " + fmt(st.nextEvent.at) : "-"]]);
  dl($("eng"), [["seq", st.seq], ["clients", st.clients], ["X-ray points", st.xrayPoints], ["wind points", st.windPoints],
    ["flares / CMEs", st.flares + " / " + st.cmes], ["active alerts", st.activeAlerts],
    ["notes", st.notes.map(n => n.text).slice(-3).join("<br>") || "-"]]);
  $("scn").innerHTML = '<button data-s="">Replay only (no scenario)<small>Saved NOAA/NASA data, looped</small></button>' +
    st.scenarios.map(s => '<button data-s="' + s.name + '">' + s.title + '<small>' + s.description + '</small></button>').join("");
  for (const b of $("scn").querySelectorAll("button")) {
    b.classList.toggle("on", (b.dataset.s || null) === c.scenario);
    b.onclick = () => post("/mock/scenario", { name: b.dataset.s || null }).then(refresh);
  }
  $("speeds").innerHTML = [1, 10, 60, 300, 1200].map(v => '<button data-v="' + v + '" class="' + (v === c.speed ? "on" : "") + '">' + v + 'x</button>').join("");
  for (const b of $("speeds").querySelectorAll("button")) b.onclick = () => post("/mock/speed", { speed: +b.dataset.v }).then(refresh);
  for (const k of ["latencyMs", "dropEveryS", "skipEveryN", "httpFailRate"]) if (document.activeElement !== $(k)) $(k).value = st.chaos[k];
}
$("chaosApply").onclick = () => post("/mock/chaos", Object.fromEntries(["latencyMs", "dropEveryS", "skipEveryN", "httpFailRate"].map(k => [k, +$(k).value]))).then(refresh);
$("chaosOff").onclick = () => post("/mock/chaos", {}).then(refresh);
$("reset").onclick = () => post("/mock/reset", {}).then(refresh);

const lines = [];
function connect() {
  const ws = new WebSocket(location.origin.replace(/^http/, "ws") + "/api/v1/stream");
  ws.onopen = () => { $("conn").textContent = "stream connected"; $("dot").classList.add("ok"); };
  ws.onclose = () => { $("conn").textContent = "stream closed, retrying"; $("dot").classList.remove("ok"); setTimeout(connect, 1000); };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    let s = m.type.padEnd(8) + (m.seq !== undefined ? " #" + m.seq : "");
    if (m.type === "delta") s += "  " + Object.entries(m.data).filter(([k]) => k !== "clock").map(([k, v]) => k + ":" + (Array.isArray(v) ? v.length : (v.t ? v.t.length : "1"))).join(" ");
    if (m.type === "alert") s = '<span class="alert">' + s + "  " + m.data.title + " - " + m.data.message + "</span>";
    if (m.type === "snapshot") s += "  full state";
    lines.unshift(fmt(m.ts) + "  " + s);
    lines.length = Math.min(lines.length, 60);
    $("msgs").innerHTML = lines.join("\\n");
  };
}
connect();
refresh();
setInterval(refresh, 1000);
</script>
</body>
</html>`;
