import { useEffect, useRef, type ElementRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Vector3 } from "three";
import type { Positions } from "../lib/ephemeris.ts";
import { cmeDirection, cmeFrontKm } from "../lib/cme.ts";
import { rotatedLon } from "../lib/heliographic.ts";
import { planetPosition } from "../lib/ephemeris.ts";
import { AU_KM } from "@cme/physics";
import { liveStore } from "../store/live.ts";
import { useUi, type Scale, type Selection, type View } from "../store/ui.ts";
import { framePositions, frameSceneTime } from "./time.ts";
import { drawnL1, drawnRadius, stepScale } from "./sizes.ts";

type Controls = ElementRef<typeof OrbitControls>;
const DURATION_S = 0.9;

/**
 * What "focus" looks at for the selected object, at scene time t: a point to aim at, the size to frame, and the
 * direction to look from (planets from their sunlit side, a region straight down onto its spot, a CME side-on).
 */
export function focusTarget(sel: Selection | null, p: Positions, t: number): { point: Vector3; size: number; from: Vector3 } | null {
  if (!sel) return null;
  const up = new Vector3(0, 1, 0);
  switch (sel.kind) {
    case "planet": {
      const point = new Vector3(...p[sel.id]);
      const toSun = point.clone().normalize().negate();
      const side = new Vector3().crossVectors(up, toSun).normalize();
      return { point, size: drawnRadius(sel.id), from: toSun.multiplyScalar(0.8).addScaledVector(side, 0.5).addScaledVector(up, 0.3).normalize() };
    }
    case "l1": {
      const point = new Vector3(...drawnL1(p.earth, p.l1));
      const side = new Vector3().crossVectors(up, point.clone().normalize()).normalize();
      return { point, size: drawnRadius("earth") * 2, from: side.addScaledVector(up, 0.4).normalize() };
    }
    case "sun":
      return { point: new Vector3(), size: drawnRadius("sun") * 1.4, from: new Vector3(...p.earth).normalize().addScaledVector(up, 0.12).normalize() };
    case "region": {
      const live = liveStore.getState();
      const r = live.regions.find((x) => x.regionNo === sel.regionNo);
      if (!r) return null;
      const dir = new Vector3(...cmeDirection(r.lat, rotatedLon(r.lon, live.regionsAt, t), p.earth));
      return { point: dir.clone().multiplyScalar(drawnRadius("sun")), size: drawnRadius("sun") * 0.45, from: dir };
    }
    case "cme": {
      const c = liveStore.getState().cmes.find((x) => x.id === sel.id);
      const km = c ? cmeFrontKm(c, t) : null;
      if (!c || km === null) return null;
      const dir = new Vector3(...cmeDirection(c.lat, c.lon, planetPosition("earth", c.launchAt)));
      const au = km / AU_KM;
      const side = new Vector3().crossVectors(up, dir).normalize();
      return { point: dir.clone().multiplyScalar(au * 0.55), size: au * 0.75, from: side.addScaledVector(up, 0.5).normalize() };
    }
  }
}

/** Where the camera and its target go for a view. Recomputed every frame while flying, since Earth moves. */
function preset(view: View, scale: Scale, p: Positions, aspect: number, t: number): { pos: Vector3; target: Vector3 } {
  if (view === "focus") {
    const f = focusTarget(useUi.getState().selected, p, t);
    if (f) {
      const d = Math.max(f.size * (aspect < 1 ? 9 : 6), 0.0008);
      return { pos: f.point.clone().addScaledVector(f.from, d), target: f.point };
    }
  }
  // Overview and Top frame Earth's orbit; a portrait screen is narrow, so pull back until it fits across.
  const fit = Math.max(1, 1.6 / aspect);
  if (view === "top") return { pos: new Vector3(0, 2.7 * fit, 0.0001), target: new Vector3() };
  if (view === "sun") {
    // From Earth's side, close enough for the disc to fill much of the view: the face we see from Earth,
    // where the sunspots and flares are.
    const toEarth = new Vector3(...p.earth).normalize();
    const d = drawnRadius("sun") * (aspect < 1 ? 7 : 4.6);
    // aim a little below centre so the disc sits above the data panels along the bottom
    const below = new Vector3(0, -drawnRadius("sun") * 0.42, 0);
    return { pos: toEarth.multiplyScalar(d).add(new Vector3(0, d * 0.12, 0)).add(below), target: below };
  }
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
  return { pos: new Vector3(0, 1.25, 1.75).multiplyScalar(fit), target: new Vector3() };
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
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const portrait = aspect < 1;
  const view = useUi((s) => s.view);
  const nonce = useUi((s) => s.viewNonce);
  const scale = useUi((s) => s.scale);
  const flight = useRef<{ from: Vector3; fromTarget: Vector3; t: number } | null>(null);
  const lastFollowed = useRef<Vector3 | null>(null);
  const lastSelKey = useRef("null");

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    flight.current = { from: camera.position.clone(), fromTarget: c.target.clone(), t: reducedMotion() ? DURATION_S : 0 };
  }, [view, nonce, scale, camera, portrait]);

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
      const dest = preset(view, scale, p, aspect, frameSceneTime(state.clock.elapsedTime));
      camera.position.lerpVectors(f.from, dest.pos, k);
      c.target.lerpVectors(f.fromTarget, dest.target, k);
      if (f.t >= DURATION_S) flight.current = null;
    }
    // Follow what we're looking at as it moves: Earth in Earth view, the selected object in focus view.
    const followed =
      view === "earth"
        ? earth
        : view === "focus"
          ? (focusTarget(useUi.getState().selected, p, frameSceneTime(state.clock.elapsedTime))?.point ?? null)
          : null;
    // A new selection is not motion: don't drag the camera across the scene to it (Focus flies there).
    const selKey = JSON.stringify(useUi.getState().selected);
    if (selKey !== lastSelKey.current) {
      lastSelKey.current = selKey;
      lastFollowed.current = null;
    }
    if (!f && followed && lastFollowed.current) {
      const delta = followed.clone().sub(lastFollowed.current);
      camera.position.add(delta);
      c.target.add(delta);
    }
    lastFollowed.current = followed;
  });

  return <OrbitControls ref={controls} makeDefault enableDamping zoomToCursor minDistance={0.0005} maxDistance={8} />;
}
