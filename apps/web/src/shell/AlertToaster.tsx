import { useEffect, useRef, useState } from "react";
import type { Alert } from "@cme/shared";
import { alertHint, alertTarget, WATCH_TOAST_MS } from "../lib/alerts.ts";
import { liveStore } from "../store/live.ts";
import { useAlerts } from "../store/alerts.ts";
import { AlertIcon, levelLabel } from "./AlertIcon.tsx";
import { useShowAlert } from "./useAlertDelivery.ts";

const hhmm = (t: number) => new Date(t * 1000).toISOString().slice(11, 16);

/** New alerts pop up top-right, on every page (UF6). Warnings stay until dismissed; watches tuck into the bell. */
export function AlertToaster() {
  const toasts = useAlerts((s) => s.toasts);
  return (
    <div className="toaster" role="region" aria-label="New alerts">
      {toasts.map((a) => (
        <Toast key={a.id} a={a} />
      ))}
    </div>
  );
}

function Toast({ a }: { a: Alert }) {
  const show = useShowAlert();
  const [held, setHeld] = useState(false); // hovered or focused: don't tuck away while being read
  const ref = useRef<HTMLDivElement>(null);
  const target = alertTarget(a, liveStore.getState().flares);

  useEffect(() => {
    if (a.level === "warning" || held) return;
    const t = setTimeout(() => useAlerts.getState().hide(a.id), WATCH_TOAST_MS);
    return () => clearTimeout(t);
  }, [a, held]);

  return (
    <div
      ref={ref}
      className="toast"
      data-level={a.rule === "TEST" ? "test" : a.level}
      role={a.level === "warning" ? "alert" : "status"}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => !ref.current?.contains(e.relatedTarget as Node) && setHeld(false)}
    >
      <span className="toast-icon"><AlertIcon a={a} size={18} /></span>
      <div className="toast-body">
        <div className="toast-kicker">{levelLabel(a)} · {hhmm(a.raisedAt)} UTC</div>
        <strong className="toast-title">{a.title}</strong>
        <p className="toast-msg">{a.message}</p>
        {alertHint(a) ? <p className="toast-hint">{alertHint(a)}</p> : null}
        <div className="toast-actions">
          {target ? (
            <button type="button" className="primary" onClick={() => show(a)}>
              {"path" in target ? "See data status" : "Show me"}
            </button>
          ) : null}
          <button type="button" onClick={() => useAlerts.getState().ack([a.id])}>Dismiss</button>
        </div>
      </div>
    </div>
  );
}
