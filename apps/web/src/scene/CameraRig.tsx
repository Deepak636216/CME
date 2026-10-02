import { useEffect, useRef, type ElementRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Vector3 } from "three";
import type { Positions } from "../lib/ephemeris.ts";
import { useUi, type Scale, type View } from "../store/ui.ts";
import { framePositions } from "./time.ts";
import { stepScale } from "./sizes.ts";

type Controls = ElementRef<typeof OrbitControls>;
const DURATION_S = 0.9;

/** Where the camera and its target go for a view. Recomputed every frame while flying, since Earth moves. */
function preset(view: View, scale: Scale, p: Positions): { pos: Vector3; target: Vector3 } {
  if (view === "top") return { pos: new Vector3(0, 2.7, 0.0001), target: new Vector3() };
  if (view === "earth") {
    // Behind Earth, off to the side and a little above the ecliptic, looking back at the Sun: the way a CME
    // would arrive. The side offset keeps part of Earth's day side in view.
    const earth = new Vector3(...p.earth);
    const out = earth.clone().normalize();
    const side = new Vector3(-out.z, 0, out.x); // along the orbit, in the ecliptic plane
    const d = scale === "true" ? 0.03 : 0.3;
    const pos = earth.clone().addScaledVector(out, d).addScaledVector(side, d * 0.6).add(new Vector3(0, d * 0.35, 0));
    return { pos, target: earth };
  }
  return { pos: new Vector3(0, 1.25, 1.75), target: new Vector3() };
}

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

/**
 * OrbitControls plus animated camera presets (UF2). Also drives the scale animation, once per frame.
 * In Earth view the camera follows Earth along its orbit; dragging cancels a flight in progress.
 */
export function CameraRig() {
  const controls = useRef<Controls>(null);
  const camera = useThree((s) => s.camera);
  const view = useUi((s) => s.view);
  const nonce = useUi((s) => s.viewNonce);
  const scale = useUi((s) => s.scale);
  const flight = useRef<{ from: Vector3; fromTarget: Vector3; t: number } | null>(null);
  const lastEarth = useRef<Vector3 | null>(null);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    flight.current = { from: camera.position.clone(), fromTarget: c.target.clone(), t: reducedMotion() ? DURATION_S : 0 };
  }, [view, nonce, scale, camera]);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const cancel = () => (flight.current = null);
    c.addEventListener("start", cancel);
    return () => c.removeEventListener("start", cancel);
  }, []);

  useFrame((state, dt) => {
    stepScale(dt);
    const c = controls.current;
    if (!c) return;
    const p = framePositions(state.clock.elapsedTime);
    const earth = new Vector3(...p.earth);
    const f = flight.current;
    if (f) {
      f.t = Math.min(DURATION_S, f.t + dt);
      const k = ease(f.t / DURATION_S);
      const dest = preset(view, scale, p);
      camera.position.lerpVectors(f.from, dest.pos, k);
      c.target.lerpVectors(f.fromTarget, dest.target, k);
      if (f.t >= DURATION_S) flight.current = null;
    } else if (view === "earth" && lastEarth.current) {
      const delta = earth.clone().sub(lastEarth.current);
      camera.position.add(delta);
      c.target.add(delta);
    }
    lastEarth.current = earth;
  });

  return <OrbitControls ref={controls} makeDefault enableDamping zoomToCursor minDistance={0.0005} maxDistance={8} />;
}
