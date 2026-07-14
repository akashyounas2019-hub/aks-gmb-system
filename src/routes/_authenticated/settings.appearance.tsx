import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Monitor, Sun, Moon, Check } from "lucide-react";
import { getPreferences, savePreferences } from "@/lib/user-preferences.functions";
import {
  applyTheme,
  getStoredTheme,
  setStoredTheme,
  watchSystemTheme,
  type Theme,
} from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/settings/appearance")({
  component: AppearanceSettings,
});

const OPTIONS: Array<{ value: Theme; label: string; hint: string; icon: typeof Sun }> = [
  { value: "system", label: "System", hint: "Match your OS preference", icon: Monitor },
  { value: "light", label: "Light", hint: "Always light", icon: Sun },
  { value: "dark", label: "Dark", hint: "Always dark", icon: Moon },
];

function AppearanceSettings() {
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());
  const load = useServerFn(getPreferences);
  const save = useServerFn(savePreferences);

  // Initial load: prefer server value, fall back to local, then apply.
  useEffect(() => {
    load()
      .then((p) => {
        const t = (p?.theme as Theme) || getStoredTheme();
        setTheme(t);
        setStoredTheme(t);
        applyTheme(t);
        watchSystemTheme(t === "system");
      })
      .catch(() => {
        const t = getStoredTheme();
        applyTheme(t);
        watchSystemTheme(t === "system");
      });
    return () => watchSystemTheme(false);
  }, [load]);

  async function choose(t: Theme) {
    setTheme(t);
    setStoredTheme(t);
    applyTheme(t);
    watchSystemTheme(t === "system");
    try {
      await save({ data: { theme: t } });
      toast.success(`Theme set to ${t}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Appearance</h2>
        <p className="mt-1 text-sm text-muted-foreground">Choose how the app looks.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {OPTIONS.map((o) => {
          const active = theme === o.value;
          const Icon = o.icon;
          return (
            <button
              key={o.value}
              onClick={() => choose(o.value)}
              aria-pressed={active}
              className={`relative rounded-2xl border p-5 text-left transition ${
                active
                  ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                  : "border-border bg-card hover:bg-accent"
              }`}
            >
              {active && (
                <span className="absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-3 w-3" />
                </span>
              )}
              <Icon className="h-5 w-5 text-primary" />
              <div className="mt-3 text-sm font-medium">{o.label}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{o.hint}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
