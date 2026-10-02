import { useEffect, useState } from "react";
import type { Positions } from "../lib/ephemeris.ts";
import { useServerNow } from "../lib/clock.ts";

type Ephemeris = typeof import("../lib/ephemeris.ts");

const ROWS: { id: keyof Positions; label: string }[] = [
  { id: "mercury", label: "Mercury" },
  { id: "venus", label: "Venus" },
  { id: "earth", label: "Earth" },
  { id: "l1", label: "L1 monitor" },
];

/**
 * Shown instead of the 3D scene when it can't run (no WebGL, lost context, chunk failed to load):
 * the same positions as numbers, never a blank area (FR-9).
 */
export function SceneFallback({ reason }: { reason: string }) {
  const [eph, setEph] = useState<Ephemeris | null>(null);
  const now = useServerNow() ?? Date.now() / 1000;
  useEffect(() => {
    import("../lib/ephemeris.ts").then(setEph, () => setEph(null));
  }, []);
  const pos = eph?.positionsAt(now);
  return (
    <div className="scene-fallback">
      <h2>3D view unavailable</h2>
      <p className="muted">{reason} Live data, badges and alerts keep working.</p>
      {pos && eph ? (
        <table className="kv">
          <thead>
            <tr>
              <th>Body</th>
              <th>Distance from Sun</th>
              <th>Ecliptic longitude</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.id}>
                <td>{r.label}</td>
                <td>{Math.hypot(...pos[r.id]).toFixed(4)} AU</td>
                <td>{eph.eclipticLongitude(pos[r.id]).toFixed(1)}°</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
