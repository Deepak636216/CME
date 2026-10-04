import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { PlanetId } from "../lib/ephemeris.ts";

export type Scale = "readable" | "true";
/** Camera presets; "focus" flies to the selected object and follows it. */
export type View = "overview" | "top" | "sun" | "earth" | "focus";

/** What the info card shows (UF3). */
export type Selection =
  | { kind: "planet"; id: PlanetId }
  | { kind: "sun" }
  | { kind: "l1" }
  | { kind: "region"; regionNo: number }
  | { kind: "cme"; id: string };

/** Panels that can be minimized to their header line. */
export type PanelId = "xray" | "wind" | "cme";

/**
 * The uiSlice from docs/design/frontend section 2: written only by user input.
 * Remembered across reloads: `scale`, `keyOpen`, `minimized`. The camera always starts at the overview,
 * nothing starts selected, and panels always start shown (`panelsHidden` is not remembered).
 */
export interface UiState {
  scale: Scale;
  view: View;
  /** Bumped on every setView, so picking the same view again re-centres the camera. */
  viewNonce: number;
  /** Key panel open? Open on a first desktop visit, closed on phones; then remembered. */
  keyOpen: boolean;
  selected: Selection | null;
  minimized: Record<PanelId, boolean>;
  /** Every overlay hidden for a clear view of the scene (clock and controls stay). */
  panelsHidden: boolean;
  setScale: (scale: Scale) => void;
  setView: (view: View) => void;
  setKeyOpen: (open: boolean) => void;
  select: (s: Selection | null) => void;
  setMinimized: (panel: PanelId, min: boolean) => void;
  setPanelsHidden: (hidden: boolean) => void;
}

const wideScreen = () => typeof matchMedia === "undefined" || !matchMedia("(max-width: 640px)").matches;

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      scale: "readable",
      view: "overview",
      viewNonce: 0,
      keyOpen: wideScreen(),
      selected: null,
      minimized: { xray: false, wind: false, cme: true }, // CME cards start compact: they sit over Earth's side of the scene
      panelsHidden: false,
      setScale: (scale) => set({ scale }),
      setKeyOpen: (keyOpen) => set({ keyOpen }),
      setView: (view) => set((s) => ({ view, viewNonce: s.viewNonce + 1 })),
      select: (selected) => set({ selected }),
      setMinimized: (panel, min) => set((s) => ({ minimized: { ...s.minimized, [panel]: min } })),
      setPanelsHidden: (panelsHidden) => set({ panelsHidden }),
    }),
    {
      name: "cme:ui:v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ scale: s.scale, keyOpen: s.keyOpen, minimized: s.minimized }),
      // older saved states have no `minimized`; keep the defaults for anything missing
      merge: (saved, current) => {
        const p = (saved ?? {}) as Partial<UiState>;
        return { ...current, ...p, minimized: { ...current.minimized, ...(p.minimized ?? {}) } };
      },
    },
  ),
);

/** Same selection? (for highlighting the selected label) */
export function sameSelection(a: Selection | null, b: Selection | null): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  switch (a.kind) {
    case "planet":
      return a.id === (b as typeof a).id;
    case "region":
      return a.regionNo === (b as typeof a).regionNo;
    case "cme":
      return a.id === (b as typeof a).id;
    default:
      return true;
  }
}
