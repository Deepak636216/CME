/** Animations that only decorate (granulation, cloud drift, corona) stand still for reduced-motion users. */
export const reducedMotion = (): boolean =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
