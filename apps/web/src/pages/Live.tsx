import { Suspense, lazy } from "react";

const SceneCanvas = lazy(() => import("../scene/SceneCanvas.tsx"));

export function LivePage() {
  return (
    <div className="live">
      <div className="scene">
        <Suspense fallback={<p className="scene-loading muted">Loading the solar system…</p>}>
          <SceneCanvas />
        </Suspense>
      </div>
      <aside className="hud muted">X-ray chart and solar wind panel arrive in step 5.</aside>
    </div>
  );
}
