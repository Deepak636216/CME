import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import type { Alert } from "@cme/shared";
import { alertHint, alertTarget, isFresh } from "../lib/alerts.ts";
import { serverNow } from "../lib/api.ts";
import { playChime, unlockAudio } from "../lib/chime.ts";
import { liveStore } from "../store/live.ts";
import { loadAcks, useAlerts } from "../store/alerts.ts";
import { useUi } from "../store/ui.ts";

export const notificationsSupported = () => typeof Notification !== "undefined";

/** "Show" on an alert: mark it read, then open the thing it is about (on the Live page) or the page that explains it. */
export function useShowAlert(): (a: Alert) => void {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return useCallback(
    (a: Alert) => {
      useAlerts.getState().ack([a.id]);
      const t = alertTarget(a, liveStore.getState().flares);
      if (!t) return;
      if ("path" in t) return void navigate(t.path);
      useUi.getState().select(t.select);
      if (pathname !== "/") navigate("/");
    },
    [navigate, pathname],
  );
}

/**
 * UF6: what happens when the stream brings a new alert. It pops up as a toast; if it was raised in the last
 * 30 minutes it also chimes (when sound is on) and, while the tab is in the background, shows a system
 * notification (when allowed). Older ones replayed after a long absence only pop up, quietly.
 */
export function useAlertDelivery(): (a: Alert) => void {
  const show = useShowAlert();
  const showRef = useRef(show);
  showRef.current = show;

  useEffect(() => {
    void loadAcks(() => liveStore.getState().alerts);
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true, capture: true });
    window.addEventListener("keydown", unlock, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
    };
  }, []);

  return useCallback((a: Alert) => {
    const alerts = useAlerts.getState();
    if (!alerts.receive(a)) return;
    const { clock, clockAt } = liveStore.getState();
    const now = clock ? serverNow(clock, clockAt) : Date.now() / 1000;
    if (!isFresh(a, now)) return;
    if (alerts.sound) playChime(a.level);
    const background = document.visibilityState === "hidden" || !document.hasFocus();
    if (alerts.notify && background && notificationsSupported() && Notification.permission === "granted") {
      try {
        const n = new Notification(a.title, { body: [a.message, alertHint(a)].filter(Boolean).join("\n"), tag: a.id });
        n.onclick = () => {
          window.focus();
          showRef.current(a);
          n.close();
        };
      } catch {
        // some mobile browsers only allow notifications from a service worker; the toast is still there
      }
    }
  }, []);
}
