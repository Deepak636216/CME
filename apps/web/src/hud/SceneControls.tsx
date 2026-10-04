import { useUi, type Scale, type View } from "../store/ui.ts";

const SCALES: { id: Scale; label: string; hint: string }[] = [
  { id: "readable", label: "Readable", hint: "Bodies enlarged so they can be seen; distances stay real" },
  { id: "true", label: "True scale", hint: "Real sizes: planets are smaller than a pixel, so dots mark them" },
];
const VIEWS: { id: View; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "top", label: "Top" },
  { id: "sun", label: "Sun" },
  { id: "earth", label: "Earth" },
];

/** Scale toggle (UF2) and camera presets, over the scene. */
export function SceneControls() {
  const scale = useUi((s) => s.scale);
  const view = useUi((s) => s.view);
  const hidden = useUi((s) => s.panelsHidden);
  const { setScale, setView, setPanelsHidden } = useUi.getState();
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
      <div className="seg">
        <button
          className="seg-icon"
          aria-pressed={hidden}
          aria-label={hidden ? "Show panels" : "Hide panels"}
          title={hidden ? "Show the data panels" : "Hide every panel for a clear view"}
          onClick={() => setPanelsHidden(!hidden)}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
            {hidden ? <path d="M3 3l18 18" /> : null}
          </svg>
        </button>
      </div>
    </div>
  );
}
