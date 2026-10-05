import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { ConeGeometry, Quaternion, SphereGeometry, Vector3, type Group } from "three";
import { AU_KM } from "@cme/physics";
import type { Cme } from "@cme/shared";
import { activeCmes, cmeDirection, cmeFrontKm, cmePhase, cmeSpeedAt } from "../lib/cme.ts";
import { planetPosition, type Vec3 } from "../lib/ephemeris.ts";
import { formatDuration } from "../lib/travel.ts";
import { useLive } from "../store/live.ts";
import { sameSelection, useUi } from "../store/ui.ts";
import { createCmeMaterial } from "./materials.ts";
import { frameSceneTime } from "./time.ts";
import { reducedMotion } from "./motion.ts";
import { screenDistance, showIf } from "./declutter.ts";

const MAX_DRAWN = 6;
const EARTH_COLOR = "#ff9a5c"; // warm: heading for Earth
const MISS_COLOR = "#9cc4ff"; // cool: passing by
const UP = new Vector3(0, 1, 0);
const LABELLED = 2; // the same CMEs the HUD cards list

/** Shared between shells: which CMEs may carry a label (by priority) and where each label sits on screen. */
interface LabelState {
  allowed: string[];
  at: Map<string, { x: number; y: number }>;
}
const tip = new Vector3();

/** Brightness by distance: bright near the Sun, still clear at 1 AU, gone by 1.6 AU. */
function fadeAt(au: number): number {
  const spread = 1 / (1 + au * 1.2);
  const out = 1 - Math.min(1, Math.max(0, (au - 1.25) / 0.35));
  return Math.max(0.35, spread) * out;
}

export function cmeLabel(cme: Cme, t: number): string {
  const v = Math.round(cmeSpeedAt(cme, t)).toLocaleString("en-US");
  const phase = cmePhase(cme, t);
  const eta = cme.forecast?.eta ?? null;
  if (phase === "missing Earth") return `CME · ${v} km/s · will miss Earth`;
  if (phase === "passed Earth") return `CME · reached Earth ${formatDuration(t - (eta ?? t))} ago`;
  if (phase === "erupting") return `CME erupting · ${v} km/s`;
  return `CME → Earth in ${formatDuration((eta ?? t) - t)} · ${v} km/s`;
}

function Shell({ cme, labels }: { cme: Cme; labels: LabelState }) {
  const group = useRef<Group>(null);
  const label = useRef<Group>(null);
  const box = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const lastText = useRef(-Infinity);
  const half = (Math.min(Math.max(cme.halfAngle, 5), 85) * Math.PI) / 180;
  const selected = useUi((s) => sameSelection(s.selected, { kind: "cme", id: cme.id }));

  const { cap, cone, front, flank, dir } = useMemo(() => {
    const capGeo = new SphereGeometry(1, 64, 20, 0, Math.PI * 2, 0, half);
    const h = Math.cos(half);
    const coneGeo = new ConeGeometry(Math.sin(half), h, 48, 1, true).rotateX(Math.PI).translate(0, h / 2, 0);
    const f = createCmeMaterial(false);
    const fl = createCmeMaterial(true);
    const color = cme.earthDirected ? EARTH_COLOR : MISS_COLOR;
    f.uniforms.uColor.value.set(color);
    fl.uniforms.uColor.value.set(color);
    f.uniforms.uCosHalf.value = h;
    const earth = planetPosition("earth", cme.launchAt);
    const d: Vec3 = cmeDirection(cme.lat, cme.lon, earth);
    return { cap: capGeo, cone: coneGeo, front: f, flank: fl, dir: d };
    // cme.id: a different CME always gets its own geometry and materials, even with the same angles
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cme.id, cme.lat, cme.lon, cme.launchAt, cme.earthDirected, half]);

  useEffect(
    () => () => {
      cap.dispose();
      cone.dispose();
      front.dispose();
      flank.dispose();
    },
    [cap, cone, front, flank],
  );

  const orient = useMemo(() => new Quaternion().setFromUnitVectors(UP, new Vector3(...dir)), [dir]);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const t = frameSceneTime(state.clock.elapsedTime);
    const km = cmeFrontKm(cme, t);
    g.visible = km !== null;
    if (km === null) {
      showIf(box.current, false);
      return;
    }
    const au = km / AU_KM;
    g.quaternion.copy(orient);
    g.scale.setScalar(au);
    const fade = fadeAt(au);
    front.uniforms.uFade.value = fade;
    flank.uniforms.uFade.value = fade;
    if (!reducedMotion()) {
      front.uniforms.uTime.value += dt;
      flank.uniforms.uTime.value += dt;
    }
    label.current?.position.set(dir[0] * au, dir[1] * au, dir[2] * au);
    // Label only the CMEs the cards list, once the front has left the Sun's crowd on screen, and never on top
    // of a higher-priority CME's label.
    const rank = labels.allowed.indexOf(cme.id);
    let show = rank !== -1;
    if (show) {
      const front: Vec3 = [dir[0] * au, dir[1] * au, dir[2] * au];
      show = screenDistance([0, 0, 0], front, state.camera, state.size) > 70;
      tip.set(...front).project(state.camera);
      const me = { x: ((tip.x + 1) * state.size.width) / 2, y: ((1 - tip.y) * state.size.height) / 2 };
      labels.at.set(cme.id, me);
      for (const other of labels.allowed.slice(0, rank)) {
        const o = labels.at.get(other);
        if (o && Math.abs(o.x - me.x) < 230 && Math.abs(o.y - me.y) < 26) show = false;
      }
    }
    showIf(box.current, show);
    if (state.clock.elapsedTime - lastText.current > 0.5) {
      lastText.current = state.clock.elapsedTime;
      const s = cmeLabel(cme, t);
      if (text.current && text.current.textContent !== s) text.current.textContent = s;
    }
  });

  return (
    <>
      <group ref={group} visible={false}>
        <mesh geometry={cap} material={front} />
        <mesh geometry={cone} material={flank} />
      </group>
      <group ref={label}>
        <Html style={{ pointerEvents: "none" }} zIndexRange={[7, 0]}>
          <div ref={box} className={`scene-label cme-label ${cme.earthDirected ? "earth" : ""}${selected ? " selected" : ""}`} style={{ display: "none" }}>
            <button type="button" className="scene-label-btn" onClick={() => useUi.getState().select({ kind: "cme", id: cme.id })}>
              <span ref={text} />
            </button>
          </div>
        </Html>
      </group>
    </>
  );
}

/**
 * CMEs travelling out from the Sun (UF5): ice-cream-cone shells moved every frame by the same drag-based model
 * the server used for the ETA, in the direction they left the Sun. Warm = Earth-directed, cool = missing Earth.
 */
export function CmeShells() {
  const cmes = useLive((s) => s.cmes);
  const labels = useMemo<LabelState>(() => ({ allowed: [], at: new Map() }), []);
  const lastRank = useRef(-Infinity);
  useFrame((state) => {
    if (state.clock.elapsedTime - lastRank.current < 0.5) return;
    lastRank.current = state.clock.elapsedTime;
    labels.allowed = activeCmes(cmes, frameSceneTime(state.clock.elapsedTime)).slice(0, LABELLED).map((c) => c.id);
  });
  // Mount the most relevant few (Earth-directed first, then newest); each shell shows itself only while its
  // front is between the Sun and 1.6 AU at the scene time, so mounting a finished one costs nothing.
  const shown = useMemo(
    () =>
      [...cmes]
        .sort((a, b) => Number(b.earthDirected) - Number(a.earthDirected) || b.launchAt - a.launchAt)
        .slice(0, MAX_DRAWN),
    [cmes],
  );
  return (
    <>
      {shown.map((c) => (
        <Shell key={c.id} cme={c} labels={labels} />
      ))}
    </>
  );
}
