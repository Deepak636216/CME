import { useFrame } from "@react-three/fiber";
import { serverNow } from "../lib/api.ts";
import { positionsAt, type Positions } from "../lib/ephemeris.ts";
import { liveStore } from "../store/live.ts";

/** The scene's "now": server time from the store clock (wall clock before the first data). */
export function sceneTime(): number {
  const { clock, clockAt } = liveStore.getState();
  return clock ? serverNow(clock, clockAt) : Date.now() / 1000;
}

// Every component asks for positions in its own useFrame; compute them once per frame.
let cacheKey = -1;
let cache: Positions | null = null;

/** Body positions for the frame being drawn. `frameTime` is r3f's state.clock.elapsedTime (same within a frame). */
export function framePositions(frameTime: number): Positions {
  if (frameTime !== cacheKey || !cache) {
    cache = positionsAt(sceneTime());
    cacheKey = frameTime;
  }
  return cache;
}

/** Run `fn` every frame with this frame's positions. Never sets React state: no re-render per frame. */
export function useFramePositions(fn: (p: Positions) => void): void {
  useFrame((state) => fn(framePositions(state.clock.elapsedTime)));
}
