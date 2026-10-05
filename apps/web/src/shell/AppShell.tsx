import { Outlet } from "react-router";
import { useLiveStream } from "../stream/useLiveStream.ts";
import { AlertToaster } from "./AlertToaster.tsx";
import { TopBar } from "./TopBar.tsx";
import { useAlertDelivery } from "./useAlertDelivery.ts";

/** Wraps every route and owns the live stream and alert delivery (toasts, chime, notifications). */
export function AppShell() {
  const onAlert = useAlertDelivery();
  useLiveStream(onAlert);
  return (
    <div className="shell">
      <TopBar />
      <main className="page">
        <Outlet />
      </main>
      <AlertToaster />
    </div>
  );
}
