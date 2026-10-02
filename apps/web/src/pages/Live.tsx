import { Suspense, lazy, useState } from "react";
import { SceneBoundary } from "../hud/SceneBoundary.tsx";
import { SceneControls } from "../hud/SceneControls.tsx";
import { SceneFallback } from "../hud/SceneFallback.tsx";
import { hasWebGL } from "../lib/webgl.ts";

const SceneCanvas = lazy(() => import("../scene/SceneCanvas.tsx"));

export function LivePage() {
  const [webgl] = useState(hasWebGL);
  return (
    <div className="live">
      <div className="scene">
        {webgl ? (
          <SceneBoundary>
            <Suspense fallback={<p className="scene-loading muted">Loading the solar system…</p>}>
              <SceneCanvas />
            </Suspense>
          </SceneBoundary>
        ) : (
          <SceneFallback reason="This browser or device has WebGL turned off." />
        )}
      </div>
      {webgl ? <SceneControls /> : null}
      <aside className="hud muted">X-ray chart and solar wind panel arrive in step 5.</aside>
    </div>
  );
}
