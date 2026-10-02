import { useRef } from "react";
import type { Group } from "three";
import { PLANETS, type PlanetInfo } from "../lib/ephemeris.ts";
import { useFramePositions } from "./time.ts";
import { READABLE_RADIUS } from "./sizes.ts";
import { Label } from "./Labels.tsx";

function Planet({ info }: { info: PlanetInfo }) {
  const group = useRef<Group>(null);
  useFramePositions((p) => group.current?.position.set(...p[info.id]));
  return (
    <group ref={group} name={info.id}>
      <mesh>
        <sphereGeometry args={[READABLE_RADIUS[info.id], 32, 16]} />
        <meshStandardMaterial color={info.color} roughness={0.9} metalness={0} />
      </mesh>
      <Label text={info.label} />
    </group>
  );
}

/** Mercury, Venus and Earth at their real positions for the scene time. */
export function PlanetBodies() {
  return (
    <>
      {PLANETS.map((p) => (
        <Planet key={p.id} info={p} />
      ))}
    </>
  );
}
