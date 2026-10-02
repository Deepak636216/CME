import { READABLE_RADIUS, TRUE_RADIUS } from "../scene/sizes.ts";
import { useUi } from "../store/ui.ts";

const ENLARGED = {
  earth: Math.round(READABLE_RADIUS.earth / TRUE_RADIUS.earth),
  sun: Math.round(READABLE_RADIUS.sun / TRUE_RADIUS.sun),
};

/** What each mark in the scene means (design review: Understand, P1). Collapsible; the choice is remembered. */
export function SceneKey() {
  const open = useUi((s) => s.keyOpen);
  const scale = useUi((s) => s.scale);
  const setOpen = useUi.getState().setKeyOpen;

  if (!open) {
    return (
      <button className="scene-key-toggle" onClick={() => setOpen(true)} aria-expanded="false" aria-controls="scene-key">
        Key
      </button>
    );
  }
  return (
    <section id="scene-key" className="scene-key" aria-label="Key">
      <div className="scene-key-head">
        <h2>Key</h2>
        <button onClick={() => setOpen(false)} aria-expanded="true" aria-controls="scene-key">
          Hide
        </button>
      </div>
      <ul>
        <li>
          <span className="sw sw-sun" aria-hidden />
          Sun, at the centre
        </li>
        <li>
          <span className="sw sw-spot" aria-hidden />
          Sunspot group (NOAA region), sized by its area
        </li>
        <li>
          <span className="sw sw-flare" aria-hidden />
          Flare: pulses while rising, fades after it ends
        </li>
        <li>
          <span className="sw sw-cme" aria-hidden />
          CME cloud: orange heads for Earth, blue misses
        </li>
        <li>
          <span className="sw sw-planet" aria-hidden />
          Planet where it is right now; lit side faces the Sun
        </li>
        <li>
          <span className="sw sw-l1" aria-hidden />
          L1: spacecraft measuring the solar wind before it reaches Earth
        </li>
        <li>
          <span className="sw sw-orbit" aria-hidden />
          Orbit
        </li>
        <li>
          <span className="sw sw-line" aria-hidden />
          Sun–Earth line, with travel times
        </li>
      </ul>
      <p className="scene-key-scale">
        {scale === "readable"
          ? `Sizes enlarged to be visible (Earth ×${ENLARGED.earth}, Sun ×${ENLARGED.sun}). Distances are real.`
          : "True sizes and distances. Planets are smaller than a pixel, so rings mark them."}
      </p>
      <p className="scene-key-credit">Earth imagery: NASA Blue Marble and Black Marble.</p>
    </section>
  );
}
