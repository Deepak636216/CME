import { Component, type ReactNode } from "react";
import { SceneFallback } from "./SceneFallback.tsx";

/** Catches a scene that fails to start (WebGL context refused, chunk failed to load) and shows the fallback. */
export class SceneBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      const chunk = /dynamically imported module|Failed to fetch|Loading chunk/i.test(this.state.error.message);
      return (
        <SceneFallback
          reason={chunk ? "The 3D view could not be downloaded (offline?)." : "The 3D view could not start on this device."}
        />
      );
    }
    return this.props.children;
  }
}
