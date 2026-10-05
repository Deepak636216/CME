import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { get, set } from "idb-keyval";
import type { Alert } from "@cme/shared";
import { MAX_TOASTS, pruneAcks, shouldToast } from "../lib/alerts.ts";

const ACK_KEY = "cme:alerts:acked:v1";

export interface AlertsState {
  /** Ids of alerts the reader has seen (dismissed, shown, or opened the bell). Kept in IndexedDB. */
  acked: ReadonlySet<string>;
  /** Alerts popped up right now, newest first. */
  toasts: Alert[];
  /** Play a chime for new alerts. Remembered. */
  sound: boolean;
  /** Also show a system notification when the tab is in the background (needs browser permission). Remembered. */
  notify: boolean;
  /** A new alert arrived over the stream; returns true if it popped up. */
  receive: (a: Alert) => boolean;
  /** Take a toast off the screen without marking it read. */
  hide: (id: string) => void;
  ack: (ids: readonly string[]) => void;
  setSound: (on: boolean) => void;
  setNotify: (on: boolean) => void;
}

export const useAlerts = create<AlertsState>()(
  persist(
    (setState, getState) => ({
      acked: new Set(),
      toasts: [],
      sound: true,
      notify: false,
      receive: (a) => {
        const s = getState();
        if (!shouldToast(a, s.acked, s.toasts)) return false;
        setState({ toasts: [a, ...s.toasts].slice(0, MAX_TOASTS) });
        return true;
      },
      hide: (id) => setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      ack: (ids) => {
        if (!ids.length) return;
        const acked = new Set(getState().acked);
        for (const id of ids) acked.add(id);
        setState((s) => ({ acked, toasts: s.toasts.filter((t) => !acked.has(t.id)) }));
        void set(ACK_KEY, [...acked]).catch(() => {});
      },
      setSound: (sound) => setState({ sound }),
      setNotify: (notify) => setState({ notify }),
    }),
    {
      name: "cme:alerts:prefs:v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ sound: s.sound, notify: s.notify }),
    },
  ),
);

/** Load the read list once at start-up, dropping ids of alerts the server no longer has. */
export async function loadAcks(currentAlerts: () => readonly Alert[]): Promise<void> {
  try {
    const saved = (await get<string[]>(ACK_KEY)) ?? [];
    const merged = new Set([...saved, ...useAlerts.getState().acked]);
    useAlerts.setState((s) => ({ acked: merged, toasts: s.toasts.filter((t) => !merged.has(t.id)) }));
    const alerts = currentAlerts();
    if (alerts.length) void set(ACK_KEY, pruneAcks([...merged], alerts)).catch(() => {});
  } catch {
    // private mode / blocked storage: alerts still work, reads just aren't remembered
  }
}
