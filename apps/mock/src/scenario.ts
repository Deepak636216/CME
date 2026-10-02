/**
 * Scenario files: scripted events on top of the replayed background data.
 * Times ("at") are SIM minutes after the scenario starts.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SCENARIO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scenarios");

export type ScenarioEvent =
  /** With arrivalOf, `at` is ignored and the change happens offsetMin after that CME reaches Earth. */
  | { at: number; type: "speed"; value: number; arrivalOf?: string; offsetMin?: number }
  | { at: number; type: "note"; text: string; arrivalOf?: string; offsetMin?: number }
  | {
      at: number; type: "region"; regionNo: number; location: string; areaMsh: number;
      magClass?: string; spotCount?: number; pM?: number; pX?: number;
    }
  | { at: number; type: "flare"; id: string; regionNo?: number; peakClass: string; riseMin: number; decayMin: number }
  | {
      at: number; type: "cme"; id: string; flareId?: string; speed: number; lat: number; lon: number; halfAngle: number;
      arrival?: { bzMin: number; peakDensity: number; durationHours: number };
    }
  | { at: number; type: "feedOutage"; feed: "goes_xray" | "rtsw" | "regions" | "donki"; durationMin: number };

export interface Scenario {
  name: string;
  title: string;
  description: string;
  /** What a usability tester should be able to answer after watching it. */
  tasks?: string[];
  speed: number;
  events: ScenarioEvent[];
}

export function listScenarios(): { name: string; title: string; description: string }[] {
  return readdirSync(SCENARIO_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => loadScenario(f.replace(/\.json$/, "")))
    .map(({ name, title, description }) => ({ name, title, description }));
}

export function loadScenario(name: string): Scenario {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`bad scenario name: ${name}`);
  const s = JSON.parse(readFileSync(path.join(SCENARIO_DIR, `${name}.json`), "utf8")) as Omit<Scenario, "name">;
  if (!Array.isArray(s.events) || !(s.speed > 0)) throw new Error(`scenario ${name}: needs speed and events[]`);
  return { name, ...s, events: [...s.events].sort((a, b) => a.at - b.at) };
}
