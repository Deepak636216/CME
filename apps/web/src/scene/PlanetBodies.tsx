import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Matrix4, Vector3, type Group, type Mesh } from "three";
import { PLANETS, earthAxes, type PlanetInfo } from "../lib/ephemeris.ts";
import { useUi } from "../store/ui.ts";
import { framePositions, frameSceneTime } from "./time.ts";
import { drawnRadius } from "./sizes.ts";
import { createAtmosphereMaterial, createEarthMaterial, createRockyMaterial } from "./materials.ts";
import { loadEarthMaps } from "./textures.ts";
import { reducedMotion } from "./motion.ts";
import { Label } from "./Labels.tsx";

const FADE_IN_S = 0.6;
const CLOUD_DRIFT = 0.0004; // map widths per second of wall time: just enough to see the clouds are alive

/**
 * Earth with NASA day, night-lights and cloud maps, its real tilt and spin for the scene time (so the
 * day/night line is today's), and a thin atmosphere halo. Flat blue until the maps arrive.
 */
function Earth({ info }: { info: PlanetInfo }) {
  const group = useRef<Group>(null);
  const globe = useRef<Mesh>(null);
  const halo = useRef<Mesh>(null);
  const trueScale = useUi((s) => s.scale === "true");
  const gl = useThree((s) => s.gl);
  const surface = useMemo(createEarthMaterial, []);
  const air = useMemo(createAtmosphereMaterial, []);
  const fade = useRef<number | null>(null);
  const tmp = useMemo(() => ({ m: new Matrix4(), x: new Vector3(), y: new Vector3(), z: new Vector3(), lastT: NaN }), []);

  useEffect(() => {
    let alive = true;
    loadEarthMaps(gl.capabilities.getMaxAnisotropy())
      .then((maps) => {
        if (!alive) return;
        surface.uniforms.uDay.value = maps.day;
        surface.uniforms.uNight.value = maps.night;
        surface.uniforms.uClouds.value = maps.clouds;
        fade.current = reducedMotion() ? 1 : 0;
      })
      .catch(() => {
        /* offline: stay flat blue */
      });
    return () => {
      alive = false;
      surface.dispose();
      air.dispose();
    };
  }, [gl, surface, air]);

  useFrame((state, dt) => {
    const p = framePositions(state.clock.elapsedTime);
    const t = frameSceneTime(state.clock.elapsedTime);
    group.current?.position.set(...p.earth);
    const r = drawnRadius("earth");
    globe.current?.scale.setScalar(r);
    halo.current?.scale.setScalar(r * 1.035);

    if (globe.current && t !== tmp.lastT) {
      const a = earthAxes(t);
      tmp.m.makeBasis(tmp.x.set(...a.x), tmp.y.set(...a.y), tmp.z.set(...a.z));
      globe.current.quaternion.setFromRotationMatrix(tmp.m);
      tmp.lastT = t;
    }

    const d = Math.hypot(...p.earth);
    surface.uniforms.uSunDir.value.set(-p.earth[0] / d, -p.earth[1] / d, -p.earth[2] / d);
    air.uniforms.uSunDir.value.copy(surface.uniforms.uSunDir.value);

    if (fade.current !== null && fade.current < 1) fade.current = Math.min(1, fade.current + dt / FADE_IN_S);
    surface.uniforms.uReady.value = fade.current ?? 0;
    if (!reducedMotion()) surface.uniforms.uCloudShift.value = (surface.uniforms.uCloudShift.value + dt * CLOUD_DRIFT) % 1;
  });

  return (
    <group ref={group} name={info.id}>
      <mesh ref={globe} material={surface}>
        <sphereGeometry args={[1, 96, 48]} />
      </mesh>
      <mesh ref={halo} material={air}>
        <sphereGeometry args={[1, 64, 32]} />
      </mesh>
      <Label text={info.label} marker={trueScale ? info.color : null} />
    </group>
  );
}

/** Venus (banded cloud deck) and Mercury (cratered rock), procedural: nothing to download. */
function RockyPlanet({ info }: { info: PlanetInfo & { id: "venus" | "mercury" } }) {
  const group = useRef<Group>(null);
  const mesh = useRef<Mesh>(null);
  const trueScale = useUi((s) => s.scale === "true");
  const surface = useMemo(() => createRockyMaterial(info.id), [info.id]);
  useEffect(() => () => surface.dispose(), [surface]);

  useFrame((state, dt) => {
    const p = framePositions(state.clock.elapsedTime);
    const pos = p[info.id];
    group.current?.position.set(...pos);
    mesh.current?.scale.setScalar(drawnRadius(info.id));
    const d = Math.hypot(...pos);
    surface.uniforms.uSunDir.value.set(-pos[0] / d, -pos[1] / d, -pos[2] / d);
    if (!reducedMotion()) surface.uniforms.uTime.value += dt;
  });

  return (
    <group ref={group} name={info.id}>
      <mesh ref={mesh} material={surface}>
        <sphereGeometry args={[1, 48, 24]} />
      </mesh>
      <Label text={info.label} marker={trueScale ? info.color : null} />
    </group>
  );
}

/** Mercury, Venus and Earth at their real positions for the scene time. */
export function PlanetBodies() {
  return (
    <>
      {PLANETS.map((p) =>
        p.id === "earth" ? (
          <Earth key={p.id} info={p} />
        ) : (
          <RockyPlanet key={p.id} info={p as PlanetInfo & { id: "venus" | "mercury" }} />
        ),
      )}
    </>
  );
}
