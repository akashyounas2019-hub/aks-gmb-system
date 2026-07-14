import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Zap,
  MapPin,
  PenSquare,
  Bell,
  Target,
  Play,
  Plus,
  Activity,
  CheckCircle2,
  AlertCircle,
  Workflow as WorkflowIcon,
  Trash2,
  Pencil,
  Clock,
  Loader2,
  Sparkles,
  FileText,
  CalendarClock,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  listAutomations,
  listAutomationRuns,
  createAutomation,
  updateAutomation,
  deleteAutomation,
  runAutomationNow,
} from "@/lib/automations.functions";
import { WizardPage } from "@/routes/_authenticated/wizard";

export const Route = createFileRoute("/_authenticated/automation")({
  component: AutomationRoute,
  head: () => ({
    meta: [
      { title: "Automation — Workflows & Rules" },
      {
        name: "description",
        content:
          "Real scheduled workflows for rank refresh, auto-publish, auto-tag and alerts.",
      },
    ],
  }),
});

function AutomationRoute() {
  const [tab, setTab] = useState<"automation" | "pipeline">("automation");
  return (
    <div>
      <div className="border-b border-border bg-card px-6 pt-4">
        <nav role="tablist" className="-mb-px flex gap-1">
          {(
            [
              { id: "automation", label: "Automation", icon: Zap },
              { id: "pipeline", label: "Pipeline", icon: WorkflowIcon },
            ] as const
          ).map((t) => {
            const active = tab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>
      {tab === "automation" ? <AutomationPage /> : <WizardPage />}
    </div>
  );
}

type Kind = "rank_refresh" | "auto_publish" | "auto_tag" | "alert_scan";

type PresetId =
  | "prompt_generation"
  | "content_writing"
  | "post_scheduling"
  | "image_geotag"
  | "system_audit"
  | "rank_refresh"
  | "alert_scan";

const PRESETS: Record<
  PresetId,
  {
    label: string;
    description: string;
    icon: typeof Zap;
    tone: string;
    kind: Kind;
    mode: string;
    cron: string;
  }
> = {
  prompt_generation: {
    label: "Auto prompt generation",
    description: "Generate on-brand prompts for upcoming posts using recent activity.",
    icon: Sparkles,
    tone: "bg-fuchsia-500/15 text-fuchsia-400",
    kind: "auto_publish",
    mode: "prompt_generation",
    cron: "0 8 * * *",
  },
  content_writing: {
    label: "Content writing",
    description: "Draft captions and long-form content from your prompts and keywords.",
    icon: FileText,
    tone: "bg-violet-500/15 text-violet-400",
    kind: "auto_publish",
    mode: "content_writing",
    cron: "0 9 * * *",
  },
  post_scheduling: {
    label: "Post scheduling",
    description: "Publish scheduled drafts as their time arrives.",
    icon: CalendarClock,
    tone: "bg-sky-500/15 text-sky-400",
    kind: "auto_publish",
    mode: "schedule",
    cron: "*/15 * * * *",
  },
  image_geotag: {
    label: "Image geo-tagging",
    description: "Tag new uploads with venue location and matching keywords.",
    icon: MapPin,
    tone: "bg-emerald-500/15 text-emerald-400",
    kind: "auto_tag",
    mode: "geo_tag",
    cron: "0 2 * * *",
  },
  system_audit: {
    label: "System audit",
    description: "Sweep listings, tags and integrations for issues and drift.",
    icon: ShieldCheck,
    tone: "bg-amber-500/15 text-amber-400",
    kind: "alert_scan",
    mode: "audit",
    cron: "0 6 * * *",
  },
  rank_refresh: {
    label: "Rank refresh",
    description: "Re-check tracked keywords across your rank source on a schedule.",
    icon: Target,
    tone: "bg-rose-500/15 text-rose-400",
    kind: "rank_refresh",
    mode: "default",
    cron: "0 */6 * * *",
  },
  alert_scan: {
    label: "Rank alert scan",
    description: "Review rank alerts and notify on threshold breaches.",
    icon: Bell,
    tone: "bg-indigo-500/15 text-indigo-400",
    kind: "alert_scan",
    mode: "alert",
    cron: "0 8 * * *",
  },
};

// Back-compat: map DB kind → visual meta so existing rows still render nicely.
const KIND_META: Record<
  Kind,
  { label: string; description: string; icon: typeof Zap; tone: string; cron: string }
> = {
  rank_refresh: {
    label: "Rank refresh",
    description: "Re-check tracked keywords across your rank source on a schedule.",
    icon: Target,
    tone: "bg-rose-500/15 text-rose-400",
    cron: "0 */6 * * *",
  },
  auto_publish: {
    label: "Auto-publish scheduled posts",
    description: "Publish drafts whose scheduled time has arrived.",
    icon: CalendarClock,
    tone: "bg-sky-500/15 text-sky-400",
    cron: "*/15 * * * *",
  },
  auto_tag: {
    label: "Auto-tag new images",
    description: "Sweep untagged uploads and assign the best matching keywords.",
    icon: MapPin,
    tone: "bg-emerald-500/15 text-emerald-400",
    cron: "0 2 * * *",
  },
  alert_scan: {
    label: "Rank alert scan",
    description: "Review rank alerts and notify on threshold breaches.",
    icon: Bell,
    tone: "bg-indigo-500/15 text-indigo-400",
    cron: "0 8 * * *",
  },
};

type Frequency = "daily" | "weekly" | "interval" | "custom";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function buildCron(opts: {
  frequency: Frequency;
  hour: number;
  minute: number;
  weekday: number;
  intervalMinutes: number;
  custom: string;
}): string {
  const { frequency, hour, minute, weekday, intervalMinutes, custom } = opts;
  if (frequency === "custom") return custom.trim() || "0 * * * *";
  if (frequency === "interval") {
    const m = Math.max(1, Math.min(59, intervalMinutes));
    return `*/${m} * * * *`;
  }
  if (frequency === "weekly") return `${minute} ${hour} * * ${weekday}`;
  return `${minute} ${hour} * * *`; // daily
}

function AutomationPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAutomations);
  const runsFn = useServerFn(listAutomationRuns);
  const createFn = useServerFn(createAutomation);
  const updateFn = useServerFn(updateAutomation);
  const deleteFn = useServerFn(deleteAutomation);
  const runFn = useServerFn(runAutomationNow);

  const automations = useQuery({
    queryKey: ["automations"],
    queryFn: () => listFn(),
  });
  const runs = useQuery({
    queryKey: ["automation-runs"],
    queryFn: () => runsFn({ data: { limit: 50 } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["automations"] });
    qc.invalidateQueries({ queryKey: ["automation-runs"] });
  };

  const createMut = useMutation({
    mutationFn: (p: {
      preset: PresetId;
      name: string;
      cron: string;
      config: Record<string, unknown>;
    }) => {
      const meta = PRESETS[p.preset];
      return createFn({
        data: {
          name: p.name || meta.label,
          kind: meta.kind,
          cron: p.cron,
          config: { preset: p.preset, mode: meta.mode, ...p.config },
          enabled: true,
        },
      });
    },
    onSuccess: () => {
      toast.success("Workflow added.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Quick-add from preset grid (uses preset defaults).
  const quickAdd = (preset: PresetId) =>
    createMut.mutate({ preset, name: PRESETS[preset].label, cron: PRESETS[preset].cron, config: {} });


  const toggleMut = useMutation({
    mutationFn: (p: { id: string; enabled: boolean }) =>
      updateFn({ data: { id: p.id, patch: { enabled: p.enabled } } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Automation removed.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editMut = useMutation({
    mutationFn: (p: { id: string; name: string; cron: string }) =>
      updateFn({ data: { id: p.id, patch: { name: p.name, cron: p.cron } } }),
    onSuccess: () => {
      toast.success("Automation updated.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runMut = useMutation({
    mutationFn: (id: string) => runFn({ data: { id } }),
    onSuccess: (res) => {
      if (res.status === "success") toast.success("Run completed.");
      else toast.error(`Run failed: ${res.error ?? "unknown"}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = automations.data ?? [];
  const stats = {
    total: items.length,
    active: items.filter((a) => a.enabled).length,
    errors: (runs.data ?? []).filter((r) => r.status === "error").length,
  };

  const [addOpen, setAddOpen] = useState(false);
  const [addPreset, setAddPreset] = useState<PresetId | "">("");
  const [editing, setEditing] = useState<{ id: string; name: string; cron: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);


  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full flex-col">



      <div className="relative mx-auto max-w-[1500px] p-6">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-primary">
              <Zap className="h-3 w-3" /> Automation
            </div>
            <h1 className="font-display text-4xl leading-tight tracking-tight">
              Workflows & rules
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              Scheduled workflows backed by <code className="rounded bg-muted px-1">pg_cron</code>.
              Toggle any automation on and it runs on its cron; use “Run now” to trigger immediately.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatChip label="Automations" value={stats.total} />
            <StatChip label="Active" value={stats.active} tone="primary" />
            <StatChip label="Errors" value={stats.errors} tone={stats.errors ? "danger" : undefined} />
            <button
              onClick={() => {
                setAddKind("");
                setAddOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-primary to-primary/80 px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-[0_6px_20px_-8px_hsl(var(--primary)/0.6)] hover:brightness-110"
            >
              <Plus className="h-3.5 w-3.5" /> Add New Workflow
            </button>
          </div>
        </header>

        {/* Available kinds */}
        <section className="mb-8 rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg tracking-tight">Add automation</h2>
              <p className="text-xs text-muted-foreground">
                Choose a specialist workflow — each one runs on its own schedule.
              </p>
            </div>
            <span className="rounded-full bg-muted/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {Object.keys(KIND_META).length} kinds
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {(Object.keys(KIND_META) as Kind[]).map((kind) => {
              const meta = KIND_META[kind];
              const Icon = meta.icon;
              const installed = items.some((a) => a.kind === kind);
              return (
                <div
                  key={kind}
                  className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-border/60 bg-gradient-to-b from-card/90 to-card/50 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-xl ${meta.tone} shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-medium">{meta.label}</h3>
                        {installed && (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                            Installed
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{meta.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <code className="rounded bg-muted px-1">{meta.cron}</code>
                  </div>
                  <button
                    onClick={() => createMut.mutate(kind)}
                    disabled={createMut.isPending}
                    className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Your automations */}
        <section className="mb-8 rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg tracking-tight">Your automations</h2>
              <p className="text-xs text-muted-foreground">
                {items.length ? `${items.length} configured workflow${items.length === 1 ? "" : "s"}` : "None configured yet"}
              </p>
            </div>
          </div>

          {automations.isLoading ? (
            <SkeletonRow />
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              <WorkflowIcon className="mx-auto mb-2 h-8 w-8 opacity-40" />
              Add one of the automation kinds above.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {items.map((a) => {
                const meta = KIND_META[a.kind as Kind];
                const Icon = meta?.icon ?? Zap;
                return (
                  <div
                    key={a.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-gradient-to-b from-card/90 to-card/60 p-3.5 transition-all hover:border-primary/30 hover:shadow-md"
                  >
                    <span
                      className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${meta?.tone ?? "bg-muted"} shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{a.name}</div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <code>{a.cron}</code>
                        </span>
                        {a.last_run_at && (
                          <span>Last: {new Date(a.last_run_at).toLocaleString()}</span>
                        )}
                        {a.next_run_at && (
                          <span>Next: {new Date(a.next_run_at).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => runMut.mutate(a.id)}
                        disabled={runMut.isPending}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-40"
                      >
                        {runMut.isPending && runMut.variables === a.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Play className="h-3 w-3" />
                        )}
                        Run now
                      </button>
                      <button
                        onClick={() => toggleMut.mutate({ id: a.id, enabled: !a.enabled })}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
                          a.enabled
                            ? "bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25"
                            : "border border-border text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {a.enabled ? "Active" : "Paused"}
                      </button>
                      <button
                        onClick={() => setEditing({ id: a.id, name: a.name, cron: a.cron })}
                        className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label="Edit"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete({ id: a.id, name: a.name })}
                        className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Delete"
                        title="Delete"
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

        {/* Recent runs — full width at bottom */}
        <section className="rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="inline-flex items-center gap-2 font-display text-lg tracking-tight">
                <Activity className="h-4 w-4 text-primary" /> Recent runs
              </h2>
              <p className="text-xs text-muted-foreground">
                The latest executions across every workflow.
              </p>
            </div>
            <span className="rounded-full bg-muted/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {(runs.data ?? []).length} runs
            </span>
          </div>

          {runs.isLoading ? (
            <SkeletonRow />
          ) : (runs.data ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              No runs yet.
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {(runs.data ?? []).map((r) => {
                const parent = items.find((a) => a.id === r.automation_id);
                return (
                  <div
                    key={r.id}
                    className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-card/70 p-3 hover:border-primary/30"
                  >
                    <span className="mt-0.5">
                      {r.status === "success" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : r.status === "error" ? (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      ) : (
                        <Activity className="h-4 w-4 text-muted-foreground" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">
                        {parent?.name ?? "Deleted automation"}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {r.error ?? r.status}
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground/80">
                        {new Date(r.started_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>


      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add new workflow</DialogTitle>
            <DialogDescription>
              Choose a task to automate. Each workflow runs on its own schedule.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Automation type
            </label>
            <Select value={addKind} onValueChange={(v) => setAddKind(v as Kind)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a workflow…" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_META) as Kind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_META[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {addKind && (
              <p className="mt-2 text-xs text-muted-foreground">
                {KIND_META[addKind as Kind].description}{" "}
                <code className="rounded bg-muted px-1">{KIND_META[addKind as Kind].cron}</code>
              </p>
            )}
          </div>
          <DialogFooter>
            <button
              onClick={() => setAddOpen(false)}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
            >
              Cancel
            </button>
            <button
              disabled={!addKind || createMut.isPending}
              onClick={() => {
                if (!addKind) return;
                createMut.mutate(addKind as Kind, {
                  onSuccess: () => setAddOpen(false),
                });
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Create workflow
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit automation</DialogTitle>
            <DialogDescription>Rename this workflow or change its cron schedule.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 py-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Name</label>
                <input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Cron schedule</label>
                <input
                  value={editing.cron}
                  onChange={(e) => setEditing({ ...editing, cron: e.target.value })}
                  placeholder="0 */6 * * *"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Standard 5-field cron. Examples: <code>*/15 * * * *</code>, <code>0 9 * * 1</code>.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <button
              onClick={() => setEditing(null)}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
            >
              Cancel
            </button>
            <button
              disabled={!editing?.name.trim() || !editing?.cron.trim() || editMut.isPending}
              onClick={() => {
                if (!editing) return;
                editMut.mutate(
                  { id: editing.id, name: editing.name.trim(), cron: editing.cron.trim() },
                  { onSuccess: () => setEditing(null) },
                );
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {editMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
              Save changes
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete automation?</DialogTitle>
            <DialogDescription>
              This permanently removes <span className="font-medium text-foreground">{confirmDelete?.name}</span> and stops its schedule. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setConfirmDelete(null)}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
            >
              Cancel
            </button>
            <button
              disabled={deleteMut.isPending}
              onClick={() => {
                if (!confirmDelete) return;
                deleteMut.mutate(confirmDelete.id, {
                  onSuccess: () => setConfirmDelete(null),
                });
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-50"
            >
              {deleteMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}

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

function SkeletonRow() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/50" />
      ))}
    </div>
  );
}
