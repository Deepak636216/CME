import { useUi, type PanelId } from "../store/ui.ts";

/** Minimize a panel to its header line, or expand it again. The choice is remembered. */
export function MinButton({ panel, label }: { panel: PanelId; label: string }) {
  const min = useUi((s) => s.minimized[panel]);
  return (
    <button
      type="button"
      className="hud-min"
      aria-expanded={!min}
      aria-label={`${min ? "Expand" : "Minimize"} ${label}`}
      title={min ? "Expand" : "Minimize"}
      onClick={() => useUi.getState().setMinimized(panel, !min)}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {min ? <path d="M4 10l4-4 4 4" /> : <path d="M4 8h8" />}
      </svg>
    </button>
  );
}
