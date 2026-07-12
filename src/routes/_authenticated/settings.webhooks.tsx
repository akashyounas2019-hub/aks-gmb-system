import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Webhook,
  Plus,
  Play,
  Pause,
  Trash2,
  Copy,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Workflow,
  ExternalLink,
  Activity,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/webhooks")({
  component: WebhooksPage,
});

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type WebhookEvent =
  | "post.published"
  | "post.scheduled"
  | "image.uploaded"
  | "image.tagged"
  | "competitor.threat"
  | "rank.changed"
  | "keyword.added"
  | "video.processed";

const EVENT_OPTIONS: { id: WebhookEvent; label: string; description: string }[] = [
  { id: "post.published", label: "post.published", description: "A GMB post was published." },
  { id: "post.scheduled", label: "post.scheduled", description: "A post was queued in the calendar." },
  { id: "image.uploaded", label: "image.uploaded", description: "A new image was uploaded." },
  { id: "image.tagged", label: "image.tagged", description: "An image received GPS coordinates." },
  { id: "competitor.threat", label: "competitor.threat", description: "A competitor crossed the threat threshold." },
  { id: "rank.changed", label: "rank.changed", description: "A tracked keyword rank moved." },
  { id: "keyword.added", label: "keyword.added", description: "New keyword added to the library." },
  { id: "video.processed", label: "video.processed", description: "Video processing finished." },
];

type WebhookRow = {
  id: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  headerName?: string;
  headerValue?: string;
  enabled: boolean;
  createdAt: string;
  lastDeliveryAt?: string;
  lastStatus?: number | null;
  deliveries: number;
};

type Delivery = {
  id: string;
  webhookId: string;
  webhookName: string;
  event: WebhookEvent | "test.ping";
  status: "success" | "error";
  statusCode: number;
  message?: string;
  at: string;
};

type N8nPipeline = {
  id: string;
  name: string;
  triggerEvent: WebhookEvent | "manual";
  webhookUrl: string;
  description?: string;
  enabled: boolean;
  createdAt: string;
  lastRunAt?: string;
  runs: number;
};

const WEBHOOKS_KEY = "app.webhooks.v1";
const DELIVERIES_KEY = "app.webhooks.deliveries.v1";
const PIPELINES_KEY = "app.n8n.pipelines.v1";

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

function WebhooksPage() {
  const [tab, setTab] = useState<"webhooks" | "pipelines" | "activity">("webhooks");
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([]);
  const [pipelines, setPipelines] = useState<N8nPipeline[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [editing, setEditing] = useState<WebhookRow | null>(null);
  const [showPipelineModal, setShowPipelineModal] = useState(false);
  const [editingPipeline, setEditingPipeline] = useState<N8nPipeline | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    try {
      const w = localStorage.getItem(WEBHOOKS_KEY);
      const d = localStorage.getItem(DELIVERIES_KEY);
      const p = localStorage.getItem(PIPELINES_KEY);
      if (w) setWebhooks(JSON.parse(w));
      if (d) setDeliveries(JSON.parse(d));
      if (p) setPipelines(JSON.parse(p));
    } catch {
      /* noop */
    }
  }, []);
  useEffect(() => localStorage.setItem(WEBHOOKS_KEY, JSON.stringify(webhooks)), [webhooks]);
  useEffect(
    () => localStorage.setItem(DELIVERIES_KEY, JSON.stringify(deliveries.slice(0, 80))),
    [deliveries],
  );
  useEffect(() => localStorage.setItem(PIPELINES_KEY, JSON.stringify(pipelines)), [pipelines]);

  const stats = {
    hooks: webhooks.length,
    active: webhooks.filter((w) => w.enabled).length,
    pipelines: pipelines.length,
    failures: deliveries.filter((d) => d.status === "error").length,
  };

  function upsertWebhook(row: WebhookRow) {
    setWebhooks((prev) => {
      const exists = prev.some((w) => w.id === row.id);
      return exists ? prev.map((w) => (w.id === row.id ? row : w)) : [row, ...prev];
    });
  }

  function removeWebhook(id: string) {
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
  }

  function upsertPipeline(row: N8nPipeline) {
    setPipelines((prev) => {
      const exists = prev.some((p) => p.id === row.id);
      return exists ? prev.map((p) => (p.id === row.id ? row : p)) : [row, ...prev];
    });
  }

  function removePipeline(id: string) {
    setPipelines((prev) => prev.filter((p) => p.id !== id));
  }

  async function sendTest(row: WebhookRow) {
    if (!row.url) return;
    const payload = {
      event: "test.ping",
      webhookId: row.id,
      webhookName: row.name,
      sentAt: new Date().toISOString(),
    };
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (row.headerName && row.headerValue) headers[row.headerName] = row.headerValue;
      const res = await fetch(row.url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      recordDelivery(row, "test.ping", res.ok ? "success" : "error", res.status);
      setWebhooks((prev) =>
        prev.map((w) =>
          w.id === row.id
            ? {
                ...w,
                lastDeliveryAt: new Date().toISOString(),
                lastStatus: res.status,
                deliveries: w.deliveries + 1,
              }
            : w,
        ),
      );
      if (res.ok) toast.success(`Delivered to ${row.name}`);
      else toast.error(`${row.name} responded ${res.status}`);
    } catch (err) {
      recordDelivery(row, "test.ping", "error", 0, (err as Error).message);
      toast.error((err as Error).message);
    }
  }

  async function runPipeline(pipe: N8nPipeline) {
    if (!pipe.webhookUrl) return;
    try {
      const res = await fetch(pipe.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: pipe.triggerEvent,
          pipeline: pipe.name,
          triggeredAt: new Date().toISOString(),
          manual: true,
        }),
      });
      setPipelines((prev) =>
        prev.map((p) =>
          p.id === pipe.id
            ? { ...p, lastRunAt: new Date().toISOString(), runs: p.runs + 1 }
            : p,
        ),
      );
      if (res.ok) toast.success(`Ran ${pipe.name}`);
      else toast.error(`n8n responded ${res.status}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function recordDelivery(
    row: WebhookRow,
    event: WebhookEvent | "test.ping",
    status: "success" | "error",
    statusCode: number,
    message?: string,
  ) {
    setDeliveries((prev) =>
      [
        {
          id: crypto.randomUUID(),
          webhookId: row.id,
          webhookName: row.name,
          event,
          status,
          statusCode,
          message,
          at: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 80),
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Webhooks & Automation Pipelines</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure outbound webhooks for app events and manage n8n workflow pipelines that
            react to them.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatChip label="Webhooks" value={stats.hooks} />
          <StatChip label="Active" value={stats.active} tone="primary" />
          <StatChip label="Pipelines" value={stats.pipelines} tone="success" />
          <StatChip label="Failures" value={stats.failures} tone={stats.failures ? "danger" : undefined} />
        </div>
      </header>

      {/* sub-tabs */}
      <div className="border-b border-border">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {(
            [
              { id: "webhooks", label: "Webhooks", icon: Webhook },
              { id: "pipelines", label: "n8n Pipelines", icon: Workflow },
              { id: "activity", label: "Delivery log", icon: Activity },
            ] as const
          ).map((t) => {
            const active = tab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition ${
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

      {/* ---------------- WEBHOOKS ---------------- */}
      {tab === "webhooks" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Send HTTP POST requests to your endpoints when app events fire.
            </p>
            <button
              onClick={() =>
                setEditing({
                  id: crypto.randomUUID(),
                  name: "",
                  url: "",
                  events: [],
                  enabled: true,
                  createdAt: new Date().toISOString(),
                  deliveries: 0,
                })
              }
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Add webhook
            </button>
          </div>

          {webhooks.length === 0 ? (
            <EmptyState
              icon={Webhook}
              title="No webhooks yet"
              hint="Create your first webhook to start forwarding events to external systems."
            />
          ) : (
            <div className="space-y-2">
              {webhooks.map((w) => (
                <div
                  key={w.id}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                    <Webhook className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-medium">{w.name || "Untitled webhook"}</div>
                      {w.enabled ? (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                          Active
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Paused
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                      {w.url || "—"}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {w.events.length === 0 && (
                        <span className="text-[10px] text-muted-foreground">No events selected</span>
                      )}
                      {w.events.map((e) => (
                        <span
                          key={e}
                          className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {e}
                        </span>
                      ))}
                    </div>
                    <div className="mt-1 flex gap-3 text-[11px] text-muted-foreground">
                      <span>{w.deliveries} deliveries</span>
                      {w.lastDeliveryAt && (
                        <span>Last: {new Date(w.lastDeliveryAt).toLocaleString()}</span>
                      )}
                      {typeof w.lastStatus === "number" && (
                        <span
                          className={
                            w.lastStatus >= 200 && w.lastStatus < 300
                              ? "text-emerald-500"
                              : "text-destructive"
                          }
                        >
                          HTTP {w.lastStatus}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(w.url);
                        setCopied(w.id);
                        setTimeout(() => setCopied(null), 1000);
                      }}
                      className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent"
                      title="Copy URL"
                    >
                      {copied === w.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => sendTest(w)}
                      disabled={!w.url}
                      className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-40"
                    >
                      Test
                    </button>
                    <button
                      onClick={() => setEditing(w)}
                      className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() =>
                        upsertWebhook({ ...w, enabled: !w.enabled })
                      }
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
                        w.enabled
                          ? "bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25"
                          : "border border-border text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {w.enabled ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                      {w.enabled ? "Pause" : "Enable"}
                    </button>
                    <button
                      onClick={() => removeWebhook(w.id)}
                      className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ---------------- N8N PIPELINES ---------------- */}
      {tab === "pipelines" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Link individual n8n workflows to app events. Each pipeline hits a distinct{" "}
              <span className="font-mono">Webhook</span> node in n8n.
            </p>
            <div className="flex gap-2">
              <a
                href="https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs hover:bg-accent"
              >
                n8n docs <ExternalLink className="h-3 w-3" />
              </a>
              <button
                onClick={() => {
                  setEditingPipeline({
                    id: crypto.randomUUID(),
                    name: "",
                    triggerEvent: "post.published",
                    webhookUrl: "",
                    enabled: true,
                    createdAt: new Date().toISOString(),
                    runs: 0,
                  });
                  setShowPipelineModal(true);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> New pipeline
              </button>
            </div>
          </div>

          {pipelines.length === 0 ? (
            <EmptyState
              icon={Workflow}
              title="No n8n pipelines yet"
              hint="Connect an n8n Webhook node to react to app events like post.published or competitor.threat."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {pipelines.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-violet-500/15 text-violet-500">
                      <Workflow className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-medium">
                          {p.name || "Untitled pipeline"}
                        </div>
                        {p.enabled ? (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                            Active
                          </span>
                        ) : (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            Paused
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Trigger:{" "}
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                          {p.triggerEvent}
                        </span>
                      </div>
                      {p.description && (
                        <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="truncate rounded-md bg-muted/40 px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                    {p.webhookUrl || "No webhook URL"}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{p.runs} runs</span>
                    {p.lastRunAt && <span>Last: {new Date(p.lastRunAt).toLocaleString()}</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => runPipeline(p)}
                      disabled={!p.webhookUrl}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-40"
                    >
                      <Play className="h-3 w-3" /> Run now
                    </button>
                    <button
                      onClick={() => {
                        setEditingPipeline(p);
                        setShowPipelineModal(true);
                      }}
                      className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => upsertPipeline({ ...p, enabled: !p.enabled })}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
                        p.enabled
                          ? "bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25"
                          : "border border-border text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {p.enabled ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                      {p.enabled ? "Pause" : "Enable"}
                    </button>
                    <button
                      onClick={() => removePipeline(p.id)}
                      className="ml-auto rounded-md border border-border p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ---------------- ACTIVITY ---------------- */}
      {tab === "activity" && (
        <section className="space-y-2">
          {deliveries.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No deliveries yet"
              hint="Send a test payload from any webhook to populate this log."
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-widest text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Webhook</th>
                    <th className="px-3 py-2 text-left">Event</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">When</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((d) => (
                    <tr key={d.id} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{d.webhookName}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {d.event}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ${
                            d.status === "success"
                              ? "bg-emerald-500/15 text-emerald-500"
                              : "bg-destructive/15 text-destructive"
                          }`}
                        >
                          {d.status === "success" ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <AlertCircle className="h-3 w-3" />
                          )}
                          {d.statusCode || "ERR"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {new Date(d.at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Webhook edit modal */}
      {editing && (
        <WebhookModal
          row={editing}
          onClose={() => setEditing(null)}
          onSave={(row) => {
            upsertWebhook(row);
            setEditing(null);
            toast.success("Webhook saved");
          }}
        />
      )}

      {/* Pipeline modal */}
      {showPipelineModal && editingPipeline && (
        <PipelineModal
          row={editingPipeline}
          onClose={() => {
            setShowPipelineModal(false);
            setEditingPipeline(null);
          }}
          onSave={(row) => {
            upsertPipeline(row);
            setShowPipelineModal(false);
            setEditingPipeline(null);
            toast.success("Pipeline saved");
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Modals                                                                     */
/* -------------------------------------------------------------------------- */

function WebhookModal({
  row,
  onClose,
  onSave,
}: {
  row: WebhookRow;
  onClose: () => void;
  onSave: (row: WebhookRow) => void;
}) {
  const [draft, setDraft] = useState<WebhookRow>(row);
  const [showToken, setShowToken] = useState(false);

  const toggleEvent = (e: WebhookEvent) =>
    setDraft((d) => ({
      ...d,
      events: d.events.includes(e) ? d.events.filter((x) => x !== e) : [...d.events, e],
    }));

  const canSave = draft.name.trim() && /^https?:\/\//i.test(draft.url);

  return (
    <ModalShell title={row.deliveries > 0 ? "Edit webhook" : "New webhook"} onClose={onClose}>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium">Name</span>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Slack notifier"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium">Endpoint URL</span>
          <input
            value={draft.url}
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
            placeholder="https://hooks.example.com/…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
          />
        </label>

        <div>
          <div className="mb-2 text-xs font-medium">Subscribed events</div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {EVENT_OPTIONS.map((e) => {
              const on = draft.events.includes(e.id);
              return (
                <button
                  type="button"
                  key={e.id}
                  onClick={() => toggleEvent(e.id)}
                  className={`flex items-start gap-2 rounded-md border p-2 text-left text-xs transition ${
                    on
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  <span
                    className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded ${
                      on ? "bg-primary text-primary-foreground" : "border border-border"
                    }`}
                  >
                    {on && <Check className="h-3 w-3" />}
                  </span>
                  <span>
                    <span className="block font-mono font-medium">{e.label}</span>
                    <span className="block text-[10px] text-muted-foreground">{e.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Auth header (optional)</span>
            <input
              value={draft.headerName ?? ""}
              onChange={(e) => setDraft({ ...draft, headerName: e.target.value })}
              placeholder="X-Signature"
              className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Auth token (optional)</span>
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                value={draft.headerValue ?? ""}
                onChange={(e) => setDraft({ ...draft, headerValue: e.target.value })}
                placeholder="••••••••"
                className="w-full rounded-md border border-input bg-background px-3 py-2 pr-9 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent"
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>
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
          onClick={() => onSave(draft)}
          disabled={!canSave}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          Save webhook
        </button>
      </div>
    </ModalShell>
  );
}

function PipelineModal({
  row,
  onClose,
  onSave,
}: {
  row: N8nPipeline;
  onClose: () => void;
  onSave: (row: N8nPipeline) => void;
}) {
  const [draft, setDraft] = useState<N8nPipeline>(row);
  const canSave = draft.name.trim() && /^https?:\/\//i.test(draft.webhookUrl);

  const triggerOptions = useMemo(
    () => [{ id: "manual" as const, label: "Manual only" }, ...EVENT_OPTIONS.map((e) => ({ id: e.id, label: e.label }))],
    [],
  );

  return (
    <ModalShell title={row.runs > 0 ? "Edit pipeline" : "New n8n pipeline"} onClose={onClose}>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium">Name</span>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Publish digest to Slack"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium">n8n Webhook URL</span>
          <input
            value={draft.webhookUrl}
            onChange={(e) => setDraft({ ...draft, webhookUrl: e.target.value })}
            placeholder="https://your-n8n.example.com/webhook/…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium">Trigger event</span>
          <select
            value={draft.triggerEvent}
            onChange={(e) =>
              setDraft({ ...draft, triggerEvent: e.target.value as N8nPipeline["triggerEvent"] })
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {triggerOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium">Description (optional)</span>
          <textarea
            value={draft.description ?? ""}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            rows={2}
            placeholder="What does this workflow do?"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(draft)}
          disabled={!canSave}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          Save pipeline
        </button>
      </div>
    </ModalShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Bits                                                                       */
/* -------------------------------------------------------------------------- */

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
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
          <h3 className="font-display text-lg">{title}</h3>
          <button
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: typeof Webhook;
  title: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-10 text-center">
      <Icon className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
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
