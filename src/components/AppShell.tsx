import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Film, Images, LogOut, Upload, Workflow } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const nav = [
  { to: "/wizard", label: "Pipeline", icon: Workflow },
  { to: "/upload", label: "Upload", icon: Upload },
  { to: "/library", label: "Library", icon: Images },
  { to: "/videos", label: "Videos", icon: Film },
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
          <div className="h-7 w-7 rounded-md bg-primary" />
          <span className="font-display text-lg">Frame Vault</span>
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
        <div className="flex items-center justify-between border-b border-border px-4 py-3 md:hidden">
          <Link to="/" className="font-display">Frame Vault</Link>
          <div className="flex gap-2">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} className="rounded-md px-2 py-1 text-xs">
                {n.label}
              </Link>
            ))}
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
