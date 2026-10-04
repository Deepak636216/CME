import type { Ref } from "react";
import { Html } from "@react-three/drei";

/**
 * A small screen-space label that stays readable at any zoom. `side` keeps neighbours apart
 * (Earth's label is on the right, L1's on the left). `marker` draws a dot at the body's position,
 * which is how a planet is found at true scale, where it is far smaller than a pixel. `subRef` lets a
 * render loop rewrite the second line directly, and `rootRef` hide the text when it would collide
 * (no React re-render either way). With `onSelect` the name is a real button: click, or Tab + Enter,
 * opens the object's info card (UF3).
 */
export function Label(props: {
  text: string;
  sub?: string;
  subRef?: Ref<HTMLElement>;
  rootRef?: Ref<HTMLDivElement>;
  side?: "right" | "left";
  marker?: string | null;
  onSelect?: () => void;
  selected?: boolean;
}) {
  const { text, sub, subRef, rootRef, side = "right", marker = null, onSelect, selected = false } = props;
  return (
    <Html style={{ pointerEvents: "none" }} zIndexRange={[10, 0]}>
      {marker ? <span className="scene-marker" style={{ borderColor: marker }} /> : null}
      <div ref={rootRef} className={`scene-label ${side}${selected ? " selected" : ""}`}>
        {onSelect ? (
          <button type="button" className="scene-label-btn" onClick={onSelect} aria-pressed={selected} title={`Details: ${text}`}>
            {text}
          </button>
        ) : (
          <span>{text}</span>
        )}
        {sub || subRef ? <small ref={subRef}>{sub}</small> : null}
      </div>
    </Html>
  );
}
