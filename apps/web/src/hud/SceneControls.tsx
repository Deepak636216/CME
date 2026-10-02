import { useUi, type Scale, type View } from "../store/ui.ts";

const SCALES: { id: Scale; label: string; hint: string }[] = [
  { id: "readable", label: "Readable", hint: "Bodies enlarged so they can be seen; distances stay real" },
  { id: "true", label: "True scale", hint: "Real sizes: planets are smaller than a pixel, so dots mark them" },
];
const VIEWS: { id: View; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "top", label: "Top" },
  { id: "earth", label: "Earth" },
];

/** Scale toggle (UF2) and camera presets, over the scene. */
export function SceneControls() {
  const scale = useUi((s) => s.scale);
  const view = useUi((s) => s.view);
  const { setScale, setView } = useUi.getState();
  return (
    <div className="scene-controls">
      <div className="seg" role="radiogroup" aria-label="Scale">
        {SCALES.map((s) => (
          <button key={s.id} role="radio" aria-checked={scale === s.id} title={s.hint} onClick={() => setScale(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="seg" role="group" aria-label="Camera">
        {VIEWS.map((v) => (
          <button key={v.id} aria-pressed={view === v.id} onClick={() => setView(v.id)}>
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}
