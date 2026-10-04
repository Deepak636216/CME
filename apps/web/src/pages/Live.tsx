import { Suspense, lazy, useState } from "react";
import { SceneBoundary } from "../hud/SceneBoundary.tsx";
import { SceneClock } from "../hud/SceneClock.tsx";
import { SceneControls } from "../hud/SceneControls.tsx";
import { SceneKey } from "../hud/SceneKey.tsx";
import { CmeCard } from "../hud/CmeCard.tsx";
import { PanelBoundary } from "../hud/PanelBoundary.tsx";
import { SceneFallback } from "../hud/SceneFallback.tsx";
import { hasWebGL } from "../lib/webgl.ts";
import { useUi } from "../store/ui.ts";

const SceneCanvas = lazy(() => import("../scene/SceneCanvas.tsx"));
const HudPanels = lazy(() => import("../hud/charts/HudPanels.tsx"));
const InfoCard = lazy(() => import("../hud/InfoCard.tsx"));

export function LivePage() {
  const [webgl] = useState(hasWebGL);
  const selected = useUi((s) => s.selected);
  const hidden = useUi((s) => s.panelsHidden);
  return (
    <div className="live" data-panels={hidden ? "hidden" : "shown"}>
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
      {webgl ? (
        <>
          <SceneClock />
          <SceneControls />
          {!hidden && !selected ? <SceneKey /> : null}
          {!hidden ? <CmeCard /> : null}
          {selected ? (
            <PanelBoundary what="details">
              <Suspense fallback={null}>
                <InfoCard sel={selected} />
              </Suspense>
            </PanelBoundary>
          ) : null}
        </>
      ) : (
        <SceneClock />
      )}
      {!hidden ? (
        <PanelBoundary what="charts">
          <Suspense fallback={<div className="hud hud-wait muted">Loading charts…</div>}>
            <HudPanels />
          </Suspense>
        </PanelBoundary>
      ) : null}
    </div>
  );
}
