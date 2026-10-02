import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type Scale = "readable" | "true";
export type View = "overview" | "top" | "earth";

/**
 * The uiSlice from docs/design/frontend section 2: written only by user input.
 * Only `scale` is remembered across reloads; the camera always starts at the overview.
 */
export interface UiState {
  scale: Scale;
  view: View;
  /** Bumped on every setView, so picking the same view again re-centres the camera. */
  viewNonce: number;
  setScale: (scale: Scale) => void;
  setView: (view: View) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      scale: "readable",
      view: "overview",
      viewNonce: 0,
      setScale: (scale) => set({ scale }),
      setView: (view) => set((s) => ({ view, viewNonce: s.viewNonce + 1 })),
    }),
    { name: "cme:ui:v1", storage: createJSONStorage(() => localStorage), partialize: (s) => ({ scale: s.scale }) },
  ),
);
