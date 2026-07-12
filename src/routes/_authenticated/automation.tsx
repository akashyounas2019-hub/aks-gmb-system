import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Zap,
  MapPin,
  PenSquare,
  Images,
  Bell,
  Sparkles,
  CalendarDays,
  Target,
  Play,
  Pause,
  Plus,
  Settings2,
  Activity,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Workflow as WorkflowIcon,
  Trash2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/automation")({
  component: AutomationPage,
  head: () => ({
    meta: [
      { title: "Automation — Workflows & Rules" },
      {
        name: "description",
        content:
          "Automate geotagging, post generation, competitor alerts and more with rule-based workflows.",
      },
    ],
  }),
});

/* -------------------------------------------------------------------------- */
/* Types & templates                                                          */
/* -------------------------------------------------------------------------- */

type AutomationCategory = "geotagging" | "content" | "monitoring" | "media";

type Trigger =
  | { kind: "schedule"; cron: string; label: string }
  | { kind: "event"; event: string; label: string }
  | { kind: "manual"; label: string };

type Template = {
  id: string;
  name: string;
  description: string;
  category: AutomationCategory;
  icon: typeof Zap;
  tone: string;
  trigger: Trigger;
  actions: string[];
  defaults?: Record<string, string | number | boolean>;
};

const TEMPLATES: Template[] = [
  {
    id: "auto-geotag-upload",
    name: "Auto-geotag on upload",
    description:
      "When an image is uploaded without coordinates, tag it with the default business location.",
    category: "geotagging",
    icon: MapPin,
    tone: "bg-emerald-500/15 text-emerald-500",
    trigger: { kind: "event", event: "image.uploaded", label: "New image uploaded" },
    actions: ["Detect missing GPS", "Apply default location", "Log to activity"],
    defaults: { locationLabel: "Business HQ", radius_m: 50 },
  },
  {
    id: "bulk-geotag-batches",
    name: "Nightly bulk geotag review",
    description:
      "Sweep untagged images each night and cluster them by folder for one-click bulk tagging.",
    category: "geotagging",
    icon: WorkflowIcon,
    tone: "bg-emerald-500/15 text-emerald-500",
    trigger: { kind: "schedule", cron: "0 2 * * *", label: "Every day at 2:00 AM" },
    actions: ["Query untagged images", "Group by folder", "Notify owner"],
  },
  {
    id: "weekly-post-generator",
    name: "Weekly post generation",
    description:
      "Draft 3 GMB posts every Monday using top-ranking keywords and tagged photos.",
    category: "content",
    icon: PenSquare,
    tone: "bg-violet-500/15 text-violet-500",
    trigger: { kind: "schedule", cron: "0 9 * * 1", label: "Mondays at 9:00 AM" },
    actions: ["Pull top keywords", "Compose 3 drafts", "Queue in calendar"],
    defaults: { drafts_per_run: 3 },
  },
  {
    id: "keyword-driven-caption",
    name: "Keyword-driven captions",
    description:
      "When a new image is tagged, auto-generate an SEO caption using its cluster keywords.",
    category: "content",
    icon: Sparkles,
    tone: "bg-violet-500/15 text-violet-500",
    trigger: { kind: "event", event: "image.tagged", label: "Image tagged" },
    actions: ["Fetch related keywords", "Generate caption", "Attach to image"],
  },
  {
    id: "competitor-threat-alert",
    name: "Competitor threat alert",
    description:
      "Notify when any competitor crosses your threat threshold or gains ranks quickly.",
    category: "monitoring",
    icon: Target,
    tone: "bg-rose-500/15 text-rose-500",
    trigger: { kind: "schedule", cron: "0 */6 * * *", label: "Every 6 hours" },
    actions: ["Refresh ranks", "Compare thresholds", "Send in-app + email"],
    defaults: { threat_threshold: 70, rank_jump: 3 },
  },
  {
    id: "rank-drop-alert",
    name: "Rank drop watchdog",
    description:
      "Alert when a tracked keyword falls more than a set number of positions.",
    category: "monitoring",
    icon: Bell,
    tone: "bg-rose-500/15 text-rose-500",
    trigger: { kind: "schedule", cron: "0 8 * * *", label: "Daily at 8:00 AM" },
    actions: ["Fetch rankings", "Diff vs. yesterday", "Notify on drop ≥ N"],
    defaults: { drop_threshold: 5 },
  },
  {
    id: "auto-frame-extraction",
    name: "Auto-extract sharp frames",
    description:
      "Whenever a video finishes processing, pull sharp frames and route them to the library.",
    category: "media",
    icon: Images,
    tone: "bg-sky-500/15 text-sky-500",
    trigger: { kind: "event", event: "video.processed", label: "Video processed" },
    actions: ["Score sharpness", "Save top frames", "Notify library"],
    defaults: { max_frames: 15 },
  },
  {
    id: "calendar-auto-publish",
    name: "Calendar auto-publish",
    description:
      "Push scheduled posts to GMB when their calendar slot goes live.",
    category: "content",
    icon: CalendarDays,
    tone: "bg-violet-500/15 text-violet-500",
    trigger: { kind: "schedule", cron: "*/15 * * * *", label: "Every 15 minutes" },
    actions: ["Find due posts", "Publish to GMB", "Mark as posted"],
  },
];

type AutomationRule = {
  id: string;
  templateId: string;
  name: string;
  enabled: boolean;
  createdAt: string;
  lastRunAt?: string;
  runCount: number;
  status: "idle" | "running" | "success" | "error";
  config: Record<string, string | number | boolean>;
};

type ActivityEntry = {
  id: string;
  ruleId: string;
  ruleName: string;
  status: "success" | "error" | "info";
  message: string;
  at: string;
};

const STORAGE_KEY_RULES = "automation.rules.v1";
const STORAGE_KEY_ACTIVITY = "automation.activity.v1";
const STORAGE_KEY_CUSTOM = "automation.customTemplates.v1";

const CATEGORY_ICONS: Record<AutomationCategory, typeof Zap> = {
  geotagging: MapPin,
  content: PenSquare,
  monitoring: Target,
  media: Images,
};
const CATEGORY_TONES: Record<AutomationCategory, string> = {
  geotagging: "bg-emerald-500/15 text-emerald-500",
  content: "bg-violet-500/15 text-violet-500",
  monitoring: "bg-rose-500/15 text-rose-500",
  media: "bg-sky-500/15 text-sky-500",
};

type CustomTemplateSerialized = Omit<Template, "icon" | "tone"> & { custom: true };

const CATEGORY_META: Record<AutomationCategory, { label: string; color: string }> = {
  geotagging: { label: "Geotagging", color: "text-emerald-500" },
  content: { label: "Content", color: "text-violet-500" },
  monitoring: { label: "Monitoring", color: "text-rose-500" },
  media: { label: "Media", color: "text-sky-500" },
};

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

function AutomationPage() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [customTemplates, setCustomTemplates] = useState<CustomTemplateSerialized[]>([]);
  const [category, setCategory] = useState<AutomationCategory | "all">("all");
  const [editing, setEditing] = useState<AutomationRule | null>(null);
  const [creating, setCreating] = useState(false);

  const allTemplates = useMemo<Template[]>(
    () =>
      [
        ...TEMPLATES,
        ...customTemplates.map((c) => ({
          ...c,
          icon: CATEGORY_ICONS[c.category],
          tone: CATEGORY_TONES[c.category],
        })),
      ],
    [customTemplates],
  );

  // Load persisted state
  useEffect(() => {
    try {
      const r = localStorage.getItem(STORAGE_KEY_RULES);
      const a = localStorage.getItem(STORAGE_KEY_ACTIVITY);
      const c = localStorage.getItem(STORAGE_KEY_CUSTOM);
      if (r) setRules(JSON.parse(r));
      if (a) setActivity(JSON.parse(a));
      if (c) setCustomTemplates(JSON.parse(c));
    } catch {
      /* noop */
    }
  }, []);

  // Persist
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_RULES, JSON.stringify(rules));
  }, [rules]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ACTIVITY, JSON.stringify(activity.slice(0, 50)));
  }, [activity]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(customTemplates));
  }, [customTemplates]);

  const filteredTemplates = useMemo(
    () => (category === "all" ? allTemplates : allTemplates.filter((t) => t.category === category)),
    [category, allTemplates],
  );

  const stats = {
    total: rules.length,
    active: rules.filter((r) => r.enabled).length,
    runs: rules.reduce((n, r) => n + r.runCount, 0),
    errors: activity.filter((a) => a.status === "error").length,
  };

  function addRule(template: Template) {
    const rule: AutomationRule = {
      id: crypto.randomUUID(),
      templateId: template.id,
      name: template.name,
      enabled: true,
      createdAt: new Date().toISOString(),
      runCount: 0,
      status: "idle",
      config: { ...(template.defaults ?? {}) },
    };
    setRules((prev) => [rule, ...prev]);
    logActivity(rule.id, rule.name, "info", "Automation created and enabled");
    toast.success(`${template.name} added.`);
  }

  function toggleRule(id: string) {
    setRules((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, enabled: !r.enabled };
        logActivity(r.id, r.name, "info", next.enabled ? "Enabled" : "Paused");
        return next;
      }),
    );
  }

  function deleteRule(id: string) {
    const rule = rules.find((r) => r.id === id);
    setRules((prev) => prev.filter((r) => r.id !== id));
    if (rule) logActivity(rule.id, rule.name, "info", "Deleted automation");
  }

  function runNow(id: string) {
    const rule = rules.find((r) => r.id === id);
    if (!rule) return;
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "running" } : r)),
    );
    // Simulate execution — real runs happen on the backend for the corresponding feature.
    setTimeout(() => {
      const ok = Math.random() > 0.15;
      setRules((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status: ok ? "success" : "error",
                lastRunAt: new Date().toISOString(),
                runCount: r.runCount + 1,
              }
            : r,
        ),
      );
      logActivity(
        rule.id,
        rule.name,
        ok ? "success" : "error",
        ok ? "Run completed successfully" : "Run failed — see logs",
      );
      toast[ok ? "success" : "error"](
        ok ? `${rule.name} ran successfully.` : `${rule.name} failed.`,
      );
    }, 800);
  }

  function logActivity(
    ruleId: string,
    ruleName: string,
    status: ActivityEntry["status"],
    message: string,
  ) {
    setActivity((prev) =>
      [
        { id: crypto.randomUUID(), ruleId, ruleName, status, message, at: new Date().toISOString() },
        ...prev,
      ].slice(0, 50),
    );
  }

  function updateConfig(id: string, patch: Record<string, string | number | boolean>) {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, config: { ...r.config, ...patch } } : r)),
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
            <Zap className="h-3.5 w-3.5" /> Automation
          </div>
          <h1 className="font-display text-3xl leading-tight">Workflows & rules</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Automate geotagging, post generation, competitor monitoring and media workflows.
            Turn repetitive tasks into scheduled or event-driven rules.
          </p>
        </div>
        <div className="flex gap-2">
          <StatChip label="Automations" value={stats.total} />
          <StatChip label="Active" value={stats.active} tone="primary" />
          <StatChip label="Runs" value={stats.runs} tone="success" />
          <StatChip label="Errors" value={stats.errors} tone={stats.errors ? "danger" : undefined} />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* LEFT — Templates + rules */}
        <div className="space-y-6">
          {/* Category filter */}
          <div className="flex flex-wrap gap-2">
            {(["all", "geotagging", "content", "monitoring", "media"] as const).map((c) => {
              const active = category === c;
              const label = c === "all" ? "All" : CATEGORY_META[c].label;
              return (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    active
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Templates */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg">Automation templates</h2>
              <span className="text-xs text-muted-foreground">
                {filteredTemplates.length} available
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredTemplates.map((t) => {
                const Icon = t.icon;
                const installed = rules.some((r) => r.templateId === t.id);
                return (
                  <div
                    key={t.id}
                    className="group relative flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-primary/60"
                  >
                    <div className="flex items-start gap-3">
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${t.tone}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate font-medium">{t.name}</h3>
                          {installed && (
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                              Installed
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
                        {t.trigger.kind === "schedule" ? (
                          <Clock className="h-3 w-3" />
                        ) : t.trigger.kind === "event" ? (
                          <Activity className="h-3 w-3" />
                        ) : (
                          <Play className="h-3 w-3" />
                        )}
                        {t.trigger.label}
                      </span>
                      <span className={`capitalize ${CATEGORY_META[t.category].color}`}>
                        {CATEGORY_META[t.category].label}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {t.actions.map((a) => (
                        <span
                          key={a}
                          className="rounded-md border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {a}
                        </span>
                      ))}
                    </div>

                    <button
                      onClick={() => addRule(t)}
                      className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add automation
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Active rules */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg">Your automations</h2>
              <span className="text-xs text-muted-foreground">
                {rules.length ? `${rules.length} configured` : "none yet"}
              </span>
            </div>

            {rules.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                <WorkflowIcon className="mx-auto mb-2 h-8 w-8 opacity-40" />
                Add a template above to create your first automation.
              </div>
            ) : (
              <div className="space-y-2">
                {rules.map((r) => {
                  const tpl = allTemplates.find((t) => t.id === r.templateId);
                  if (!tpl) return null;
                  const Icon = tpl.icon;
                  return (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3"
                    >
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${tpl.tone}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-sm font-medium">{r.name}</div>
                          <StatusDot status={r.status} />
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            {tpl.trigger.kind === "schedule" ? (
                              <Clock className="h-3 w-3" />
                            ) : (
                              <Activity className="h-3 w-3" />
                            )}
                            {tpl.trigger.label}
                          </span>
                          <span>{r.runCount} runs</span>
                          {r.lastRunAt && (
                            <span>Last: {new Date(r.lastRunAt).toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => runNow(r.id)}
                          disabled={r.status === "running"}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-40"
                        >
                          <Play className="h-3 w-3" /> Run
                        </button>
                        <button
                          onClick={() => setEditing(r)}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                        >
                          <Settings2 className="h-3 w-3" /> Configure
                        </button>
                        <button
                          onClick={() => toggleRule(r.id)}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
                            r.enabled
                              ? "bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25"
                              : "border border-border text-muted-foreground hover:bg-accent"
                          }`}
                        >
                          {r.enabled ? (
                            <>
                              <Pause className="h-3 w-3" /> Active
                            </>
                          ) : (
                            <>
                              <Play className="h-3 w-3" /> Paused
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => deleteRule(r.id)}
                          className="rounded-md border border-border p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* RIGHT — Activity feed */}
        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-base">Recent activity</h2>
              <span className="text-xs text-muted-foreground">{activity.length}</span>
            </div>

            {activity.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                No activity yet.
              </div>
            ) : (
              <ul className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                {activity.map((a) => (
                  <li key={a.id} className="flex items-start gap-2 rounded-md p-2 hover:bg-accent">
                    <span className="mt-0.5">
                      {a.status === "success" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : a.status === "error" ? (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{a.ruleName}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{a.message}</div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground/80">
                        {new Date(a.at).toLocaleString()}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-border bg-gradient-to-br from-primary/10 to-transparent p-4">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Tip
            </div>
            <p className="text-xs text-muted-foreground">
              Combine an event trigger (e.g. new image uploaded) with a scheduled sweep to keep
              your library consistently geotagged and post-ready.
            </p>
          </div>
        </aside>
      </div>

      {/* Configure modal */}
      {editing && (
        <ConfigureModal
          rule={editing}
          template={allTemplates.find((t) => t.id === editing.templateId)!}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            setRules((prev) =>
              prev.map((r) => (r.id === editing.id ? { ...r, ...patch } : r)),
            );
            logActivity(editing.id, patch.name ?? editing.name, "info", "Configuration updated");
            setEditing(null);
            toast.success("Automation updated.");
          }}
          onUpdateConfig={(patch) => updateConfig(editing.id, patch)}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Bits                                                                       */
/* -------------------------------------------------------------------------- */

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "primary" | "success" | "danger";
}) {
  const toneCls =
    tone === "primary"
      ? "bg-primary/15 text-primary"
      : tone === "success"
        ? "bg-emerald-500/15 text-emerald-500"
        : tone === "danger"
          ? "bg-destructive/15 text-destructive"
          : "bg-muted text-foreground";
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <span
        className={`grid h-6 min-w-6 place-items-center rounded-md px-1.5 text-xs font-semibold ${toneCls}`}
      >
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function StatusDot({ status }: { status: AutomationRule["status"] }) {
  const cls =
    status === "running"
      ? "bg-amber-500 animate-pulse"
      : status === "success"
        ? "bg-emerald-500"
        : status === "error"
          ? "bg-destructive"
          : "bg-muted-foreground/40";
  return <span className={`inline-block h-2 w-2 rounded-full ${cls}`} aria-label={status} />;
}

function ConfigureModal({
  rule,
  template,
  onClose,
  onSave,
  onUpdateConfig,
}: {
  rule: AutomationRule;
  template: Template;
  onClose: () => void;
  onSave: (patch: Partial<AutomationRule>) => void;
  onUpdateConfig: (patch: Record<string, string | number | boolean>) => void;
}) {
  const [name, setName] = useState(rule.name);
  const [config, setConfig] = useState(rule.config);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Configure automation
            </div>
            <h3 className="mt-0.5 font-display text-lg">{template.name}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{template.description}</p>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <div className="rounded-md bg-muted/50 p-3 text-xs">
            <div className="mb-1 font-medium">Trigger</div>
            <div className="text-muted-foreground">
              {template.trigger.kind === "schedule" && (
                <>
                  <Clock className="mr-1 inline h-3 w-3" />
                  {template.trigger.label} ({template.trigger.cron})
                </>
              )}
              {template.trigger.kind === "event" && (
                <>
                  <Activity className="mr-1 inline h-3 w-3" />
                  Event: <code className="rounded bg-background px-1">{template.trigger.event}</code>
                </>
              )}
              {template.trigger.kind === "manual" && <>Manual runs only</>}
            </div>
          </div>

          {Object.keys(config).length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium">Parameters</div>
              {Object.entries(config).map(([k, v]) => (
                <label key={k} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 text-xs text-muted-foreground">{k}</span>
                  {typeof v === "boolean" ? (
                    <input
                      type="checkbox"
                      checked={v}
                      onChange={(e) => setConfig({ ...config, [k]: e.target.checked })}
                      className="h-4 w-4"
                    />
                  ) : (
                    <input
                      type={typeof v === "number" ? "number" : "text"}
                      value={String(v)}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          [k]: typeof v === "number" ? Number(e.target.value) : e.target.value,
                        })
                      }
                      className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  )}
                </label>
              ))}
            </div>
          )}

          <div className="space-y-1">
            <div className="text-xs font-medium">Actions</div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {template.actions.map((a, i) => (
                <li key={a} className="flex items-center gap-2">
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                    {i + 1}
                  </span>
                  {a}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onUpdateConfig(config);
              onSave({ name });
            }}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
