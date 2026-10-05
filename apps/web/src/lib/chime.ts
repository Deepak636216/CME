/**
 * A short two-note chime made with Web Audio (no sound file to download). Browsers only allow audio after the
 * reader has interacted with the page, so `unlockAudio` is called on the first click or key press.
 */
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (ctx) return ctx;
  const AC = typeof window === "undefined" ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    return null;
  }
  return ctx;
}

export function unlockAudio(): void {
  const c = context();
  if (c && c.state === "suspended") void c.resume().catch(() => {});
}

/** Warnings: falling pair, played twice. Watches: one soft rising pair. */
export function playChime(level: "watch" | "warning"): void {
  const c = context();
  if (!c || c.state !== "running") return;
  const notes = level === "warning" ? [880, 660, 880, 660] : [660, 880];
  const t0 = c.currentTime + 0.02;
  notes.forEach((f, i) => {
    const at = t0 + i * 0.16 + (i >= 2 ? 0.12 : 0);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level === "warning" ? 0.18 : 0.1, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
    osc.connect(gain).connect(c.destination);
    osc.start(at);
    osc.stop(at + 0.32);
  });
}
