/**
 * Mock backend entry point.
 *
 *   npm run mock                                   # replay saved data in real time on :8787
 *   npm run mock -- --scenario big-storm           # play a scripted storm
 *   npm run mock -- --speed 60 --chaos drop=45,skip=25
 */
import { parseArgs } from "node:util";
import { loadFixtures } from "./fixtures.ts";
import { parseChaos } from "./chaos.ts";
import { startMockServer } from "./server.ts";

const { values } = parseArgs({
  options: {
    port: { type: "string", default: process.env.PORT ?? "8787" },
    scenario: { type: "string" },
    speed: { type: "string", default: "1" },
    chaos: { type: "string" },
  },
});

const t0 = performance.now();
const fixtures = loadFixtures();
const port = Number(values.port);
const mock = startMockServer({
  port, fixtures, scenario: values.scenario, speed: Number(values.speed), chaos: parseChaos(values.chaos),
});

const s = mock.engine.status();
console.log(`[mock] ready in ${Math.round(performance.now() - t0)} ms  -  ${s.xrayPoints} X-ray + ${s.windPoints} wind points, ` +
  `${s.flares} flares, ${s.cmes} CMEs in 7-day history`);
console.log(`[mock] API      http://localhost:${port}/api/v1/state`);
console.log(`[mock] stream   ws://localhost:${port}/api/v1/stream`);
console.log(`[mock] control  http://localhost:${port}/mock/ui`);
if (values.scenario) console.log(`[mock] scenario ${values.scenario}`);
