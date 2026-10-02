import { useSyncExternalStore } from "react";
import { liveStore } from "../store/live.ts";
import { serverNow } from "./api.ts";

// One shared 1 s ticker for every age display, running only while something is subscribed.
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let wallSecond = Math.floor(Date.now() / 1000);

function subscribe(fn: () => void) {
  listeners.add(fn);
  timer ??= setInterval(() => {
    wallSecond = Math.floor(Date.now() / 1000);
    listeners.forEach((l) => l());
  }, 1000);
  return () => {
    listeners.delete(fn);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Wall-clock seconds, re-rendering the caller once a second. */
export function useWallSecond(): number {
  return useSyncExternalStore(subscribe, () => wallSecond);
}

/** Current server time (null before any data), re-rendering once a second. */
export function useServerNow(): number | null {
  const wall = useWallSecond();
  const { clock, clockAt } = liveStore.getState();
  return clock ? serverNow(clock, clockAt, wall) : null;
}
