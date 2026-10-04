import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Quaternion, Vector3, type Group, type Mesh, type ShaderMaterial } from "three";
import { formatLocation } from "@cme/physics";
import { flaresAt, spotsAt, activityFromFlux, type FlareMark, type SpotMark } from "../lib/sunActivity.ts";
import { latest } from "../lib/travel.ts";
import { liveStore, useLive } from "../store/live.ts";
import { MAX_FLARES, MAX_SPOTS, createFlareGlowMaterial } from "./materials.ts";
import { frameSceneTime } from "./time.ts";
import { drawnRadius, scaleAnim } from "./sizes.ts";
import { reducedMotion } from "./motion.ts";
import { showIf } from "./declutter.ts";
import { HitTarget } from "./HitTarget.tsx";
import { useUi } from "../store/ui.ts";

const REFRESH_S = 0.25; // spots and flares change slowly; the pulse is per frame
/** Spots are enlarged with the bodies at readable scale (true size at true scale). */
const SPOT_ENLARGE_READABLE = 1.6;

/**
 * Everything happening on the Sun (UF4, Phase 3): sunspot groups and flare kernels drawn by the photosphere
 * shader, flare glows that stay visible when the Sun is small on screen, corona brightness from the X-ray flux,
 * and labels that appear only when there is room (regions in close-up, the flare from mid-distance).
 */
export function SunActivity({ surface, corona, sunGroup }: { surface: ShaderMaterial; corona: ShaderMaterial; sunGroup: React.RefObject<Group> }) {
  const state = useRef<{ spots: SpotMark[]; flares: FlareMark[]; activity: number; last: number }>({
    spots: [], flares: [], activity: 0, last: -Infinity,
  });
  const glows = useRef<(Mesh | null)[]>([]);
  const glowMats = useMemo(() => Array.from({ length: MAX_FLARES }, createFlareGlowMaterial), []);
  useEffect(() => () => glowMats.forEach((m) => m.dispose()), [glowMats]);
  const regionLabels = useRef(new Map<number, { group: Group | null; box: HTMLDivElement | null }>());
  const flareLabel = useRef<{ group: Group | null; box: HTMLDivElement | null; text: HTMLSpanElement | null }>({ group: null, box: null, text: null });
  const regions = useLive((s) => s.regions);
  const selectedRegion = useUi((s) => (s.selected?.kind === "region" ? s.selected.regionNo : null));

  /** A click on the Sun: the region whose spot is under (or right next to) the pointer, else the Sun itself. */
  const onSunClick = (point: Vector3) => {
    const sun = sunGroup.current;
    if (!sun) return;
    const local = point.clone().applyQuaternion(new Quaternion().copy(sun.quaternion).invert()).normalize();
    let best: { no: number; d: number } | null = null;
    for (const sp of state.current.spots) {
      const d = Math.acos(Math.min(1, Math.max(-1, local.x * sp.dir[0] + local.y * sp.dir[1] + local.z * sp.dir[2])));
      if (d <= Math.max(sp.radius * 2.5, 0.06) && (!best || d < best.d)) best = { no: sp.regionNo, d };
    }
    useUi.getState().select(best ? { kind: "region", regionNo: best.no } : { kind: "sun" });
  };
  const tmp = useMemo(() => ({ w: new Vector3(), cam: new Vector3(), right: new Vector3(), c: new Vector3() }), []);

  useFrame((frame, dt) => {
    const t = frameSceneTime(frame.clock.elapsedTime);
    const st = state.current;
    const r = drawnRadius("sun");

    if (frame.clock.elapsedTime - st.last > REFRESH_S) {
      st.last = frame.clock.elapsedTime;
      const live = liveStore.getState();
      const enlarge = 1 + (SPOT_ENLARGE_READABLE - 1) * (1 - scaleAnim.mix);
      st.spots = spotsAt(live.regions, live.regionsAt, t, MAX_SPOTS, enlarge);
      st.flares = flaresAt(live.flares, t, MAX_FLARES);
      st.activity = activityFromFlux(latest(live.xray.view().long));
      const u = surface.uniforms;
      st.spots.forEach((s, i) => u.uSpots.value[i].set(s.dir[0], s.dir[1], s.dir[2], s.radius));
      u.uSpotCount.value = st.spots.length;
      u.uFlareCount.value = st.flares.length;
    }

    // corona eases toward the current activity
    const ca = corona.uniforms.uActivity;
    ca.value += (st.activity - ca.value) * (1 - Math.exp(-dt * 2));

    // flare kernels and glows, pulsing while they rise
    const still = reducedMotion();
    st.flares.forEach((f, i) => {
      const pulse = f.rising && !still ? 0.72 + 0.28 * Math.sin(frame.clock.elapsedTime * 5) : 1;
      const k = f.strength * pulse;
      surface.uniforms.uFlares.value[i].set(f.dir[0], f.dir[1], f.dir[2], k);
      const g = glows.current[i];
      if (g) {
        g.visible = true;
        g.position.set(f.dir[0] * r * 1.03, f.dir[1] * r * 1.03, f.dir[2] * r * 1.03);
        g.scale.setScalar(r); // the glow shader sizes itself from its world scale (= Sun radius)
        glowMats[i].uniforms.uStrength.value = k;
      }
    });
    for (let i = st.flares.length; i < MAX_FLARES; i++) if (glows.current[i]) glows.current[i]!.visible = false;

    // Labels: how big is the Sun on screen, and does each point face the camera?
    const sun = sunGroup.current;
    if (!sun) return;
    tmp.right.setFromMatrixColumn(frame.camera.matrixWorld, 0).multiplyScalar(r);
    const c = tmp.c.set(0, 0, 0).project(frame.camera);
    const e = tmp.right.project(frame.camera);
    const sunPx = Math.hypot(((e.x - c.x) * frame.size.width) / 2, ((e.y - c.y) * frame.size.height) / 2);
    tmp.cam.copy(frame.camera.position).normalize();
    const facing = (dir: readonly number[]) => {
      tmp.w.set(dir[0], dir[1], dir[2]).applyQuaternion(sun.quaternion);
      return tmp.w.dot(tmp.cam) > 0.2;
    };

    // Place labels by priority: the flare first, then regions biggest first. A label that would overlap one
    // already placed is hidden; the flaring region's own label is dropped (the flare label names it).
    const placed: { x: number; y: number }[] = [];
    const screen = (dir: readonly number[], lift: number) => {
      tmp.w.set(dir[0] * r * lift, dir[1] * r * lift, dir[2] * r * lift).applyQuaternion(sun.quaternion).project(frame.camera);
      return { x: ((tmp.w.x + 1) * frame.size.width) / 2, y: ((1 - tmp.w.y) * frame.size.height) / 2 };
    };
    const fits = (p: { x: number; y: number }) => placed.every((q) => Math.abs(p.x - q.x) > 120 || Math.abs(p.y - q.y) > 30);

    const top = st.flares[0];
    const fl = flareLabel.current;
    let flareShown = false;
    if (top && fl.group) {
      fl.group.position.set(top.dir[0] * r * 1.08, top.dir[1] * r * 1.08, top.dir[2] * r * 1.08);
      const f = top.flare;
      const text = `${f.cls} · ${f.regionNo ? `AR ${f.regionNo} · ` : ""}${f.status}`;
      if (fl.text && fl.text.textContent !== text) fl.text.textContent = text;
      if (sunPx > 40 && facing(top.dir)) {
        placed.push(screen(top.dir, 1.08));
        flareShown = true;
      }
    }
    showIf(fl.box, flareShown);

    for (const s of st.spots) {
      const l = regionLabels.current.get(s.regionNo);
      if (!l?.group) continue;
      l.group.position.set(s.dir[0] * r, s.dir[1] * r, s.dir[2] * r);
      let show = sunPx > 115 && facing(s.dir) && !(flareShown && top!.flare.regionNo === s.regionNo);
      if (show) {
        const p = screen(s.dir, 1);
        show = fits(p);
        if (show) placed.push(p);
      }
      showIf(l.box, show);
    }
    for (const [no, l] of regionLabels.current) if (!st.spots.some((s) => s.regionNo === no)) showIf(l.box, false);
  });

  return (
    <>
      <HitTarget radius={() => drawnRadius("sun") / 1.15} onSelect={(e) => onSunClick(e.point)} />
      <group>
        {glowMats.map((m, i) => (
          <mesh key={i} ref={(el) => (glows.current[i] = el)} material={m} visible={false} scale={1}>
            <planeGeometry args={[1, 1]} />
          </mesh>
        ))}
      </group>
      {regions.map((reg) => (
        <group key={reg.regionNo} ref={(g) => regionLabels.current.set(reg.regionNo, { ...(regionLabels.current.get(reg.regionNo) ?? { box: null }), group: g })}>
          <Html style={{ pointerEvents: "none" }} zIndexRange={[8, 0]}>
            <div
              ref={(el) => regionLabels.current.set(reg.regionNo, { ...(regionLabels.current.get(reg.regionNo) ?? { group: null }), box: el })}
              className={`scene-label region-label${selectedRegion === reg.regionNo ? " selected" : ""}`}
              style={{ display: "none" }}
            >
              <button type="button" className="scene-label-btn" onClick={() => useUi.getState().select({ kind: "region", regionNo: reg.regionNo })}>
                AR {reg.regionNo}
              </button>
              <small>
                {formatLocation(reg.lat, reg.lon)}
                {reg.magClass ? ` · ${reg.magClass}` : ""}
              </small>
            </div>
          </Html>
        </group>
      ))}
      <group ref={(g) => (flareLabel.current.group = g)}>
        <Html style={{ pointerEvents: "none" }} zIndexRange={[9, 0]}>
          <div ref={(el) => (flareLabel.current.box = el)} className="scene-label flare-label" style={{ display: "none" }}>
            <button
              type="button"
              className="scene-label-btn"
              onClick={() => {
                const no = state.current.flares[0]?.flare.regionNo;
                useUi.getState().select(no ? { kind: "region", regionNo: no } : { kind: "sun" });
              }}
            >
              Flare
            </button>
            <small ref={(el) => (flareLabel.current.text = el)} />
          </div>
        </Html>
      </group>
    </>
  );
}
