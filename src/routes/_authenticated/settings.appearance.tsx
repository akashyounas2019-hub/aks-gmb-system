import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { getPreferences, savePreferences } from "@/lib/user-preferences.functions";

export const Route = createFileRoute("/_authenticated/settings/appearance")({
  component: AppearanceSettings,
});

type Theme = "system" | "light" | "dark";

function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
}

function AppearanceSettings() {
  const [theme, setTheme] = useState<Theme>("system");
  const load = useServerFn(getPreferences);
  const save = useServerFn(savePreferences);

  useEffect(() => {
    load()
      .then((p) => {
        const t = (p.theme as Theme) || "system";
        setTheme(t);
        applyTheme(t);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load"));
  }, [load]);

  async function choose(t: Theme) {
    setTheme(t);
    applyTheme(t);
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
