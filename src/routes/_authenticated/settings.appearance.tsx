import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/appearance")({
  component: AppearanceSettings,
});

const KEY = "settings_theme_v1";
type Theme = "system" | "light" | "dark";

function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
}

function AppearanceSettings() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    const raw = typeof window !== "undefined" ? (localStorage.getItem(KEY) as Theme | null) : null;
    if (raw) setTheme(raw);
  }, []);
  function choose(t: Theme) {
    setTheme(t);
    localStorage.setItem(KEY, t);
    applyTheme(t);
    toast.success(`Theme set to ${t}`);
  }
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Appearance</h2>
        <p className="mt-1 text-sm text-muted-foreground">Choose how the app looks on this device.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {(["system", "light", "dark"] as Theme[]).map((t) => (
          <button
            key={t}
            onClick={() => choose(t)}
            className={`rounded-2xl border p-5 text-left capitalize transition ${
              theme === t ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-accent"
            }`}
          >
            <div className="text-sm font-medium">{t}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t === "system" ? "Match OS preference" : t === "light" ? "Always light" : "Always dark"}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
