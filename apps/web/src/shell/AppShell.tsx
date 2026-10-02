import { Outlet } from "react-router";
import { useLiveStream } from "../stream/useLiveStream.ts";
import { TopBar } from "./TopBar.tsx";

/** Wraps every route and owns the live stream. ConnectionBadge, AlertBell, AlertToaster and ScaleToggle join later. */
export function AppShell() {
  useLiveStream();
  return (
    <div className="shell">
      <TopBar />
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
