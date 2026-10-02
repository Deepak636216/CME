import { useEffect } from "react";
import { idbCache } from "../lib/localCache.ts";
import { liveStore } from "../store/live.ts";
import { LiveStream } from "./client.ts";

/** Runs the live stream for as long as the calling component is mounted. Mount it once, in AppShell. */
export function useLiveStream(): void {
  useEffect(() => {
    const stream = new LiveStream({ store: liveStore, cache: idbCache });
    void stream.start();

    const online = () => stream.reconnectNow();
    const hide = () => void stream.saveCache();
    const visible = () => document.visibilityState === "visible" && stream.reconnectNow();
    window.addEventListener("online", online);
    window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", visible);
      stream.stop();
    };
  }, []);
}
