import { Component, type ReactNode } from "react";

/**
 * Keeps a failing panel from taking the page with it: the Live page's 3D scene and badges keep running and
 * only the panel area shows a message (FR-9: never a blank screen).
 */
export class PanelBoundary extends Component<{ children: ReactNode; what: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="hud hud-wait muted" role="status">
          The {this.props.what} could not be shown. The live view above keeps running; the Status page lists every feed.
        </div>
      );
    }
    return this.props.children;
  }
}
