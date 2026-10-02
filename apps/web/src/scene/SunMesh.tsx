import { useRef } from "react";
import type { Group } from "three";
import { AdditiveBlending } from "three";
import { useFramePositions } from "./time.ts";
import { READABLE_RADIUS } from "./sizes.ts";
import { Label } from "./Labels.tsx";

/**
 * The Sun at the origin. Its group is turned every frame so that local +Z points at Earth: heliographic
 * longitude 0 (the Earth-facing central meridian), where Phase 3 places sunspots by lat/lon.
 * (The 7.25° tilt of the solar axis is ignored at this scale.)
 */
export function SunMesh() {
  const group = useRef<Group>(null);
  useFramePositions((p) => group.current?.lookAt(p.earth[0], p.earth[1], p.earth[2]));
  const r = READABLE_RADIUS.sun;
  return (
    <group ref={group} name="sun">
      <mesh>
        <sphereGeometry args={[r, 64, 32]} />
        <meshBasicMaterial color="#ffb547" />
      </mesh>
      <mesh scale={1.6}>
        <sphereGeometry args={[r, 32, 16]} />
        <meshBasicMaterial color="#ff8a1f" transparent opacity={0.12} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
      <Label text="Sun" lift={r * 1.7} />
    </group>
  );
}
