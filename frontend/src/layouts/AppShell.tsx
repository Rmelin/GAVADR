import { useState, type ComponentType, type SVGProps } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useCurrentUser, useLogout } from "../hooks/useAuth";
import { primaryRole, roleLabel, type Role } from "../types/auth";
import { Brand } from "../components/Brand";
import { ThemeToggle } from "../components/ThemeToggle";
import { AlertIcon, CalendarIcon, CheckIcon, ExitIcon, GridIcon, HistoryIcon, MapIcon, MenuIcon, MessageIcon, ToolIcon, UsersIcon } from "../components/Icons";
import { useAppSettings } from "../hooks/useAppSettings";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
interface NavItem { label: string; to: string; icon: Icon; roles?: Role[] }

const navItems: NavItem[] = [
  { label: "Overblik", to: "/", icon: GridIcon },
  { label: "Ledningskort", to: "/kort", icon: MapIcon },
  { label: "Lukkescenarier", to: "/lukkescenarier", icon: ToolIcon, roles: ["admin", "map_manager"] },
  { label: "Events", to: "/haendelser", icon: AlertIcon },
  { label: "Vandlukninger", to: "/vandlukninger", icon: CalendarIcon },
  { label: "Historik", to: "/historik", icon: HistoryIcon },
  { label: "Henvendelser", to: "/henvendelser", icon: MessageIcon },
  { label: "Kortrettelser", to: "/kortrettelser", icon: ToolIcon },
  { label: "Opgaver", to: "/opgaver", icon: CheckIcon },
  { label: "Brugere", to: "/brugere", icon: UsersIcon, roles: ["admin"] },
  { label: "App-indstillinger", to: "/indstillinger", icon: ToolIcon, roles: ["admin"] },
];

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const { data: appSettings } = useAppSettings();
  const navigate = useNavigate();
  const roles = user?.roles ?? ["reader"];
  const visibleItems = navItems.filter((item) => !item.roles || item.roles.some((role) => roles.includes(role)));
  const initials = user?.display_name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "GV";

  async function handleLogout() {
    await logout.mutateAsync();
    navigate("/login", { replace: true });
  }

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Gå til indhold</a>
    <aside className={`sidebar ${menuOpen ? "sidebar--open" : ""}`} aria-label="Primær navigation">
      <div className="sidebar__top"><Brand /><button type="button" className="sidebar__close" onClick={() => setMenuOpen(false)} aria-label="Luk menu">×</button></div>
      <nav className="nav-list">
        <span className="nav-label">Driftssystem</span>
        {visibleItems.map(({ label, to, icon: NavIcon }) => <NavLink key={to} to={to} end={to === "/"} onClick={() => setMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? "nav-link--active" : ""}`}>
          <NavIcon /><span>{label}</span>
        </NavLink>)}
      </nav>
      <div className="sidebar__status"><span className="status-dot" /><div><strong>System i drift</strong><small>Senest kontrolleret nu</small></div></div>
    </aside>
    {menuOpen && <button className="sidebar-backdrop" type="button" aria-label="Luk menu" onClick={() => setMenuOpen(false)} />}
    <section className="app-column">
      <header className="topbar">
        <button type="button" className="icon-button menu-button" onClick={() => setMenuOpen(true)} aria-label="Åbn menu"><MenuIcon /></button>
        <div className="topbar__context"><span className="eyebrow">{appSettings.organization_name}</span><strong>{appSettings.organization_locality || "Ledningsnet & drift"}</strong></div>
        <div className="topbar__actions">
          <ThemeToggle />
          <div className="user-badge"><span className="avatar">{initials}</span><span className="user-badge__text"><strong>{user?.display_name}</strong><small>{roleLabel(primaryRole(user))}</small></span></div>
          <button className="icon-button" type="button" onClick={handleLogout} disabled={logout.isPending} aria-label="Log ud" title="Log ud"><ExitIcon /></button>
        </div>
      </header>
      <main id="main-content" className="main-content"><Outlet /></main>
    </section>
  </div>;
}
