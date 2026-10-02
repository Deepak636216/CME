import type { ReactNode } from "react";

/** Stand-in for a page that a later phase of docs/design/PLAN.md builds. */
export function Placeholder({ title, phase, children }: { title: string; phase: string; children?: ReactNode }) {
  return (
    <section className="placeholder">
      <h1>{title}</h1>
      <p className="muted">Coming in {phase}.</p>
      {children}
    </section>
  );
}
