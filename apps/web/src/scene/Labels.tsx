import { Html } from "@react-three/drei";

/**
 * A small screen-space label that stays readable at any zoom. `side` keeps neighbours apart
 * (Earth's label is on the right, L1's on the left); `lift` raises the anchor above a body, in AU.
 */
export function Label({ text, sub, side = "right", lift = 0 }: { text: string; sub?: string; side?: "right" | "left"; lift?: number }) {
  return (
    <Html position={[0, lift, 0]} style={{ pointerEvents: "none" }} zIndexRange={[10, 0]}>
      <div className={`scene-label ${side}`}>
        <span>{text}</span>
        {sub ? <small>{sub}</small> : null}
      </div>
    </Html>
  );
}
