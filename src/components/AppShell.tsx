import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Bell,
  Cable,
  CalendarDays,
  ChevronDown,

  Images,
  
  KeyRound,
  LayoutDashboard,
  LogOut,
  MapPin,
  Zap,
  Palette,
  PenSquare,
  Settings as SettingsIcon,
  ShieldCheck,
  Target,
  
  User,
  Users,
  Workflow,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NotificationBell } from "@/components/NotificationBell";

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }> };
type NavGroup = { label: string; items: NavItem[] };

const dashboardItem: NavItem = { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard };

const groups: NavGroup[] = [
  {
    label: "Workflow",
    items: [
      { to: "/automation", label: "Automation", icon: Zap },
      { to: "/wizard", label: "Pipeline", icon: Workflow },
      
      { to: "/library", label: "Image Library", icon: Images },
      { to: "/geotagging", label: "Geotagging", icon: MapPin },
    ],
  },
  {
    label: "Growth",
    items: [
      { to: "/keywords", label: "Keywords", icon: KeyRound },
      { to: "/gmb-analytics", label: "GMB Analytics", icon: BarChart3 },
      { to: "/competitors", label: "Competitors", icon: Target },
    ],
  },
  {
    label: "Content Writer",
    items: [
      { to: "/post-generator", label: "Post Generator", icon: PenSquare },
    ],
  },
  {
    label: "Social Accounts",
    items: [
      { to: "/social/facebook", label: "Facebook", icon: PenSquare },
      { to: "/social/instagram", label: "Instagram", icon: PenSquare },
    ],
  },
  {
    label: "Publishing",
    items: [
      { to: "/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
];

const settingsChildren: NavItem[] = [
  { to: "/settings/general", label: "General", icon: SettingsIcon },
  { to: "/settings/profile", label: "Profile", icon: User },
  { to: "/settings/integrations", label: "Integrations", icon: Cable },
  { to: "/settings/notifications", label: "Notifications", icon: Bell },
  { to: "/settings/appearance", label: "Appearance", icon: Palette },
  { to: "/settings/team", label: "Team", icon: Users },
  { to: "/settings/security", label: "Security", icon: ShieldCheck },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const settingsActive = location.pathname.startsWith("/settings");
  const [settingsOpen, setSettingsOpen] = useState(settingsActive);

  // Auto-open when navigating into settings from elsewhere
  useEffect(() => {
    if (settingsActive) setSettingsOpen(true);
  }, [settingsActive]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  const isActive = (to: string) =>
    location.pathname === to || location.pathname.startsWith(to + "/");

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
        {/* Brand */}
        <Link
          to="/"
          className="flex items-center gap-2 border-b border-border/60 px-4 py-4"
        >
          <img
            src="/favicon.png"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 rounded-md"
          />
          <span className="font-display text-lg">GMB Rank Pilot</span>
        </Link>

        {/* Nav */}
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4 text-sm">
          {/* Dashboard — pinned top */}
          <div>
            <Link
              to={dashboardItem.to}
              className={`flex items-center gap-3 rounded-md px-3 py-2 font-medium ${
                isActive(dashboardItem.to)
                  ? "bg-primary/15 text-primary"
                  : "text-foreground hover:bg-accent"
              }`}
            >
              <dashboardItem.icon className="h-4 w-4" />
              {dashboardItem.label}
            </Link>
          </div>

          {/* Grouped modules */}
          {groups.map((g) => (
            <div key={g.label}>
              <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {g.label}
              </div>
              <div className="space-y-0.5">
                {g.items.map((item) => {
                  const active = isActive(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`flex items-center gap-3 rounded-md px-3 py-2 ${
                        active
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
          {/* Settings — in main nav, click label to open main settings, chevron to expand */}
          <div>
            <div
              className={`flex items-center rounded-md ${
                settingsActive ? "bg-primary/15 text-primary" : "text-muted-foreground"
              }`}
            >
              <Link
                to="/settings/general"
                className={`flex flex-1 items-center gap-3 rounded-md px-3 py-2 text-sm ${
                  settingsActive
                    ? "text-primary"
                    : "hover:bg-accent hover:text-foreground"
                }`}
              >
                <SettingsIcon className="h-4 w-4" />
                Settings
              </Link>
              <button
                type="button"
                onClick={() => setSettingsOpen((v) => !v)}
                aria-expanded={settingsOpen}
                aria-controls="sidebar-settings-submenu"
                aria-label={settingsOpen ? "Collapse settings" : "Expand settings"}
                className={`mr-1 grid h-8 w-8 place-items-center rounded-md ${
                  settingsActive
                    ? "text-primary hover:bg-primary/10"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${
                    settingsOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
            </div>

            {settingsOpen && (
              <div
                id="sidebar-settings-submenu"
                className="mt-1 space-y-0.5 border-l border-border/60 pl-2"
              >
                {settingsChildren.map((s) => {
                  const active = isActive(s.to);
                  return (
                    <Link
                      key={s.to}
                      to={s.to}
                      className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs ${
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      <s.icon className="h-3.5 w-3.5" />
                      {s.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        {/* Sticky footer — Sign Out only */}
        <div className="border-t border-border/60 px-3 py-3">
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <Link to="/" className="font-display md:hidden">
            GMB Rank Pilot
          </Link>
          <div className="hidden md:block" />
          <div className="flex items-center gap-2">
            <NotificationBell />
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
