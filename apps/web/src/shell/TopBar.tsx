import { NavLink } from "react-router";
import { ConnectionBadge } from "./ConnectionBadge.tsx";
import { FreshnessBadge } from "./FreshnessBadge.tsx";

const links = [
  { to: "/", label: "Live" },
  { to: "/sun", label: "Sun" },
  { to: "/replay", label: "Replay" },
  { to: "/events", label: "Events" },
  { to: "/status", label: "Status" },
];

export function TopBar() {
  return (
    <header className="topbar">
      <span className="brand">☀ Sun → Earth</span>
      <nav>
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.to === "/"}>
            {l.label}
          </NavLink>
        ))}
      </nav>
      <div className="badges">
        <FreshnessBadge />
        <ConnectionBadge />
      </div>
    </header>
  );
}
