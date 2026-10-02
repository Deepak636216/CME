import { useState } from "react";
import "uplot/dist/uPlot.min.css";
import { useServerNow } from "../../lib/clock.ts";
import { XrayChart } from "./XrayChart.tsx";
import { WindPanel } from "./WindPanel.tsx";

/**
 * The Live page's data panels (step 5). Loaded lazily with uPlot, and redrawn once a second as the 6 h
 * window slides (design rule: charts at most 1 Hz; the 3D scene runs on its own). On phones the two
 * panels become tabs, solar wind first (it is what changes minute to minute).
 */
export default function HudPanels() {
  const now = useServerNow();
  const [tab, setTab] = useState<"wind" | "xray">("wind");
  if (now === null) return <div className="hud hud-wait muted">Waiting for data…</div>;
  return (
    <div className="hud" data-tab={tab}>
      <div className="hud-tabs" role="tablist" aria-label="Data panels">
        <button role="tab" aria-selected={tab === "wind"} onClick={() => setTab("wind")}>Solar wind</button>
        <button role="tab" aria-selected={tab === "xray"} onClick={() => setTab("xray")}>X-rays</button>
      </div>
      <div className="hud-slot hud-xray">
        <XrayChart now={Math.floor(now)} />
      </div>
      <div className="hud-slot hud-wind">
        <WindPanel now={Math.floor(now)} />
      </div>
    </div>
  );
}
