import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
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
  Clock,
  Loader2,
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

const KIND_META: Record<
  Kind,
  { label: string; description: string; icon: typeof Zap; tone: string; cron: string }
> = {
  rank_refresh: {
    label: "Rank refresh",
    description: "Re-check tracked keywords across your rank source on a schedule.",
    icon: Target,
    tone: "bg-rose-500/15 text-rose-500",
    cron: "0 */6 * * *",
  },
  auto_publish: {
    label: "Auto-publish scheduled posts",
    description: "Publish drafts whose scheduled time has arrived.",
    icon: PenSquare,
    tone: "bg-violet-500/15 text-violet-500",
    cron: "*/15 * * * *",
  },
  auto_tag: {
    label: "Auto-tag new images",
    description: "Sweep untagged uploads and assign the best matching keywords.",
    icon: MapPin,
    tone: "bg-emerald-500/15 text-emerald-500",
    cron: "0 2 * * *",
  },
  alert_scan: {
    label: "Rank alert scan",
    description: "Review rank alerts and notify on threshold breaches.",
    icon: Bell,
    tone: "bg-sky-500/15 text-sky-500",
    cron: "0 8 * * *",
  },
};

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
    mutationFn: (kind: Kind) =>
      createFn({
        data: {
          name: KIND_META[kind].label,
          kind,
          cron: KIND_META[kind].cron,
          config: {},
          enabled: true,
        },
      }),
    onSuccess: () => {
      toast.success("Automation added.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

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

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
            <Zap className="h-3.5 w-3.5" /> Automation
          </div>
          <h1 className="font-display text-3xl leading-tight">Workflows & rules</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Real scheduled workflows backed by <code className="rounded bg-muted px-1">pg_cron</code>.
            Toggle any automation on and it runs on its cron; use “Run now” to trigger immediately.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatChip label="Automations" value={stats.total} />
          <StatChip label="Active" value={stats.active} tone="primary" />
          <StatChip label="Errors" value={stats.errors} tone={stats.errors ? "danger" : undefined} />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {/* Available kinds */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg">Add automation</h2>
              <span className="text-xs text-muted-foreground">4 kinds available</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(KIND_META) as Kind[]).map((kind) => {
                const meta = KIND_META[kind];
                const Icon = meta.icon;
                const installed = items.some((a) => a.kind === kind);
                return (
                  <div
                    key={kind}
                    className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
                  >
                    <div className="flex items-start gap-3">
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${meta.tone}`}>
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
                      className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Your automations */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg">Your automations</h2>
              <span className="text-xs text-muted-foreground">
                {items.length ? `${items.length} configured` : "none yet"}
              </span>
            </div>

            {automations.isLoading ? (
              <SkeletonRow />
            ) : items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                <WorkflowIcon className="mx-auto mb-2 h-8 w-8 opacity-40" />
                Add one of the automation kinds above.
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((a) => {
                  const meta = KIND_META[a.kind as Kind];
                  const Icon = meta?.icon ?? Zap;
                  return (
                    <div
                      key={a.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3"
                    >
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${meta?.tone ?? "bg-muted"}`}>
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
                          onClick={() => deleteMut.mutate(a.id)}
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

        {/* Runs sidebar */}
        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-base">Recent runs</h2>
              <span className="text-xs text-muted-foreground">{(runs.data ?? []).length}</span>
            </div>
            {runs.isLoading ? (
              <SkeletonRow />
            ) : (runs.data ?? []).length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                No runs yet.
              </div>
            ) : (
              <ul className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                {(runs.data ?? []).map((r) => {
                  const parent = items.find((a) => a.id === r.automation_id);
                  return (
                    <li key={r.id} className="flex items-start gap-2 rounded-md p-2 hover:bg-accent">
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
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
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
