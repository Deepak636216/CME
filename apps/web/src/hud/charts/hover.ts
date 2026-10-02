import { create } from "zustand";

/** The time the pointer (or arrow keys) is on in any chart; null = showing the latest values. */
export const useHover = create<{ t: number | null; set: (t: number | null) => void }>()((set) => ({
  t: null,
  set: (t) => set({ t }),
}));

/** All HUD charts share one crosshair. */
export const SYNC_KEY = "hud";
