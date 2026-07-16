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
  BookOpen,
  User,
  Users,
  Bot,
  FileVideo,
  Scissors,
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
      { to: "/agents", label: "Agents", icon: Bot },
    ],
  },
  {
    label: "Growth",
    items: [
      { to: "/keywords", label: "Keywords", icon: KeyRound },
      { to: "/competitors", label: "Competitors", icon: Target },
    ],
  },
  {
    label: "Video Tools",
    items: [
      { to: "/video-converter", label: "Video Converter", icon: FileVideo },
      { to: "/video-compress", label: "Compress & Crop", icon: Scissors },
    ],
  },
  {
    label: "Google My Business",
    items: [
      { to: "/post-generator", label: "GMB Post Generator", icon: PenSquare },
      { to: "/gmb-analytics", label: "GMB Analytics", icon: BarChart3 },
      { to: "/geotagging", label: "Geo-tagging", icon: MapPin },
      { to: "/library", label: "Image Library", icon: Images },
      { to: "/calendar", label: "GMB Calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Social Accounts",
    items: [
      { to: "/social/facebook", label: "Facebook", icon: PenSquare },
      { to: "/social/instagram", label: "Instagram", icon: PenSquare },
      { to: "/social/linkedin", label: "LinkedIn", icon: PenSquare },
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
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border/60 bg-sidebar md:flex">
        {/* Brand */}
        <Link
          to="/"
          className="group flex items-center gap-2.5 border-b border-border/60 px-5 py-4 transition-colors hover:bg-accent/40"
        >
          <img
            src="/favicon.png"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 rounded-md ring-1 ring-border/40 transition-transform group-hover:scale-105"
          />
          <span className="font-display text-lg tracking-tight">GMB Rank Pilot</span>
        </Link>

        {/* Nav */}
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5 text-sm">
          {/* Dashboard — pinned top */}
          <div>
            <Link
              to={dashboardItem.to}
              className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 font-medium transition-all ${
                isActive(dashboardItem.to)
                  ? "bg-primary/15 text-primary shadow-[inset_2px_0_0_0] shadow-primary"
                  : "text-foreground hover:bg-accent/60 hover:translate-x-0.5"
              }`}
            >
              <dashboardItem.icon className="h-4 w-4 shrink-0" />
              {dashboardItem.label}
            </Link>
          </div>

          {/* Grouped modules */}
          {groups.map((g) => (
            <div key={g.label}>
              <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                {g.label}
              </div>
              <div className="space-y-0.5">
                {g.items.map((item) => {
                  const active = isActive(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                        active
                          ? "bg-primary/15 text-primary shadow-[inset_2px_0_0_0] shadow-primary"
                          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground hover:translate-x-0.5"
                      }`}
                    >
                      <item.icon className={`h-4 w-4 shrink-0 transition-colors ${active ? "" : "group-hover:text-foreground"}`} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Settings */}
          <div>
            <div
              className={`flex items-center rounded-lg transition-colors ${
                settingsActive ? "bg-primary/15 text-primary shadow-[inset_2px_0_0_0] shadow-primary" : "text-muted-foreground"
              }`}
            >
              <Link
                to="/settings/general"
                className={`flex flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${
                  settingsActive
                    ? "text-primary"
                    : "hover:bg-accent/60 hover:text-foreground hover:translate-x-0.5"
                }`}
              >
                <SettingsIcon className="h-4 w-4 shrink-0" />
                Settings
              </Link>
              <button
                type="button"
                onClick={() => setSettingsOpen((v) => !v)}
                aria-expanded={settingsOpen}
                aria-controls="sidebar-settings-submenu"
                aria-label={settingsOpen ? "Collapse settings" : "Expand settings"}
                className={`mr-1 grid h-8 w-8 place-items-center rounded-md transition-colors ${
                  settingsActive
                    ? "text-primary hover:bg-primary/10"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-200 ${
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
                      className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-all ${
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground hover:translate-x-0.5"
                      }`}
                    >
                      <s.icon className="h-3.5 w-3.5 shrink-0" />
                      {s.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        {/* Sticky footer */}
        <div className="border-t border-border/60 px-3 py-3">
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
          <Link to="/" className="font-display text-base tracking-tight md:hidden">
            GMB Rank Pilot
          </Link>
          <div className="hidden md:block" />
          <div className="flex items-center gap-2">
            <Link
              to="/resources"
              className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card/60 px-3 py-1.5 text-xs font-medium text-foreground/90 shadow-sm transition-all hover:border-primary/40 hover:bg-accent hover:text-foreground"
              title="Open Resources"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Resources
            </Link>
            <NotificationBell />
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

