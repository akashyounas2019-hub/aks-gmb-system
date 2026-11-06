import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Star,
  ArrowLeft,
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
import { GlobalUploadQueue } from "@/components/GlobalUploadQueue";
import { getPreferences, saveSidebarFavorites } from "@/lib/user-preferences.functions";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
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
    label: "Google My Business",
    items: [
      { to: "/gmb-analytics", label: "GMB Analytics", icon: BarChart3 },
      { to: "/post-generator", label: "Post Generator", icon: PenSquare },
      { to: "/scheduler", label: "Scheduler", icon: CalendarDays },
      { to: "/geotagging", label: "Geo-tagging", icon: MapPin },
      { to: "/library", label: "Library", icon: Images },
      { to: "/backups", label: "Backups", icon: ShieldCheck },
    ],
  },
  {
    label: "Video Tools",
    items: [
      { to: "/video-converter", label: "Video Converter", icon: FileVideo },
      { to: "/video-compress", label: "Compress & Crop", icon: Scissors },
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

const settingsLabel = (item: NavItem) =>
  item.to.startsWith("/settings/") ? `Settings · ${item.label}` : item.label;

const allNavItems: NavItem[] = [
  ...navGroups.flatMap((g) => g.items),
  ...settingsChildren.map((s) => ({ ...s, label: settingsLabel(s) })),
];
const navItemByPath = new Map(allNavItems.map((i) => [i.to, i]));

const FAVORITES_CACHE_KEY = "sidebar_favorites_v1";

function readCachedFavorites(): string[] {
  try {
    const raw = window.localStorage.getItem(FAVORITES_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p === "string") : [];
  } catch {
    return [];
  }
}

function writeCachedFavorites(list: string[]) {
  try {
    window.localStorage.setItem(FAVORITES_CACHE_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable — server copy is still the source of truth */
  }
}

/**
 * Sidebar favourites: ordered list of route paths, cached locally for an
 * instant first paint and synced to `user_preferences.appearance` so the
 * list follows the user across browsers/devices.
 */
function useSidebarFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const loadPrefs = useServerFn(getPreferences);
  const saveFavs = useServerFn(saveSidebarFavorites);

  useEffect(() => {
    setFavorites(readCachedFavorites());
    let cancelled = false;
    loadPrefs()
      .then((p) => {
        const remote = (p.appearance as Record<string, unknown> | null)?.sidebarFavorites;
        if (cancelled || !Array.isArray(remote)) return;
        const list = remote.filter((x): x is string => typeof x === "string");
        setFavorites(list);
        writeCachedFavorites(list);
      })
      .catch(() => {
        /* offline / not signed in yet — keep the cached list */
      });
    return () => {
      cancelled = true;
    };
  }, [loadPrefs]);

  const toggle = useCallback(
    (path: string) => {
      const next = favorites.includes(path)
        ? favorites.filter((p) => p !== path)
        : [...favorites, path];
      setFavorites(next);
      writeCachedFavorites(next);
      saveFavs({ data: { favorites: next } }).catch(() => {
        /* cached locally; will be re-sent on the next toggle */
      });
    },
    [favorites, saveFavs],
  );

  return { favorites, toggle };
}

function FavoriteToggle({
  active,
  label,
  onToggle,
  small = false,
}: {
  active: boolean;
  label: string;
  onToggle: () => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={active}
      aria-label={active ? `Remove ${label} from favourites` : `Add ${label} to favourites`}
      title={active ? "Remove from favourites" : "Add to favourites"}
      className={`absolute right-1.5 top-1/2 grid -translate-y-1/2 place-items-center rounded-md transition-all hover:bg-accent focus-visible:opacity-100 ${
        small ? "h-6 w-6" : "h-7 w-7"
      } ${
        active
          ? "text-amber-400 opacity-100"
          : "text-muted-foreground opacity-0 hover:text-amber-400 group-hover:opacity-100"
      }`}
    >
      <Star className={`${small ? "h-3 w-3" : "h-3.5 w-3.5"} ${active ? "fill-current" : ""}`} />
    </button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const settingsActive = location.pathname.startsWith("/settings");
  const [settingsOpen, setSettingsOpen] = useState(settingsActive);
  const { favorites, toggle: toggleFavorite } = useSidebarFavorites();

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const favoriteItems = useMemo(
    () => favorites.map((p) => navItemByPath.get(p)).filter((i): i is NavItem => Boolean(i)),
    [favorites],
  );
  // Favourited modules move to the top section, so drop them from their
  // original group (and hide any group left empty).
  const visibleGroups = useMemo(
    () =>
      navGroups
        .map((g) => ({ ...g, items: g.items.filter((i) => !favoriteSet.has(i.to)) }))
        .filter((g) => g.items.length > 0),
    [favoriteSet],
  );

  useEffect(() => {
    if (settingsActive) setSettingsOpen(true);
  }, [settingsActive]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  const isItemActive = (item: NavItem) => {
    return item.exact
      ? location.pathname === item.to
      : location.pathname === item.to || location.pathname.startsWith(item.to + "/");
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* Global header */}
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
            <span className="font-display text-sm tracking-tight md:text-base">GMB Rank Pilot</span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
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
                <Link
                  to="/dashboard"
                  className="group mb-3 flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:bg-accent/60 hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4 shrink-0" />
                  Back
                </Link>
                <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                  Settings
                </div>
                <div className="space-y-0.5">
                  {settingsChildren.map((s) => {
                    const active =
                      location.pathname === s.to || location.pathname.startsWith(s.to + "/");
                    return (
                      <div key={s.to} className="group relative">
                        <Link
                          to={s.to}
                          className={`relative flex items-center gap-3 rounded-lg py-2 pl-3 pr-9 transition-all ${
                            active
                              ? "bg-primary/15 text-primary shadow-[inset_2px_0_0_0] shadow-primary"
                              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                          }`}
                        >
                          <s.icon className="h-4 w-4 shrink-0" />
                          {s.label}
                        </Link>
                        <FavoriteToggle
                          active={favoriteSet.has(s.to)}
                          label={s.label}
                          onToggle={() => toggleFavorite(s.to)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <>
                {favoriteItems.length > 0 && (
                  <NavSection
                    label="Favourites"
                    labelIcon
                    items={favoriteItems}
                    isActive={isItemActive}
                    favoriteSet={favoriteSet}
                    onToggleFavorite={toggleFavorite}
                  />
                )}
                {visibleGroups.map((g) => (
                  <NavSection
                    key={g.label}
                    label={g.label}
                    items={g.items}
                    isActive={isItemActive}
                    favoriteSet={favoriteSet}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </>
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
                      <div key={s.to} className="group relative">
                        <Link
                          to={s.to}
                          className="flex items-center gap-2 rounded-md py-1.5 pl-3 pr-8 text-xs text-muted-foreground transition-all hover:bg-accent/60 hover:text-foreground"
                        >
                          <s.icon className="h-3.5 w-3.5 shrink-0" />
                          {s.label}
                        </Link>
                        <FavoriteToggle
                          small
                          active={favoriteSet.has(s.to)}
                          label={s.label}
                          onToggle={() => toggleFavorite(s.to)}
                        />
                      </div>
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

function NavSection({
  label,
  labelIcon = false,
  items,
  isActive,
  favoriteSet,
  onToggleFavorite,
}: {
  label: string;
  labelIcon?: boolean;
  items: NavItem[];
  isActive: (item: NavItem) => boolean;
  favoriteSet: Set<string>;
  onToggleFavorite: (path: string) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
        {labelIcon && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
        {label}
      </div>
      <div className="space-y-0.5">
        {items.map((item) => {
          const active = isActive(item);
          return (
            <div key={`${item.to}-${item.label}`} className="group relative">
              <Link
                to={item.to}
                className={`relative flex items-center gap-3 rounded-lg py-2 pl-3 pr-9 transition-all ${
                  active
                    ? "bg-primary/15 text-primary shadow-[inset_2px_0_0_0] shadow-primary"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                }`}
              >
                <item.icon
                  className={`h-4 w-4 shrink-0 transition-colors ${
                    active ? "" : "group-hover:text-foreground"
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </Link>
              <FavoriteToggle
                active={favoriteSet.has(item.to)}
                label={item.label}
                onToggle={() => onToggleFavorite(item.to)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
