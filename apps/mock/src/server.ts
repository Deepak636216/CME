/**
 * Serves the same /api/v1 contract as the real backend (docs/design/backend/README.md),
 * plus /mock/* control endpoints that only exist in the mock.
 */
import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { API_PREFIX, type ServerMessage } from "@cme/shared";
import { Engine, HISTORY_S } from "./engine.ts";
import type { Fixtures } from "./fixtures.ts";
import { listScenarios } from "./scenario.ts";
import { NO_CHAOS, sanitizeChaos, type ChaosConfig } from "./chaos.ts";
import { CONTROL_PAGE } from "./control-page.ts";

export interface MockServerOptions { port: number; fixtures: Fixtures; scenario?: string; speed?: number; chaos?: ChaosConfig }

export function startMockServer(opts: MockServerOptions) {
  let engine = new Engine({ fixtures: opts.fixtures, speed: opts.speed ?? 1 });
  let chaos: ChaosConfig = opts.chaos ?? NO_CHAOS;
  let sentCount = 0;
  if (opts.scenario) engine.startScenario(opts.scenario);

  const wss = new WebSocketServer({ noServer: true });

  const send = (ws: WebSocket, m: ServerMessage) => {
    const raw = JSON.stringify(m);
    const go = () => ws.readyState === WebSocket.OPEN && ws.send(raw);
    if (chaos.latencyMs) setTimeout(go, chaos.latencyMs);
    else go();
  };
  const snapshot = (): ServerMessage => ({ type: "snapshot", seq: engine.seq, ts: engine.clock().now, data: engine.state() });

  const attach = (e: Engine) =>
    e.subscribe((m) => {
      if ("seq" in m && chaos.skipEveryN && ++sentCount % chaos.skipEveryN === 0) return; // simulated loss
      for (const ws of wss.clients) send(ws, m);
    });
  let detach = attach(engine);

  const resetEngine = () => {
    detach();
    engine = new Engine({ fixtures: opts.fixtures });
    detach = attach(engine);
    const snap = snapshot();
    for (const ws of wss.clients) send(ws, snap);
  };

  wss.on("connection", (ws, req) => {
    const since = new URL(req.url ?? "/", "http://x").searchParams.get("since");
    const missed = since !== null && /^\d+$/.test(since) ? engine.messagesSince(Number(since)) : null;
    if (missed === null) send(ws, snapshot());
    else for (const m of missed) send(ws, m);
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(String(data));
        if (msg?.type === "resync") send(ws, snapshot());
      } catch {
        /* ignore bad client messages */
      }
    });
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const p = url.pathname;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") return void res.writeHead(204).end();

    const json = (code: number, body: unknown) => {
      res.writeHead(code, { "Content-Type": "application/json" }).end(JSON.stringify(body));
    };
    const q = (k: string) => url.searchParams.get(k);
    const num = (k: string, dflt: number) => (q(k) !== null && Number.isFinite(Number(q(k))) ? Number(q(k)) : dflt);

    try {
      if (p.startsWith(API_PREFIX) && chaos.httpFailRate && Math.random() < chaos.httpFailRate) {
        return json(503, { error: "simulated failure (chaos)" });
      }
      const now = engine.simNow();
      if (req.method === "GET") {
        switch (p) {
          case `${API_PREFIX}/state`: return json(200, engine.state());
          case `${API_PREFIX}/health`: return json(200, engine.health());
          case `${API_PREFIX}/regions`: return json(200, engine.regionsAt(now));
          case `${API_PREFIX}/history`: {
            const series = q("series");
            const resn = q("res") ?? "1m";
            if (series !== "xray" && series !== "wind") return json(400, { error: "series must be xray or wind" });
            if (resn !== "1m" && resn !== "5m") return json(400, { error: "res must be 1m or 5m" });
            const to = num("to", now);
            const from = Math.max(num("from", to - 86400), to - HISTORY_S);
            return json(200, { series, res: resn, from, to, data: engine.history(series, from, to, resn) });
          }
          case `${API_PREFIX}/events`: {
            const types = (q("type") ?? "flare,cme,alert").split(",").filter((t): t is "flare" | "cme" | "alert" =>
              t === "flare" || t === "cme" || t === "alert");
            return json(200, engine.events(types, num("since", now - HISTORY_S)));
          }
          case "/mock": return json(200, { ...engine.status(), chaos, scenarios: listScenarios(), clients: wss.clients.size });
          case "/mock/ui":
          case "/":
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(CONTROL_PAGE);
            return;
        }
        const cme = p.match(new RegExp(`^${API_PREFIX}/cmes/(.+)$`));
        if (cme) {
          const c = engine.cme(decodeURIComponent(cme[1]));
          return c ? json(200, c) : json(404, { error: "no such CME" });
        }
      }
      if (req.method === "POST") {
        const body = await readJson(req);
        switch (p) {
          case "/mock/scenario":
            if (body.name) engine.startScenario(String(body.name));
            else engine.stopScenario();
            return json(200, engine.status());
          case "/mock/speed":
            engine.setSpeed(Number(body.speed));
            engine.tick();
            return json(200, engine.status());
          case "/mock/chaos":
            chaos = sanitizeChaos(body);
            return json(200, chaos);
          case "/mock/reset":
            resetEngine();
            return json(200, engine.status());
        }
      }
      json(404, { error: `no route ${req.method} ${p}` });
    } catch (e) {
      json(400, { error: (e as Error).message });
    }
  });

  server.on("upgrade", (req, socket, head) => {
    if (new URL(req.url ?? "/", "http://x").pathname !== `${API_PREFIX}/stream`) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  const timers = [
    setInterval(() => engine.tick(), 1000),
    setInterval(() => {
      const ping: ServerMessage = { type: "ping", ts: engine.clock().now };
      for (const ws of wss.clients) send(ws, ping);
    }, 15_000),
    setInterval(() => {
      if (!chaos.dropEveryS) return;
      if (Date.now() / 1000 % chaos.dropEveryS < 1) for (const ws of wss.clients) ws.terminate();
    }, 1000),
  ];

  server.listen(opts.port);
  return {
    server,
    get engine() { return engine; },
    close: () => new Promise<void>((resolve) => {
      timers.forEach(clearInterval);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      server.close(() => resolve());
    }),
  };
}

function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let s = "";
    req.on("data", (c) => {
      s += c;
      if (s.length > 10_000) reject(new Error("body too large"));
    });
    req.on("end", () => {
      try {
        resolve(s ? JSON.parse(s) : {});
      } catch {
        reject(new Error("body must be JSON"));
      }
    });
  });
}
