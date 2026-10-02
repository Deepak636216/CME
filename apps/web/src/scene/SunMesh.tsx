import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { framePositions } from "./time.ts";
import { drawnRadius } from "./sizes.ts";
import { createCoronaMaterial, createSunMaterial } from "./materials.ts";
import { reducedMotion } from "./motion.ts";
import { Label } from "./Labels.tsx";
import { SunActivity } from "./SunActivity.tsx";

/**
 * The Sun at the origin: a photosphere shader (limb darkening, granulation, faculae) and a corona glow.
 * Its group is turned every frame so that local +Z points at Earth: heliographic longitude 0 (the
 * Earth-facing central meridian), where Phase 3 places sunspots by lat/lon. (The 7.25° tilt of the
 * solar axis is ignored at this scale.) Geometry is a unit sphere, scaled per frame.
 */
export function SunMesh() {
  const group = useRef<Group>(null);
  const body = useRef<Group>(null);
  const label = useRef<Group>(null);
  const surface = useMemo(createSunMaterial, []);
  const corona = useMemo(createCoronaMaterial, []);
  useEffect(
    () => () => {
      surface.dispose();
      corona.dispose();
    },
    [surface, corona],
  );

  useFrame((state, dt) => {
    const p = framePositions(state.clock.elapsedTime);
    group.current?.lookAt(p.earth[0], p.earth[1], p.earth[2]);
    const r = drawnRadius("sun");
    body.current?.scale.setScalar(r);
    label.current?.position.set(0, r * 1.7, 0);
    if (!reducedMotion()) {
      surface.uniforms.uTime.value += dt;
      corona.uniforms.uTime.value += dt;
    }
  });

  return (
    <group ref={group} name="sun">
      <group ref={body}>
        <mesh material={surface}>
          <sphereGeometry args={[1, 96, 48]} />
        </mesh>
        <mesh material={corona}>
          <planeGeometry args={[8, 8]} />
        </mesh>
      </group>
      <group ref={label}>
        <Label text="Sun" />
      </group>
      <SunActivity surface={surface} corona={corona} sunGroup={group} />
    </group>
  );
}
