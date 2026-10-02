import { createBrowserRouter } from "react-router";
import { AppShell } from "./shell/AppShell.tsx";
import { LivePage } from "./pages/Live.tsx";
import { SunPage } from "./pages/Sun.tsx";
import { ReplayPage } from "./pages/Replay.tsx";
import { EventsPage } from "./pages/Events.tsx";
import { EventDetailPage } from "./pages/EventDetail.tsx";
import { StatusPage } from "./pages/Status.tsx";

/** Routes from docs/design/frontend/README.md section 4. /guide is served statically, outside the SPA. */
export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <LivePage /> },
      { path: "/sun", element: <SunPage /> },
      { path: "/replay", element: <ReplayPage /> },
      { path: "/events", element: <EventsPage /> },
      { path: "/events/:kind/:id", element: <EventDetailPage /> },
      { path: "/status", element: <StatusPage /> },
    ],
  },
]);
