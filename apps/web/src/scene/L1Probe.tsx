import { useRef } from "react";
import type { Group, Mesh } from "three";
import { useUi } from "../store/ui.ts";
import { useFramePositions } from "./time.ts";
import { drawnRadius } from "./sizes.ts";
import { Label } from "./Labels.tsx";

/**
 * The Sun–Earth L1 point, where DSCOVR and ACE measure the solar wind (the WindPanel data).
 * At readable scale the enlarged Earth would swallow it (L1 is 0.01 AU out, Earth is drawn 0.016 AU
 * wide), so it is drawn just outside Earth on the same Sun–Earth line. At true scale it is exact.
 */
export function L1Probe() {
  const group = useRef<Group>(null);
  const mesh = useRef<Mesh>(null);
  const trueScale = useUi((s) => s.scale === "true");
  useFramePositions((p) => {
    const g = group.current;
    if (!g) return;
    const [ex, ey, ez] = p.earth;
    const d = Math.hypot(ex, ey, ez);
    const earthR = drawnRadius("earth");
    const gap = Math.max(d - Math.hypot(...p.l1), earthR * 1.8);
    const k = 1 - gap / d;
    g.position.set(ex * k, ey * k, ez * k);
    mesh.current?.scale.setScalar(earthR * 0.12);
  });
  return (
    <group ref={group} name="l1">
      <mesh ref={mesh} rotation={[0, 0, Math.PI / 4]}>
        <octahedronGeometry args={[1]} />
        <meshBasicMaterial color="#c4b5fd" />
      </mesh>
      <Label text="L1" sub="solar wind monitor" side="left" marker={trueScale ? "#c4b5fd" : null} />
    </group>
  );
}
