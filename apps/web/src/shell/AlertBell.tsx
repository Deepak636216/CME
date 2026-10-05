import { useEffect, useMemo, useRef, useState } from "react";
import { alertHint, alertList, alertTarget, isActive, unread } from "../lib/alerts.ts";
import { useServerNow } from "../lib/clock.ts";
import { formatDuration } from "../lib/travel.ts";
import { useAlerts } from "../store/alerts.ts";
import { useLive } from "../store/live.ts";
import { AlertIcon, levelLabel } from "./AlertIcon.tsx";
import { notificationsSupported, useShowAlert } from "./useAlertDelivery.ts";

const BASE_TITLE = typeof document === "undefined" ? "" : document.title;

/** The bell in the top bar: how many alerts are unread, and the list of active and recent ones with settings. */
export function AlertBell() {
  const alerts = useLive((s) => s.alerts);
  const acked = useAlerts((s) => s.acked);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const count = useMemo(() => unread(alerts, acked).length, [alerts, acked]);
  const warning = useMemo(() => unread(alerts, acked).some((a) => a.level === "warning"), [alerts, acked]);

  useEffect(() => {
    document.title = count ? `(${count}) ${BASE_TITLE}` : BASE_TITLE;
  }, [count]);

  // Opening the list counts as reading everything in it.
  useEffect(() => {
    if (!open) return;
    useAlerts.getState().ack(unread(alerts, useAlerts.getState().acked).map((a) => a.id));
  }, [open, alerts]);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const click = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", key);
    window.addEventListener("pointerdown", click);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("pointerdown", click);
    };
  }, [open]);

  return (
    <div className="bell-wrap" ref={wrap}>
      <button
        type="button"
        className="bell"
        data-unread={count > 0 ? (warning ? "warning" : "watch") : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={count ? `Alerts, ${count} unread` : "Alerts"}
        onClick={() => setOpen(!open)}
      >
        <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 11V7a4 4 0 0 1 8 0v4l1.5 1.5h-11ZM6.5 14h3" />
        </svg>
        {count ? <span className="bell-count" aria-hidden>{count > 9 ? "9+" : count}</span> : null}
      </button>
      {open ? <BellPanel close={() => setOpen(false)} /> : null}
    </div>
  );
}

function BellPanel({ close }: { close: () => void }) {
  const alerts = useLive((s) => s.alerts);
  const flares = useLive((s) => s.flares);
  const now = useServerNow() ?? Date.now() / 1000;
  const show = useShowAlert();
  const list = alertList(alerts, now);

  return (
    <div className="bell-panel" role="dialog" aria-label="Alerts">
      <header>
        <h2>Alerts</h2>
        <span className="muted">active and last 24 h</span>
      </header>
      {list.length ? (
        <ul className="bell-list">
          {list.map((a) => {
            const target = alertTarget(a, flares);
            return (
              <li key={a.id} data-level={a.rule === "TEST" ? "test" : a.level} data-active={isActive(a)}>
                <span className="toast-icon"><AlertIcon a={a} /></span>
                <div>
                  <div className="toast-kicker">
                    {levelLabel(a)} · {formatDuration(Math.max(0, now - a.raisedAt))} ago
                  </div>
                  <strong>{a.title}</strong>
                  <p className="toast-msg">{a.message}</p>
                  {isActive(a) && alertHint(a) ? <p className="toast-hint">{alertHint(a)}</p> : null}
                  {target ? (
                    <button type="button" className="link-btn" onClick={() => { show(a); close(); }}>
                      {"path" in target ? "See data status" : "Show me"}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="bell-empty">
          No alerts in the last 24 hours. You'll get one for M- and X-class flares, CMEs heading for Earth, strongly
          southward Bz at L1, and data feeds that stop updating.
        </p>
      )}
      <Settings />
    </div>
  );
}

function Settings() {
  const sound = useAlerts((s) => s.sound);
  const notify = useAlerts((s) => s.notify);
  const supported = notificationsSupported();
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(supported ? Notification.permission : "unsupported");

  const toggleNotify = async (on: boolean) => {
    if (!on) return useAlerts.getState().setNotify(false);
    let p = perm;
    if (p === "default") p = await Notification.requestPermission().catch(() => "denied" as const);
    setPerm(p);
    useAlerts.getState().setNotify(p === "granted");
  };

  return (
    <footer className="bell-settings">
      <label>
        <input type="checkbox" checked={sound} onChange={(e) => useAlerts.getState().setSound(e.target.checked)} />
        Play a sound
      </label>
      <label>
        <input
          type="checkbox"
          checked={notify && perm === "granted"}
          disabled={perm === "unsupported" || perm === "denied"}
          onChange={(e) => void toggleNotify(e.target.checked)}
        />
        Notify me when this tab is in the background
      </label>
      {perm === "denied" ? <p className="muted">Notifications are blocked for this site in your browser's settings.</p> : null}
      {perm === "unsupported" ? <p className="muted">This browser can't show notifications from a page.</p> : null}
    </footer>
  );
}
