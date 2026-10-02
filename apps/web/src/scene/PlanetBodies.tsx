import { useRef } from "react";
import type { Group, Mesh } from "three";
import { PLANETS, type PlanetInfo } from "../lib/ephemeris.ts";
import { useUi } from "../store/ui.ts";
import { useFramePositions } from "./time.ts";
import { drawnRadius } from "./sizes.ts";
import { Label } from "./Labels.tsx";

function Planet({ info }: { info: PlanetInfo }) {
  const group = useRef<Group>(null);
  const mesh = useRef<Mesh>(null);
  const trueScale = useUi((s) => s.scale === "true");
  useFramePositions((p) => {
    group.current?.position.set(...p[info.id]);
    mesh.current?.scale.setScalar(drawnRadius(info.id));
  });
  return (
    <group ref={group} name={info.id}>
      <mesh ref={mesh}>
        <sphereGeometry args={[1, 32, 16]} />
        <meshStandardMaterial color={info.color} roughness={0.9} metalness={0} />
      </mesh>
      <Label text={info.label} marker={trueScale ? info.color : null} />
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
