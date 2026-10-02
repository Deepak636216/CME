import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { PLANETS, orbitPath } from "../lib/ephemeris.ts";
import { sceneTime } from "./time.ts";

/** Each planet's orbit around the current time. Orbits change too slowly to recompute while open. */
export function OrbitLines() {
  const paths = useMemo(() => {
    const t = sceneTime();
    return PLANETS.map((p) => ({ id: p.id, color: p.color, points: Array.from(orbitPath(p.id, t)) }));
  }, []);
  return (
    <>
      {paths.map((p) => (
        <Line key={p.id} points={p.points} color={p.color} lineWidth={1} transparent opacity={0.35} />
      ))}
    </>
  );
}
