import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Mail, MessageSquare, Plus, Smartphone, Trash2 } from "lucide-react";
import { getPreferences, savePreferences } from "@/lib/user-preferences.functions";

export const Route = createFileRoute("/_authenticated/settings/notifications")({
  component: NotificationsSettings,
});

type Channel = "email" | "in_app" | "sms";
type TriggerType =
  | "post_success"
  | "post_failure"
  | "rank_drop"
  | "rank_gain"
  | "competitor_overtake"
  | "keyword_threshold"
  | "weekly_digest"
  | "custom";

type CustomNotification = {
  id: string;
  name: string;
  trigger: TriggerType;
  channels: Channel[];
  threshold?: number;
  keyword?: string;
  note?: string;
  enabled: boolean;
};

type BuiltIn = { emailPostResults: boolean; emailRankAlerts: boolean; weeklyDigest: boolean };
type Prefs = BuiltIn & { custom?: CustomNotification[] };

const DEFAULTS: Prefs = {
  emailPostResults: true,
  emailRankAlerts: true,
  weeklyDigest: false,
  custom: [],
};

const TRIGGER_OPTIONS: { value: TriggerType; label: string; description: string; needsThreshold?: boolean; needsKeyword?: boolean }[] = [
  { value: "post_success", label: "Post published", description: "When a scheduled post succeeds." },
  { value: "post_failure", label: "Post failed", description: "When a scheduled post fails." },
  { value: "rank_drop", label: "Ranking drop", description: "When rank drops by N spots.", needsThreshold: true },
  { value: "rank_gain", label: "Ranking gain", description: "When rank improves by N spots.", needsThreshold: true },
  { value: "competitor_overtake", label: "Competitor overtakes you", description: "When a competitor passes you on a tracked keyword." },
  { value: "keyword_threshold", label: "Keyword falls below rank", description: "Alert when a specific keyword drops out of top N.", needsThreshold: true, needsKeyword: true },
  { value: "weekly_digest", label: "Weekly digest", description: "Summary email each Monday." },
  { value: "custom", label: "Custom / manual", description: "A free-form notification you'll trigger yourself." },
];

const CHANNEL_META: { value: Channel; label: string; icon: typeof Mail }[] = [
  { value: "email", label: "Email", icon: Mail },
  { value: "in_app", label: "In-app", icon: MessageSquare },
  { value: "sms", label: "SMS", icon: Smartphone },
];

function uid(): string {
  return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function NotificationsSettings() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const load = useServerFn(getPreferences);
  const save = useServerFn(savePreferences);

  useEffect(() => {
    load()
      .then((p) => {
        const n = (p.notifications as Partial<Prefs>) ?? {};
        setPrefs({ ...DEFAULTS, ...n, custom: n.custom ?? [] });
        setLoaded(true);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load"));
  }, [load]);

  async function persist(next: Prefs) {
    setPrefs(next);
    try {
      await save({ data: { notifications: next } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  }

  async function toggle(k: keyof BuiltIn) {
    const next = { ...prefs, [k]: !prefs[k] };
    await persist(next);
    toast.success("Preference saved");
  }

  function addNotification() {
    const item: CustomNotification = {
      id: uid(),
      name: "New notification",
      trigger: "rank_drop",
      channels: ["email"],
      threshold: 3,
      enabled: true,
    };
    const next = { ...prefs, custom: [...(prefs.custom ?? []), item] };
    persist(next);
    setEditingId(item.id);
  }

  function updateItem(id: string, patch: Partial<CustomNotification>) {
    const next = {
      ...prefs,
      custom: (prefs.custom ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)),
    };
    persist(next);
  }

  function removeItem(id: string) {
    const next = { ...prefs, custom: (prefs.custom ?? []).filter((c) => c.id !== id) };
    persist(next);
    toast.success("Notification removed");
  }

  function toggleChannel(id: string, ch: Channel) {
    const item = (prefs.custom ?? []).find((c) => c.id === id);
    if (!item) return;
    const has = item.channels.includes(ch);
    updateItem(id, {
      channels: has ? item.channels.filter((c) => c !== ch) : [...item.channels, ch],
    });
  }

  const rows: [keyof BuiltIn, string, string][] = [
    ["emailPostResults", "Post results", "Email me when a scheduled post succeeds or fails."],
    ["emailRankAlerts", "Ranking alerts", "Email me when a tracked keyword drops out of the top 3."],
    ["weeklyDigest", "Weekly digest", "Every Monday, get a summary of last week's performance."],
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">Notifications</h2>
        <p className="mt-1 text-sm text-muted-foreground">Choose what we alert you about and how.</p>
      </div>

      <section>
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">Built-in alerts</h3>
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
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Custom notifications</h3>
            <p className="text-xs text-muted-foreground">Tailor alerts to specific keywords, thresholds, or channels.</p>
          </div>
          <button
            onClick={addNotification}
            disabled={!loaded}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add new notification
          </button>
        </div>

        {(prefs.custom ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center">
            <Bell className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">No custom notifications yet.</p>
            <p className="text-xs text-muted-foreground">Click <span className="font-medium">Add new notification</span> to create your first.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(prefs.custom ?? []).map((n) => {
              const trigger = TRIGGER_OPTIONS.find((t) => t.value === n.trigger)!;
              const isEditing = editingId === n.id;
              return (
                <div key={n.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => updateItem(n.id, { enabled: !n.enabled })}
                      className={`mt-1 h-6 w-11 shrink-0 rounded-full transition ${n.enabled ? "bg-primary" : "bg-muted"}`}
                      aria-pressed={n.enabled}
                      title={n.enabled ? "Enabled" : "Disabled"}
                    >
                      <span className={`block h-5 w-5 rounded-full bg-white shadow transition ${n.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>

                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <input
                          value={n.name}
                          onChange={(e) => updateItem(n.id, { name: e.target.value })}
                          onBlur={() => setEditingId(null)}
                          autoFocus
                          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm font-medium"
                        />
                      ) : (
                        <button
                          onClick={() => setEditingId(n.id)}
                          className="text-left text-sm font-medium hover:underline"
                        >
                          {n.name || "Untitled notification"}
                        </button>
                      )}
                      <div className="mt-0.5 text-xs text-muted-foreground">{trigger.description}</div>
                    </div>

                    <button
                      onClick={() => removeItem(n.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs">
                      <span className="mb-1 block text-muted-foreground">Trigger</span>
                      <select
                        value={n.trigger}
                        onChange={(e) => updateItem(n.id, { trigger: e.target.value as TriggerType })}
                        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                      >
                        {TRIGGER_OPTIONS.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </label>

                    {trigger.needsThreshold && (
                      <label className="text-xs">
                        <span className="mb-1 block text-muted-foreground">Threshold (positions)</span>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={n.threshold ?? 3}
                          onChange={(e) => updateItem(n.id, { threshold: Number(e.target.value) })}
                          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                        />
                      </label>
                    )}

                    {trigger.needsKeyword && (
                      <label className="text-xs sm:col-span-2">
                        <span className="mb-1 block text-muted-foreground">Keyword</span>
                        <input
                          value={n.keyword ?? ""}
                          onChange={(e) => updateItem(n.id, { keyword: e.target.value })}
                          placeholder="e.g. best pizza in Austin"
                          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                        />
                      </label>
                    )}

                    <label className="text-xs sm:col-span-2">
                      <span className="mb-1 block text-muted-foreground">Note (optional)</span>
                      <input
                        value={n.note ?? ""}
                        onChange={(e) => updateItem(n.id, { note: e.target.value })}
                        placeholder="What is this alert for?"
                        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                      />
                    </label>
                  </div>

                  <div className="mt-3">
                    <span className="mb-1 block text-xs text-muted-foreground">Channels</span>
                    <div className="flex flex-wrap gap-2">
                      {CHANNEL_META.map(({ value, label, icon: Icon }) => {
                        const active = n.channels.includes(value);
                        return (
                          <button
                            key={value}
                            onClick={() => toggleChannel(n.id, value)}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
                              active
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <Icon className="h-3 w-3" />
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
