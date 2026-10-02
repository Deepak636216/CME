import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { BufferGeometry, Float32BufferAttribute, Line, LineDashedMaterial, type Group } from "three";
import { AU_KM } from "@cme/physics";
import { DEFAULT_WIND_KM_S, formatDuration, latest, lightSeconds, windSeconds } from "../lib/travel.ts";
import { liveStore } from "../store/live.ts";
import type { Vec3 } from "../lib/ephemeris.ts";
import { framePositions } from "./time.ts";
import { drawnRadius } from "./sizes.ts";
import { screenDistance, showIf } from "./declutter.ts";

const TEXT_EVERY_S = 0.5;

/** The current solar wind speed at L1, or null before any data. Shared with the L1 label. */
export function liveWindSpeed(): number | null {
  return latest(liveStore.getState().wind.view().speed);
}

/**
 * Dashed line from the Sun to Earth, labelled with how long sunlight and the solar wind take to cross it.
 * The wind time uses the speed measured at L1 right now. Text is written straight into the DOM a couple of
 * times a second from the render loop, so it costs no React re-renders.
 */
export function SunEarthLine() {
  const line = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(new Float32Array(6), 3));
    const m = new LineDashedMaterial({ color: "#ffb547", transparent: true, opacity: 0.55, dashSize: 0.014, gapSize: 0.01 });
    const l = new Line(g, m);
    l.frustumCulled = false;
    return l;
  }, []);
  const label = useRef<Group>(null);
  const light = useRef<HTMLSpanElement>(null);
  const wind = useRef<HTMLSpanElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const lastText = useRef(-Infinity);

  useFrame((state) => {
    const [ex, ey, ez] = framePositions(state.clock.elapsedTime).earth;
    const d = Math.hypot(ex, ey, ez);
    const ux = ex / d, uy = ey / d, uz = ez / d;
    const a = drawnRadius("sun") * 1.15;
    const b = d - drawnRadius("earth") * 1.4;
    const pos = line.geometry.attributes.position as Float32BufferAttribute;
    pos.setXYZ(0, ux * a, uy * a, uz * a);
    pos.setXYZ(1, ux * b, uy * b, uz * b);
    pos.needsUpdate = true;
    line.computeLineDistances();
    // Put the callout halfway along the line *as drawn*: in perspective the far half is squashed, so the
    // 3D midpoint can sit right next to the Sun. Bisect for the point that splits the on-screen length.
    const A: Vec3 = [ux * a, uy * a, uz * a];
    const B: Vec3 = [ux * b, uy * b, uz * b];
    const total = screenDistance(A, B, state.camera, state.size);
    let lo = 0, hi = 1;
    for (let i = 0; i < 10; i++) {
      const f = (lo + hi) / 2;
      const at = a + (b - a) * f;
      if (screenDistance(A, [ux * at, uy * at, uz * at], state.camera, state.size) < total / 2) lo = f;
      else hi = f;
    }
    const m = a + (b - a) * lo;
    label.current?.position.set(ux * m, uy * m, uz * m);
    // Declutter: the callout needs a line long enough on screen to sit on without hitting the labels.
    showIf(box.current, total > 300);

    const t = state.clock.elapsedTime;
    if (t - lastText.current < TEXT_EVERY_S) return;
    lastText.current = t;
    const speed = liveWindSpeed();
    const v = speed ?? DEFAULT_WIND_KM_S;
    const set = (el: HTMLElement | null, s: string) => {
      if (el && el.textContent !== s) el.textContent = s;
    };
    set(light.current, `Sunlight · ${formatDuration(lightSeconds(d))}`);
    set(
      wind.current,
      `Solar wind · ~${formatDuration(windSeconds(d * AU_KM, v))} at ${Math.round(v)} km/s${speed === null ? " (typical)" : ""}`,
    );
  });

  return (
    <>
      <primitive object={line} />
      <group ref={label}>
        <Html style={{ pointerEvents: "none" }} zIndexRange={[9, 0]}>
          <div ref={box} className="scene-callout">
            <span ref={light} />
            <span ref={wind} className="muted" />
          </div>
        </Html>
      </group>
    </>
  );
}
