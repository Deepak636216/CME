import { useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { MeshBasicMaterial, PerspectiveCamera, Vector3, type Mesh } from "three";

const MIN_PX = 12;
const material = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });
const world = new Vector3();

/**
 * An invisible sphere around a body that catches clicks. Its radius is the body's drawn radius (×1.15) but
 * never less than 12 px on screen, so a planet at true scale (smaller than a pixel) is still easy to hit.
 * Place it inside the body's group, which must not be scaled.
 */
export function HitTarget({ radius, onSelect }: { radius: () => number; onSelect: (e: ThreeEvent<MouseEvent>) => void }) {
  const mesh = useRef<Mesh>(null);
  const tmp = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    const m = mesh.current;
    if (!m) return;
    m.getWorldPosition(world);
    const dist = tmp.copy(camera.position).distanceTo(world);
    const fov = ((camera as PerspectiveCamera).fov ?? 45) * (Math.PI / 180);
    const worldPerPx = (2 * dist * Math.tan(fov / 2)) / size.height;
    m.scale.setScalar(Math.max(radius() * 1.15, worldPerPx * MIN_PX));
  });
  return (
    <mesh
      ref={mesh}
      material={material}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(e);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      <sphereGeometry args={[1, 16, 8]} />
    </mesh>
  );
}
