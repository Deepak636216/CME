import { Outlet } from "react-router";
import { TopBar } from "./TopBar.tsx";

/** Wraps every route. ConnectionBadge, AlertBell, AlertToaster and ScaleToggle join in later steps. */
export function AppShell() {
  return (
    <div className="shell">
      <TopBar />
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
