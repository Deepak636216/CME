import type { Alert } from "@cme/shared";

/** Shape as well as colour: a triangle for warnings, a circle for watches, a bell for tests. */
export function AlertIcon({ a, size = 16 }: { a: Pick<Alert, "level" | "rule">; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 16 16", "aria-hidden": true, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (a.rule === "TEST") return <svg {...common}><path d="M4 11V7a4 4 0 0 1 8 0v4l1.5 1.5h-11ZM6.5 14h3" /></svg>;
  if (a.level === "warning") return <svg {...common}><path d="M8 2 15 14H1Z" /><path d="M8 6.5v3.5M8 12v.01" /></svg>;
  return <svg {...common}><circle cx="8" cy="8" r="6.2" /><path d="M8 4.8v3.8M8 11.2v.01" /></svg>;
}

export const levelLabel = (a: Pick<Alert, "level" | "clearedAt">) => (a.clearedAt !== null ? "Over" : a.level === "warning" ? "Warning" : "Watch");
