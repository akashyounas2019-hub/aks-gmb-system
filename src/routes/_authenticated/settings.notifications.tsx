import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/notifications")({
  component: NotificationsSettings,
});

const KEY = "settings_notifications_v1";
type Prefs = { emailPostResults: boolean; emailRankAlerts: boolean; weeklyDigest: boolean };
const DEFAULTS: Prefs = { emailPostResults: true, emailRankAlerts: true, weeklyDigest: false };

function NotificationsSettings() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
      if (raw) setPrefs({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {}
  }, []);
  function toggle(k: keyof Prefs) {
    const next = { ...prefs, [k]: !prefs[k] };
    setPrefs(next);
    localStorage.setItem(KEY, JSON.stringify(next));
    toast.success("Preference saved");
  }
  const rows: [keyof Prefs, string, string][] = [
    ["emailPostResults", "Post results", "Email me when a scheduled post succeeds or fails."],
    ["emailRankAlerts", "Ranking alerts", "Email me when a tracked keyword drops out of the top 3."],
    ["weeklyDigest", "Weekly digest", "Every Monday, get a summary of last week's performance."],
  ];
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Notifications</h2>
        <p className="mt-1 text-sm text-muted-foreground">Choose what we email you about.</p>
      </div>
      <div className="rounded-2xl border border-border bg-card">
        {rows.map(([k, title, desc], i) => (
          <div key={k} className={`flex items-center justify-between gap-4 p-4 ${i > 0 ? "border-t border-border" : ""}`}>
            <div>
              <div className="text-sm font-medium">{title}</div>
              <div className="text-xs text-muted-foreground">{desc}</div>
            </div>
            <button
              onClick={() => toggle(k)}
              className={`h-6 w-11 rounded-full transition ${prefs[k] ? "bg-primary" : "bg-muted"}`}
              aria-pressed={prefs[k]}
            >
              <span className={`block h-5 w-5 rounded-full bg-white shadow transition ${prefs[k] ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
