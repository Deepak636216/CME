import { Html } from "@react-three/drei";

/**
 * A small screen-space label that stays readable at any zoom. `side` keeps neighbours apart
 * (Earth's label is on the right, L1's on the left). `marker` draws a dot at the body's position,
 * which is how a planet is found at true scale, where it is far smaller than a pixel.
 */
export function Label(props: { text: string; sub?: string; side?: "right" | "left"; marker?: string | null }) {
  const { text, sub, side = "right", marker = null } = props;
  return (
    <Html style={{ pointerEvents: "none" }} zIndexRange={[10, 0]}>
      {marker ? <span className="scene-marker" style={{ borderColor: marker }} /> : null}
      <div className={`scene-label ${side}`}>
        <span>{text}</span>
        {sub ? <small>{sub}</small> : null}
      </div>
    </Html>
  );
}
