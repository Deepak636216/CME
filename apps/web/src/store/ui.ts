import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type Scale = "readable" | "true";
export type View = "overview" | "top" | "sun" | "earth";

/**
 * The uiSlice from docs/design/frontend section 2: written only by user input.
 * `scale` and `keyOpen` are remembered across reloads; the camera always starts at the overview.
 */
export interface UiState {
  scale: Scale;
  view: View;
  /** Bumped on every setView, so picking the same view again re-centres the camera. */
  viewNonce: number;
  /** Key panel open? Open on a first desktop visit, closed on phones; then remembered. */
  keyOpen: boolean;
  setScale: (scale: Scale) => void;
  setView: (view: View) => void;
  setKeyOpen: (open: boolean) => void;
}

const wideScreen = () => typeof matchMedia === "undefined" || !matchMedia("(max-width: 640px)").matches;

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      scale: "readable",
      view: "overview",
      viewNonce: 0,
      keyOpen: wideScreen(),
      setScale: (scale) => set({ scale }),
      setKeyOpen: (keyOpen) => set({ keyOpen }),
      setView: (view) => set((s) => ({ view, viewNonce: s.viewNonce + 1 })),
    }),
    { name: "cme:ui:v1", storage: createJSONStorage(() => localStorage), partialize: (s) => ({ scale: s.scale, keyOpen: s.keyOpen }) },
  ),
);
