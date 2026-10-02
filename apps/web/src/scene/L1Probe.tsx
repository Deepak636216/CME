import { useRef } from "react";
import type { Group } from "three";
import { useFramePositions } from "./time.ts";
import { READABLE_RADIUS } from "./sizes.ts";
import { Label } from "./Labels.tsx";

const SIZE = 0.004;

/**
 * The Sun–Earth L1 point, where DSCOVR and ACE measure the solar wind (the WindPanel data).
 * At readable scale the enlarged Earth would swallow it (L1 is 0.01 AU out, Earth is drawn 0.016 AU
 * wide), so it is drawn just outside Earth on the same Sun–Earth line.
 */
export function L1Probe() {
  const group = useRef<Group>(null);
  useFramePositions((p) => {
    const g = group.current;
    if (!g) return;
    const [ex, ey, ez] = p.earth;
    const d = Math.hypot(ex, ey, ez);
    const gap = Math.max(d - Math.hypot(...p.l1), READABLE_RADIUS.earth * 1.8);
    const k = 1 - gap / d;
    g.position.set(ex * k, ey * k, ez * k);
  });
  return (
    <group ref={group} name="l1">
      <mesh rotation={[0, 0, Math.PI / 4]}>
        <octahedronGeometry args={[SIZE]} />
        <meshBasicMaterial color="#c4b5fd" />
      </mesh>
      <Label text="L1" sub="solar wind monitor" side="left" />
    </group>
  );
}
