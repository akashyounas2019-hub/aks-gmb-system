import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  Upload,
  Sparkles,
  Wand2,
  Facebook,
  Instagram,
  Linkedin,
  LayoutGrid,
  Building2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NotificationBell } from "@/components/NotificationBell";
import { GlobalUploadQueue } from "@/components/GlobalUploadQueue";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  search?: Record<string, string>;
  exact?: boolean;
};
type NavGroup = { label: string; items: NavItem[] };
type Workspace = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  landing: string;
  match: (path: string) => boolean;
  groups: NavGroup[];
};

const workspaces: Workspace[] = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutGrid,
    landing: "/dashboard",
    match: (p) =>
      p === "/" ||
      p.startsWith("/dashboard") ||
      p.startsWith("/automation") ||
      p.startsWith("/agents") ||
      p.startsWith("/keywords") ||
      p.startsWith("/competitors") ||
      p.startsWith("/video-converter") ||
      p.startsWith("/video-compress") ||
      p.startsWith("/wizard") ||
      p.startsWith("/upload") ||
      p.startsWith("/videos") ||
      p.startsWith("/resources"),
    groups: [
      {
        label: "Home",
        items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
      },
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
    ],
  },
  {
    id: "gmb",
    label: "GMB",
    icon: Building2,
    landing: "/gmb-analytics",
    match: (p) =>
      p.startsWith("/gmb-analytics") ||
      p.startsWith("/post-generator") ||
      p.startsWith("/geotagging") ||
      p.startsWith("/library") ||
      p.startsWith("/calendar") ||
      p.startsWith("/backups"),
    groups: [
      {
        label: "Google My Business",
        items: [
          { to: "/gmb-analytics", label: "GMB Analytics", icon: BarChart3 },
          { to: "/post-generator", label: "Post Generator", icon: PenSquare },
          { to: "/geotagging", label: "Geo-tagging", icon: MapPin },
          { to: "/library", label: "Image and Video Library", icon: Images },
          { to: "/calendar", label: "Calendar", icon: CalendarDays },
          { to: "/backups", label: "Backups", icon: ShieldCheck },
        ],
      },
    ],
  },
  {
    id: "facebook",
    label: "Facebook",
    icon: Facebook,
    landing: "/social/facebook",
    match: (p) => p.startsWith("/social/facebook"),
    groups: [
      {
        label: "Facebook",
        items: [
          {
            to: "/social/facebook",
            label: "Upload",
            icon: Upload,
            search: { tab: "upload" },
            exact: true,
          },
          {
            to: "/social/facebook",
            label: "Image Library",
            icon: Images,
            search: { tab: "library" },
            exact: true,
          },
          {
            to: "/social/facebook",
            label: "Post Generator",
            icon: PenSquare,
            search: { tab: "compose" },
            exact: true,
          },
          {
            to: "/social/facebook",
            label: "Calendar",
            icon: CalendarDays,
            search: { tab: "calendar" },
            exact: true,
          },
          {
            to: "/social/facebook",
            label: "AI Image Prompts",
            icon: Wand2,
            search: { tab: "ai-prompts" },
            exact: true,
          },
          {
            to: "/social/facebook/ad-creatives",
            label: "Ad Creatives",
            icon: Sparkles,
          },
        ],
      },
    ],
  },
  {
    id: "instagram",
    label: "Instagram",
    icon: Instagram,
    landing: "/social/instagram",
    match: (p) => p.startsWith("/social/instagram"),
    groups: [
      {
        label: "Instagram",
        items: [
          {
            to: "/social/instagram",
            label: "Upload",
            icon: Upload,
            search: { tab: "upload" },
            exact: true,
          },
          {
            to: "/social/instagram",
            label: "Image Library",
            icon: Images,
            search: { tab: "library" },
            exact: true,
          },
          {
            to: "/social/instagram",
            label: "Post Generator",
            icon: PenSquare,
            search: { tab: "compose" },
            exact: true,
          },
          {
            to: "/social/instagram",
            label: "Calendar",
            icon: CalendarDays,
            search: { tab: "calendar" },
            exact: true,
          },
        ],
      },
    ],
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: Linkedin,
    landing: "/social/linkedin",
    match: (p) => p.startsWith("/social/linkedin"),
    groups: [
      {
        label: "LinkedIn",
        items: [
          {
            to: "/social/linkedin",
            label: "Upload",
            icon: Upload,
            search: { tab: "upload" },
            exact: true,
          },
          {
            to: "/social/linkedin",
            label: "Image Library",
            icon: Images,
            search: { tab: "library" },
            exact: true,
          },
          {
            to: "/social/linkedin",
            label: "Post Generator",
            icon: PenSquare,
            search: { tab: "compose" },
            exact: true,
          },
          {
            to: "/social/linkedin",
            label: "Calendar",
            icon: CalendarDays,
            search: { tab: "calendar" },
            exact: true,
          },
        ],
      },
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

  useEffect(() => {
    if (settingsActive) setSettingsOpen(true);
  }, [settingsActive]);

  const activeWorkspace = useMemo(() => {
    if (settingsActive) return null;
    return (
      workspaces.find((w) => w.match(location.pathname)) ?? workspaces[0]
    );
  }, [location.pathname, settingsActive]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  const currentTab =
    typeof location.search === "object" && location.search
      ? (location.search as Record<string, unknown>).tab
      : undefined;

  const isItemActive = (item: NavItem) => {
    const pathMatch = item.exact
      ? location.pathname === item.to
      : location.pathname === item.to ||
        location.pathname.startsWith(item.to + "/");
    if (!pathMatch) return false;
    if (item.search?.tab) return currentTab === item.search.tab;
    // If the item has no search but a sibling item on the same path uses search,
    // treat this item active only when no tab is set. Simpler: match if pathMatch.
    return true;
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* Global header with workspace tabs */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
        <div className="flex items-center gap-3 px-4 py-2">
          <Link to="/" className="flex items-center gap-2">
            <img
              src="/favicon.png"
              alt=""
              width={24}
              height={24}
              className="h-6 w-6 rounded-md ring-1 ring-border/40"
            />
            <span className="font-display text-sm tracking-tight md:text-base">
              GMB Rank Pilot
            </span>
          </Link>

          <nav
            role="tablist"
            aria-label="Workspaces"
            className="ml-2 flex flex-1 items-center gap-1 overflow-x-auto"
          >
            {workspaces.map((w) => {
              const active = activeWorkspace?.id === w.id;
              return (
                <Link
                  key={w.id}
                  to={w.landing}
                  role="tab"
                  aria-selected={active}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  }`}
                >
                  <w.icon className="h-3.5 w-3.5" />
                  {w.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              to="/resources"
              className="hidden items-center gap-1.5 rounded-md border border-border/70 bg-card/60 px-3 py-1.5 text-xs font-medium text-foreground/90 shadow-sm transition-all hover:border-primary/40 hover:bg-accent hover:text-foreground sm:inline-flex"
              title="Open Resources"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Resources
            </Link>
            <NotificationBell />
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border/60 bg-sidebar md:flex">
          <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5 text-sm">
            {settingsActive ? (
              <div>
                <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                  Settings
                </div>
                <div className="space-y-0.5">
                  {settingsChildren.map((s) => {
                    const active =
                      location.pathname === s.to ||
                      location.pathname.startsWith(s.to + "/");
                    return (
                      <Link
                        key={s.to}
                        to={s.to}
                        className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                          active
                            ? "bg-primary/15 text-primary shadow-[inset_2px_0_0_0] shadow-primary"
                            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground hover:translate-x-0.5"
                        }`}
                      >
                        <s.icon className="h-4 w-4 shrink-0" />
                        {s.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : (
              activeWorkspace?.groups.map((g) => (
                <div key={g.label}>
                  <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                    {g.label}
                  </div>
                  <div className="space-y-0.5">
                    {g.items.map((item) => {
                      const active = isItemActive(item);
                      return (
                        <Link
                          key={`${item.to}-${item.label}`}
                          to={item.to}
                          search={item.search as never}
                          className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                            active
                              ? "bg-primary/15 text-primary shadow-[inset_2px_0_0_0] shadow-primary"
                              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground hover:translate-x-0.5"
                          }`}
                        >
                          <item.icon
                            className={`h-4 w-4 shrink-0 transition-colors ${
                              active ? "" : "group-hover:text-foreground"
                            }`}
                          />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))
            )}

            {!settingsActive && (
              <div>
                <div
                  className={`flex items-center rounded-lg transition-colors ${
                    settingsActive
                      ? "bg-primary/15 text-primary shadow-[inset_2px_0_0_0] shadow-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  <Link
                    to="/settings/general"
                    className="flex flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all hover:bg-accent/60 hover:text-foreground hover:translate-x-0.5"
                  >
                    <SettingsIcon className="h-4 w-4 shrink-0" />
                    Settings
                  </Link>
                  <button
                    type="button"
                    onClick={() => setSettingsOpen((v) => !v)}
                    aria-expanded={settingsOpen}
                    aria-label={settingsOpen ? "Collapse settings" : "Expand settings"}
                    className="mr-1 grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <ChevronDown
                      className={`h-4 w-4 transition-transform duration-200 ${
                        settingsOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                </div>

                {settingsOpen && (
                  <div className="mt-1 space-y-0.5 border-l border-border/60 pl-2">
                    {settingsChildren.map((s) => (
                      <Link
                        key={s.to}
                        to={s.to}
                        className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-all hover:bg-accent/60 hover:text-foreground hover:translate-x-0.5"
                      >
                        <s.icon className="h-3.5 w-3.5 shrink-0" />
                        {s.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </nav>

          <div className="border-t border-border/60 px-3 py-3">
            <button
              onClick={signOut}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <GlobalUploadQueue />
    </div>
  );
}
