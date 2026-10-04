import { useRef } from "react";
import type { Group, Mesh } from "three";
import { useUi } from "../store/ui.ts";
import { HitTarget } from "./HitTarget.tsx";
import { useFrame } from "@react-three/fiber";
import { framePositions } from "./time.ts";
import { screenDistance, showIf } from "./declutter.ts";
import { drawnL1, drawnRadius } from "./sizes.ts";
import { Label } from "./Labels.tsx";
import { liveWindSpeed } from "./SunEarthLine.tsx";
import { DEFAULT_WIND_KM_S, formatDuration, windSeconds } from "../lib/travel.ts";
import { L1_DISTANCE_AU } from "../lib/ephemeris.ts";
import { AU_KM } from "@cme/physics";

/**
 * The Sun–Earth L1 point, where DSCOVR and ACE measure the solar wind (the WindPanel data).
 * At readable scale the enlarged Earth would swallow it (L1 is 0.01 AU out, Earth is drawn 0.016 AU
 * wide), so it is drawn just outside Earth on the same Sun–Earth line. At true scale it is exact.
 */
export function L1Probe() {
  const group = useRef<Group>(null);
  const mesh = useRef<Mesh>(null);
  const trueScale = useUi((s) => s.scale === "true");
  const selected = useUi((s) => s.selected?.kind === "l1");
  const select = () => useUi.getState().select({ kind: "l1" });
  const sub = useRef<HTMLElement>(null);
  const labelBox = useRef<HTMLDivElement>(null);
  useFrame((state) => {
    const p = framePositions(state.clock.elapsedTime);
    // "how far ahead of Earth": the wind measured here reaches Earth after crossing 1.5 million km
    const v = liveWindSpeed() ?? DEFAULT_WIND_KM_S;
    const text = `solar wind monitor · ~${formatDuration(windSeconds(L1_DISTANCE_AU * AU_KM, v))} ahead of Earth`;
    if (sub.current && sub.current.textContent !== text) sub.current.textContent = text;
    const g = group.current;
    if (!g) return;
    const earthR = drawnRadius("earth");
    const at = drawnL1(p.earth, p.l1);
    g.position.set(...at);
    mesh.current?.scale.setScalar(earthR * 0.12);
    // Declutter, measured where L1 is drawn: right next to Earth on screen the Earth label is enough,
    // and the detail line needs room.
    const apart = screenDistance(p.earth, at, state.camera, state.size);
    showIf(labelBox.current, apart > 14);
    showIf(sub.current, apart > 36);
  });
  return (
    <group ref={group} name="l1">
      <mesh ref={mesh} rotation={[0, 0, Math.PI / 4]}>
        <octahedronGeometry args={[1]} />
        <meshBasicMaterial color="#c4b5fd" />
      </mesh>
      <HitTarget radius={() => drawnRadius("earth") * 0.12} onSelect={select} />
      <Label text="L1" sub="solar wind monitor" subRef={sub} rootRef={labelBox} side="left" marker={trueScale ? "#c4b5fd" : null} onSelect={select} selected={selected} />
    </group>
  );
}
