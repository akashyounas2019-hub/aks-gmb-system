import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { BarChart3, CalendarDays, Film, Images, KeyRound, LogOut, PenSquare, Settings, Target, Upload, Workflow } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NotificationBell } from "@/components/NotificationBell";

const nav = [
  { to: "/wizard", label: "Pipeline", icon: Workflow },
  { to: "/upload", label: "Upload", icon: Upload },
  { to: "/library", label: "Library", icon: Images },
  { to: "/videos", label: "Videos", icon: Film },
  { to: "/keywords", label: "Keywords", icon: KeyRound },
  { to: "/gmb-analytics", label: "GMB Analytics", icon: BarChart3 },
  { to: "/competitors", label: "Competitors", icon: Target },
  { to: "/post-generator", label: "Post Generator", icon: PenSquare },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar p-4 md:flex">
        <Link to="/" className="mb-8 flex items-center gap-2">
          <img src="/favicon.png" alt="" width={28} height={28} className="h-7 w-7 rounded-md" />
          <span className="font-display text-lg">GMB Rank Pilot</span>
        </Link>
        <nav className="space-y-1">
          {nav.map((item) => {
            const active = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
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
        </nav>
        <button
          onClick={signOut}
          className="mt-auto flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <Link to="/" className="font-display md:hidden">GMB Rank Pilot</Link>
          <div className="hidden md:block" />
          <div className="flex items-center gap-2">
            <div className="flex gap-2 md:hidden">
              {nav.map((n) => (
                <Link key={n.to} to={n.to} className="rounded-md px-2 py-1 text-xs">
                  {n.label}
                </Link>
              ))}
            </div>
            <NotificationBell />
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
