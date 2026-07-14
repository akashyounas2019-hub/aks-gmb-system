import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bot,
  Crown,
  PenSquare,
  BarChart3,
  ShieldCheck,
  TrendingUp,
  Plus,
  Sparkles,
  Activity,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Cpu,
  Zap,
  ChevronRight,
  Loader2,
  Send,
  Rocket,
  Flag,
  Pause,
  Play,
  XCircle,
  Bell,
  Check,
  CheckCheck,
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
  approveTask as approveTaskFn,
  assignTask as assignTaskFn,
  cancelTask as cancelTaskFn,
  createAgent as createAgentFn,
  getAgentsState,
  getTaskEvents as getTaskEventsFn,
  listAgentNotifications as listAgentNotificationsFn,
  markAgentNotificationRead as markAgentNotificationReadFn,
  markAllAgentNotificationsRead as markAllAgentNotificationsReadFn,
  pauseTask as pauseTaskFn,
  rejectTask as rejectTaskFn,
  resumeTask as resumeTaskFn,
  updateTaskProgress as updateTaskProgressFn,
} from "@/lib/agents.functions";

export const Route = createFileRoute("/_authenticated/agents")({
  component: AgentsPage,
  head: () => ({
    meta: [
      { title: "Agents — Autonomous GMB Team" },
      {
        name: "description",
        content:
          "Hierarchical AI agent team: a GMB Leader coordinates specialist sub-agents to grow your local rankings.",
      },
    ],
  }),
});

type AgentStatus = "online" | "working" | "idle" | "review";
type AgentRow = {
  id: string;
  name: string;
  role: string;
  scope: string;
  icon_key: string;
  tone: string;
  glow: string;
  status: string;
  load: number;
  tasks_today: number;
  success_rate: number;
  parent_id: string | null;
  last_activity: string;
};
type TaskRow = {
  id: string;
  agent_id: string;
  title: string;
  status: string;
  major: boolean;
  relative_time: string;
  progress?: number;
  priority?: string;
  started_at?: string | null;
  paused_at?: string | null;
  eta_at?: string | null;
  eta_confidence?: string | null;
};

import agentLeaderImg from "@/assets/agent-leader.png";
import agentWriterImg from "@/assets/agent-writer.png";
import agentAnalyzerImg from "@/assets/agent-analyzer.png";

const iconMap: Record<string, typeof Bot> = {
  crown: Crown,
  pen: PenSquare,
  chart: BarChart3,
  shield: ShieldCheck,
  trending: TrendingUp,
  bot: Bot,
};

// Refined portrait for select agents — falls back to the lucide icon when absent.
const agentImageMap: Record<string, string> = {
  crown: agentLeaderImg,
  pen: agentWriterImg,
  chart: agentAnalyzerImg,
};

const roleToIconKey: Record<string, string> = {
  writer: "pen",
  analyzer: "chart",
  auditor: "shield",
  ranker: "trending",
  generalist: "bot",
};
const roleToTone: Record<string, string> = {
  writer: "from-violet-400 to-fuchsia-500",
  analyzer: "from-sky-400 to-cyan-500",
  auditor: "from-emerald-400 to-teal-500",
  ranker: "from-rose-400 to-pink-500",
  generalist: "from-indigo-400 to-purple-500",
};

const statusMeta: Record<AgentStatus, { label: string; dot: string; ring: string }> = {
  online: { label: "Online", dot: "bg-emerald-400", ring: "ring-emerald-400/40" },
  working: { label: "Working", dot: "bg-sky-400 animate-pulse", ring: "ring-sky-400/40" },
  idle: { label: "Idle", dot: "bg-muted-foreground", ring: "ring-border" },
  review: { label: "Needs review", dot: "bg-amber-400 animate-pulse", ring: "ring-amber-400/40" },
};

function normalizeStatus(s: string): AgentStatus {
  return (["online", "working", "idle", "review"].includes(s) ? s : "idle") as AgentStatus;
}

function formatEta(etaIso: string | null | undefined): string {
  if (!etaIso) return "ETA — gathering data…";
  const target = new Date(etaIso).getTime();
  if (!Number.isFinite(target)) return "ETA — gathering data…";
  const diff = target - Date.now();
  if (diff <= 0) return "ETA any moment";
  const s = Math.round(diff / 1000);
  if (s < 60) return `ETA in ~${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `ETA in ~${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `ETA in ~${h}h ${rm}m` : `ETA in ~${h}h`;
}

function timelineMeta(type: string): { color: string; Icon: typeof Bot; label: string } {
  switch (type) {
    case "assigned":
      return { color: "bg-primary", Icon: Send, label: "Assigned" };
    case "progress":
      return { color: "bg-sky-500", Icon: Activity, label: "Progress" };
    case "paused":
      return { color: "bg-amber-500", Icon: Pause, label: "Paused" };
    case "resumed":
      return { color: "bg-sky-500", Icon: Play, label: "Resumed" };
    case "cancelled":
      return { color: "bg-rose-500", Icon: XCircle, label: "Cancelled" };
    case "completed":
      return { color: "bg-emerald-500", Icon: CheckCircle2, label: "Completed" };
    case "approved":
      return { color: "bg-emerald-500", Icon: CheckCircle2, label: "Approved" };
    case "rejected":
      return { color: "bg-rose-500", Icon: XCircle, label: "Rejected" };
    case "awaiting_approval":
      return { color: "bg-amber-500", Icon: Flag, label: "Awaiting approval" };
    default:
      return { color: "bg-muted-foreground", Icon: Activity, label: type };
  }
}

function AgentsPage() {
  const qc = useQueryClient();
  const fetchState = useServerFn(getAgentsState);
  const createAgent = useServerFn(createAgentFn);
  const approveTask = useServerFn(approveTaskFn);
  const rejectTask = useServerFn(rejectTaskFn);
  const assignTask = useServerFn(assignTaskFn);
  const updateTaskProgress = useServerFn(updateTaskProgressFn);
  const pauseTask = useServerFn(pauseTaskFn);
  const resumeTask = useServerFn(resumeTaskFn);
  const cancelTask = useServerFn(cancelTaskFn);
  const fetchEvents = useServerFn(getTaskEventsFn);
  const fetchNotifications = useServerFn(listAgentNotificationsFn);
  const markNotifRead = useServerFn(markAgentNotificationReadFn);
  const markAllNotifRead = useServerFn(markAllAgentNotificationsReadFn);

  const { data, isLoading } = useQuery({
    queryKey: ["agents-state"],
    queryFn: () => fetchState(),
  });

  const agents: AgentRow[] = data?.agents ?? [];
  const tasks: TaskRow[] = data?.tasks ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newAgent, setNewAgent] = useState<{ name: string; role: string; parentId: string; scope: string }>({
    name: "",
    role: "writer",
    parentId: "",
    scope: "",
  });
  const [assign, setAssign] = useState<{
    agent_id: string;
    title: string;
    priority: "low" | "normal" | "high";
    major: boolean;
  }>({ agent_id: "", title: "", priority: "normal", major: false });

  const leader = agents.find((a) => a.parent_id === null) ?? agents[0];
  const subAgents = leader ? agents.filter((a) => a.parent_id === leader.id) : [];
  const selected = agents.find((a) => a.id === selectedId) ?? leader;
  const pendingApprovals = tasks.filter((t) => t.status === "awaiting_approval");
  const isLeaderSelected = !!selected && selected.parent_id === null;

  const eventsKey = ["task-events", isLeaderSelected ? "team" : selected?.id ?? "team"] as const;
  const { data: events = [] } = useQuery({
    queryKey: [...eventsKey],
    queryFn: () =>
      fetchEvents({
        data:
          isLeaderSelected || !selected
            ? { limit: 100 }
            : { agent_id: selected.id, limit: 100 },
      }),
    enabled: !!selected,
  });

  type NotifRow = {
    id: string;
    agent_id: string;
    related_agent_id: string | null;
    task_id: string | null;
    kind: string;
    title: string;
    message: string;
    read_at: string | null;
    created_at: string;
  };
  const notifKey = ["agent-notifications", isLeaderSelected ? "team" : selected?.id ?? "team"] as const;
  const { data: notifications = [] } = useQuery<NotifRow[]>({
    queryKey: [...notifKey],
    queryFn: () =>
      fetchNotifications({
        data:
          isLeaderSelected || !selected
            ? { limit: 50 }
            : { agent_id: selected.id, limit: 50 },
      }) as Promise<NotifRow[]>,
    enabled: !!selected,
    refetchInterval: 30_000,
  });
  const unreadNotifs = notifications.filter((n) => !n.read_at).length;

  const markOneNotif = useMutation({
    mutationFn: (id: string) => markNotifRead({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-notifications"] }),
  });
  const markAllNotifs = useMutation({
    mutationFn: () =>
      markAllNotifRead({
        data: isLeaderSelected || !selected ? {} : { agent_id: selected.id },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-notifications"] }),
  });

  const teamStats = useMemo(() => {
    if (agents.length === 0) return { avgLoad: 0, active: 0, success: 0, total: 0 };
    const avgLoad = Math.round(agents.reduce((s, a) => s + a.load, 0) / agents.length);
    const active = agents.filter((a) => a.status === "working" || a.status === "online").length;
    const success = Math.round(agents.reduce((s, a) => s + a.success_rate, 0) / agents.length);
    return { avgLoad, active, success, total: agents.length };
  }, [agents]);

  const approveMut = useMutation({
    mutationFn: (id: string) => approveTask({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents-state"] }); qc.invalidateQueries({ queryKey: ["task-events"] }); qc.invalidateQueries({ queryKey: ["agent-notifications"] });
      toast.success("Major task approved. Leader dispatching to sub-agent.");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to approve."),
  });
  const rejectMut = useMutation({
    mutationFn: (id: string) => rejectTask({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents-state"] }); qc.invalidateQueries({ queryKey: ["task-events"] }); qc.invalidateQueries({ queryKey: ["agent-notifications"] });
      toast.message("Task rejected.");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to reject."),
  });
  const createMut = useMutation({
    mutationFn: (input: { name: string; role: string; parent_id: string; scope?: string }) =>
      createAgent({
        data: {
          name: input.name,
          role: input.role,
          parent_id: input.parent_id,
          icon_key: roleToIconKey[input.role] ?? "bot",
          tone: roleToTone[input.role] ?? "from-indigo-400 to-purple-500",
          scope: input.scope,
        },
      }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["agents-state"] }); qc.invalidateQueries({ queryKey: ["task-events"] }); qc.invalidateQueries({ queryKey: ["agent-notifications"] });
      setAddOpen(false);
      setNewAgent({ name: "", role: "writer", parentId: leader?.id ?? "", scope: "" });
      toast.success(`${row?.name ?? "Agent"} joined the team.`);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to spawn agent."),
  });

  const assignMut = useMutation({
    mutationFn: (input: {
      agent_id: string;
      title: string;
      priority: "low" | "normal" | "high";
      major: boolean;
    }) => assignTask({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents-state"] }); qc.invalidateQueries({ queryKey: ["task-events"] }); qc.invalidateQueries({ queryKey: ["agent-notifications"] });
      setAssign((p) => ({ ...p, title: "" }));
      toast.success("Task launched. Progress will update in the queue.");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to assign task."),
  });
  const progressMut = useMutation({
    mutationFn: (input: { id: string; progress?: number; status?: "running" | "done" }) =>
      updateTaskProgress({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents-state"] });
      qc.invalidateQueries({ queryKey: ["task-events"] }); qc.invalidateQueries({ queryKey: ["agent-notifications"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to update progress."),
  });
  const pauseMut = useMutation({
    mutationFn: (id: string) => pauseTask({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents-state"] }); qc.invalidateQueries({ queryKey: ["task-events"] }); qc.invalidateQueries({ queryKey: ["agent-notifications"] });
      toast.message("Task paused.");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to pause."),
  });
  const resumeMut = useMutation({
    mutationFn: (id: string) => resumeTask({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents-state"] }); qc.invalidateQueries({ queryKey: ["task-events"] }); qc.invalidateQueries({ queryKey: ["agent-notifications"] });
      toast.success("Task resumed.");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to resume."),
  });
  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelTask({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents-state"] }); qc.invalidateQueries({ queryKey: ["task-events"] }); qc.invalidateQueries({ queryKey: ["agent-notifications"] });
      toast.message("Task cancelled.");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to cancel."),
  });

  function handleCreate() {
    if (!newAgent.name.trim()) return toast.error("Give the agent a name.");
    const parent = newAgent.parentId || leader?.id;
    if (!parent) return toast.error("Missing parent agent.");
    createMut.mutate({
      name: newAgent.name.trim(),
      role: newAgent.role,
      parent_id: parent,
      scope: newAgent.scope.trim() || undefined,
    });
  }

  function handleAssign() {
    const target = assign.agent_id || subAgents[0]?.id;
    if (!target) return toast.error("No sub-agent available.");
    if (assign.title.trim().length < 2) return toast.error("Describe the task.");
    assignMut.mutate({
      agent_id: target,
      title: assign.title.trim(),
      priority: assign.priority,
      major: assign.major,
    });
  }

  if (isLoading || !leader) {
    return (
      <div className="grid min-h-full place-items-center p-10 text-muted-foreground">
        <div className="inline-flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading agents…
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full flex-col">
      <div className="mx-auto w-full max-w-[1500px] p-6">
        {/* Header — title left, New Agent aligned right */}
        <header className="mb-8 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:items-center">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              <Cpu className="h-3 w-3" /> Autonomous Team
            </div>
            <h1 className="font-display text-3xl leading-tight tracking-tight sm:text-4xl">
              Agents Command Center
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              A hierarchy of specialized AI agents led by GMB Leader. They plan, execute, and self-improve —
              major decisions surface here for your approval.
            </p>
          </div>
          <button
            onClick={() => {
              setNewAgent((p) => ({ ...p, parentId: leader.id }));
              setAddOpen(true);
            }}
            className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm transition hover:border-foreground/40 hover:bg-accent sm:self-center"
          >
            <Plus className="h-4 w-4" /> New Agent
          </button>
        </header>

        {/* Prominent metric cards */}
        <section className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <MetricCard label="Agents" value={teamStats.total} icon={Bot} />
          <MetricCard label="Active" value={teamStats.active} icon={Activity} />
          <MetricCard label="Avg load" value={`${teamStats.avgLoad}%`} icon={Zap} bar={teamStats.avgLoad} />
          <MetricCard label="Success" value={`${teamStats.success}%`} icon={CheckCircle2} bar={teamStats.success} />
        </section>


        <section className="mb-8 rounded-2xl border border-border/60 bg-card/60 p-8 backdrop-blur-sm">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-display text-lg tracking-tight">Team hierarchy</h2>
            <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Live topology</span>
          </div>

          <div className="flex flex-col items-center">
            <AgentNode agent={leader} selected={(selected?.id ?? leader.id) === leader.id} onClick={() => setSelectedId(leader.id)} size="lg" />

            <div className="relative h-14 w-full">
              <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="wire" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.05" />
                  </linearGradient>
                </defs>
                <line x1="50%" y1="0" x2="50%" y2="50%" stroke="url(#wire)" strokeWidth="2" />
                {subAgents.length > 0 && (
                  <line
                    x1={`${100 / (subAgents.length * 2)}%`}
                    y1="50%"
                    x2={`${100 - 100 / (subAgents.length * 2)}%`}
                    y2="50%"
                    stroke="url(#wire)"
                    strokeWidth="2"
                  />
                )}
                {subAgents.map((_, i) => {
                  const x = `${(100 / subAgents.length) * (i + 0.5)}%`;
                  return <line key={i} x1={x} y1="50%" x2={x} y2="100%" stroke="url(#wire)" strokeWidth="2" />;
                })}
              </svg>
            </div>

            <div
              className="grid w-full gap-4"
              style={{ gridTemplateColumns: `repeat(${Math.max(subAgents.length, 1)}, minmax(0, 1fr))` }}
            >
              {subAgents.map((a) => (
                <AgentNode key={a.id} agent={a} selected={selected?.id === a.id} onClick={() => setSelectedId(a.id)} />
              ))}
            </div>
          </div>
        </section>

        {/* Task assignment panel — Leader dispatches jobs */}
        <section className="mb-8 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card/60 to-card/40 p-6 backdrop-blur-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-[0_10px_30px_-10px_rgba(251,191,36,0.6)]">
                <Crown className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="font-display text-lg tracking-tight">Assign a task</h2>
                <p className="text-xs text-muted-foreground">
                  Leader delegates to any sub-agent. Major tasks require your approval before running.
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary">
              <Rocket className="h-3 w-3" /> Dispatch center
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_0.9fr_auto]">
            <div className="md:col-span-1">
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Task
              </label>
              <input
                value={assign.title}
                onChange={(e) => setAssign((p) => ({ ...p, title: e.target.value }))}
                placeholder="e.g. Publish 3 review-response templates"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Assign to
              </label>
              <Select
                value={assign.agent_id || subAgents[0]?.id || ""}
                onValueChange={(v) => setAssign((p) => ({ ...p, agent_id: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
                <SelectContent>
                  {subAgents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Priority
              </label>
              <Select
                value={assign.priority}
                onValueChange={(v) => setAssign((p) => ({ ...p, priority: v as "low" | "normal" | "high" }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <button
                onClick={handleAssign}
                disabled={assignMut.isPending}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-gradient-to-b from-primary to-primary/80 px-4 text-xs font-semibold text-primary-foreground shadow-[0_6px_20px_-8px_hsl(var(--primary)/0.6)] hover:brightness-110 disabled:opacity-60"
              >
                {assignMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Launch
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={assign.major}
                onChange={(e) => setAssign((p) => ({ ...p, major: e.target.checked }))}
                className="h-3.5 w-3.5 rounded border-border accent-amber-500"
              />
              <Flag className="h-3 w-3 text-amber-400" /> Major task (requires approval)
            </label>
            <span className="text-[11px] text-muted-foreground/70">
              {subAgents.length} sub-agent{subAgents.length === 1 ? "" : "s"} available · Leader will queue &amp; monitor
            </span>
          </div>

          {/* In-flight tasks with progress */}
          {(() => {
            const active = tasks.filter((t) => t.status === "running" || t.status === "paused");
            if (active.length === 0) return null;
            return (
              <div className="mt-6 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  In flight ({active.length})
                </div>
                <ul className="grid gap-2 md:grid-cols-2">
                  {active.map((t) => {
                    const a = agents.find((x) => x.id === t.agent_id);
                    const p = Math.max(0, Math.min(100, t.progress ?? 0));
                    const paused = t.status === "paused";
                    const busy =
                      progressMut.isPending ||
                      pauseMut.isPending ||
                      resumeMut.isPending ||
                      cancelMut.isPending;
                    return (
                      <li
                        key={t.id}
                        className={`rounded-xl border p-3 ${paused ? "border-amber-400/40 bg-amber-400/5" : "border-border/60 bg-card/70"}`}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <div className="truncate text-sm font-medium">{t.title}</div>
                              {paused && (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-400">
                                  <Pause className="h-2.5 w-2.5" /> Paused
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {a?.name} · {t.relative_time}
                              {t.priority && t.priority !== "normal" && (
                                <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${t.priority === "high" ? "bg-rose-400/15 text-rose-400" : "bg-muted text-muted-foreground"}`}>
                                  {t.priority}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className={`shrink-0 text-xs font-semibold tabular-nums ${paused ? "text-amber-400" : "text-primary"}`}>{p}%</span>
                        </div>
                        <div className="mb-1.5 flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {paused ? "Paused — ETA on hold" : formatEta(t.eta_at)}
                          </span>
                          {!paused && t.eta_confidence && (
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                t.eta_confidence === "high"
                                  ? "bg-emerald-400/15 text-emerald-400"
                                  : t.eta_confidence === "medium"
                                    ? "bg-sky-400/15 text-sky-400"
                                    : "bg-muted text-muted-foreground"
                              }`}
                              title="Confidence in the ETA, based on progress and elapsed time"
                            >
                              {t.eta_confidence} confidence
                            </span>
                          )}
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                          <div
                            className={`h-full transition-all ${paused ? "bg-gradient-to-r from-amber-400 to-amber-500/70" : "bg-gradient-to-r from-primary to-primary/70"}`}
                            style={{ width: `${p}%` }}
                          />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <button
                            onClick={() =>
                              progressMut.mutate({ id: t.id, progress: Math.min(100, p + 25) })
                            }
                            disabled={busy || paused}
                            title={paused ? "Resume to continue progress" : "Advance progress"}
                            className="flex-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-50"
                          >
                            +25%
                          </button>
                          {paused ? (
                            <button
                              onClick={() => resumeMut.mutate(t.id)}
                              disabled={busy}
                              className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-sky-500/90 px-2 py-1 text-[11px] font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
                            >
                              <Play className="h-3 w-3" /> Resume
                            </button>
                          ) : (
                            <button
                              onClick={() => pauseMut.mutate(t.id)}
                              disabled={busy}
                              className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-[11px] font-semibold text-amber-400 hover:bg-amber-400/20 disabled:opacity-60"
                            >
                              <Pause className="h-3 w-3" /> Pause
                            </button>
                          )}
                          <button
                            onClick={() => {
                              if (confirm(`Cancel "${t.title}"?`)) cancelMut.mutate(t.id);
                            }}
                            disabled={busy}
                            className="inline-flex items-center justify-center gap-1 rounded-md border border-rose-400/40 bg-rose-400/5 px-2 py-1 text-[11px] font-semibold text-rose-400 hover:bg-rose-400/15 disabled:opacity-60"
                          >
                            <XCircle className="h-3 w-3" /> Cancel
                          </button>
                          {!paused && (
                            <button
                              onClick={() => progressMut.mutate({ id: t.id, progress: 100, status: "done" })}
                              disabled={busy}
                              className="flex-1 rounded-md bg-emerald-500/90 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                            >
                              Complete
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })()}
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-2xl border border-border/60 bg-gradient-to-b from-card/80 to-card/40 p-6 backdrop-blur-sm">
            {selected && (
              <>
                <div className="flex items-start gap-4">
                  <div className={`relative grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br ${selected.tone} ${selected.glow}`}>
                    {(() => {
                      const Icon = iconMap[selected.icon_key] ?? Bot;
                      return <Icon className="h-8 w-8 text-white drop-shadow" />;
                    })()}
                    <span className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full ring-2 ring-card ${statusMeta[normalizeStatus(selected.status)].dot}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-2xl tracking-tight">{selected.name}</h3>
                      {selected.parent_id === null && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                          <Crown className="h-3 w-3" /> Leader
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {selected.role} · {selected.scope}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground/80">
                      Last: <span className="text-foreground/90">{selected.last_activity}</span>
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-3 gap-3">
                  <Metric label="Load" value={`${selected.load}%`} bar={selected.load} />
                  <Metric label="Tasks today" value={selected.tasks_today.toString()} />
                  <Metric label="Success" value={`${selected.success_rate}%`} bar={selected.success_rate} tone="emerald" />
                </div>

                {selected.parent_id === null && (
                  <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
                      <Sparkles className="h-3.5 w-3.5" /> Leader authority
                    </div>
                    <ul className="space-y-1.5 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Assign tasks to any sub-agent</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Spawn new specialist agents</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Autonomous decisions for ranking growth</li>
                      <li className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" /> Major tasks require your approval</li>
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="space-y-6">
            {/* Agent notifications inbox */}
            <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card/60 to-card/40 p-5 backdrop-blur-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="inline-flex items-center gap-2 font-display text-base tracking-tight">
                  <Bell className="h-4 w-4 text-primary" />
                  {isLeaderSelected ? "Team alerts" : `${selected?.name ?? "Agent"} alerts`}
                </h3>
                <div className="flex items-center gap-2">
                  {unreadNotifs > 0 && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      {unreadNotifs} new
                    </span>
                  )}
                  {unreadNotifs > 0 && (
                    <button
                      onClick={() => markAllNotifs.mutate()}
                      disabled={markAllNotifs.isPending}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                    </button>
                  )}
                </div>
              </div>
              {notifications.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/60 bg-background/40 px-4 py-6 text-center text-xs text-muted-foreground">
                  No alerts yet. Assign, complete, or fail a task to see notifications here.
                </p>
              ) : (
                <ul className="max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
                  {notifications.map((n) => {
                    const kindMeta =
                      n.kind === "assigned"
                        ? { color: "bg-primary", Icon: Send }
                        : n.kind === "started"
                          ? { color: "bg-sky-500", Icon: Rocket }
                          : n.kind === "completed"
                            ? { color: "bg-emerald-500", Icon: CheckCircle2 }
                            : { color: "bg-rose-500", Icon: XCircle };
                    const target = agents.find((a) => a.id === n.agent_id);
                    const other = agents.find((a) => a.id === n.related_agent_id);
                    const isUnread = !n.read_at;
                    const ts = n.created_at ? new Date(n.created_at) : null;
                    return (
                      <li
                        key={n.id}
                        className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${isUnread ? "border-primary/30 bg-primary/5" : "border-border/50 bg-background/30"}`}
                      >
                        <span
                          className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${kindMeta.color}`}
                        >
                          <kindMeta.Icon className="h-3 w-3 text-white" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium">{n.title}</span>
                            {isUnread && (
                              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                            )}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">{n.message}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground/70">
                            <span>→ {target?.name ?? "Agent"}</span>
                            {other && <span>· {other.name}</span>}
                            <span className="ml-auto normal-case tracking-normal">
                              {ts ? ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                            </span>
                          </div>
                        </div>
                        {isUnread && (
                          <button
                            onClick={() => markOneNotif.mutate(n.id)}
                            className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                            title="Mark read"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5">

              <div className="mb-3 flex items-center justify-between">
                <h3 className="inline-flex items-center gap-2 font-display text-base tracking-tight">
                  <AlertTriangle className="h-4 w-4 text-amber-400" /> Awaiting approval
                </h3>
                <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                  {pendingApprovals.length}
                </span>
              </div>
              {pendingApprovals.length === 0 ? (
                <p className="text-xs text-muted-foreground">No major decisions pending.</p>
              ) : (
                <ul className="space-y-2">
                  {pendingApprovals.map((t) => {
                    const a = agents.find((x) => x.id === t.agent_id);
                    return (
                      <li key={t.id} className="rounded-lg border border-border/50 bg-card/60 p-3">
                        <div className="mb-1.5 text-xs text-muted-foreground">
                          {a?.name} · {t.relative_time}
                        </div>
                        <div className="mb-2 text-sm">{t.title}</div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => approveMut.mutate(t.id)}
                            disabled={approveMut.isPending}
                            className="flex-1 rounded-md bg-emerald-500/90 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => rejectMut.mutate(t.id)}
                            disabled={rejectMut.isPending}
                            className="flex-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-60"
                          >
                            Reject
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur-sm">
              <h3 className="mb-3 inline-flex items-center gap-2 font-display text-base tracking-tight">
                <Activity className="h-4 w-4 text-primary" /> Live activity
              </h3>
              <ul className="space-y-2">
                {tasks.map((t) => {
                  const a = agents.find((x) => x.id === t.agent_id);
                  return (
                    <li key={t.id} className="flex items-start gap-2 rounded-md p-2 hover:bg-accent/60">
                      <TaskDot status={t.status} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">{t.title}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {a?.name} · {t.relative_time}
                        </div>
                      </div>
                      <ChevronRight className="mt-0.5 h-3.5 w-3.5 text-muted-foreground/50" />
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>

        {/* Task history timeline */}
        <section className="mt-8 rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg tracking-tight">Task history</h2>
              <p className="text-xs text-muted-foreground">
                {isLeaderSelected
                  ? "Every assignment and progress change across the team."
                  : `Timeline for ${selected?.name ?? "agent"}.`}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary">
              <Clock className="h-3 w-3" /> {events.length} event{events.length === 1 ? "" : "s"}
            </span>
          </div>

          {events.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/60 bg-background/40 px-4 py-6 text-center text-xs text-muted-foreground">
              No history yet. Assign a task to start the timeline.
            </p>
          ) : (
            <ol className="relative space-y-3 pl-6">
              <span
                aria-hidden
                className="absolute left-[9px] top-1 bottom-1 w-px bg-gradient-to-b from-primary/40 via-border to-transparent"
              />
              {events.map((ev) => {
                const a = agents.find((x) => x.id === ev.agent_id);
                const { color, Icon, label } = timelineMeta(ev.event_type);
                const ts = ev.created_at ? new Date(ev.created_at) : null;
                return (
                  <li key={ev.id} className="relative">
                    <span
                      className={`absolute -left-[22px] top-1 grid h-4 w-4 place-items-center rounded-full ring-2 ring-card ${color}`}
                    >
                      <Icon className="h-2.5 w-2.5 text-white" />
                    </span>
                    <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                          {label}
                        </span>
                        {a && (
                          <span className="text-[11px] text-muted-foreground/90">
                            {a.name}
                          </span>
                        )}
                        {typeof ev.progress === "number" && (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
                            {ev.progress}%
                          </span>
                        )}
                        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/70">
                          {ts ? ts.toLocaleString() : ""}
                        </span>
                      </div>
                      <div className="mt-0.5 text-sm">{ev.message}</div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>


      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Spawn a new agent</DialogTitle>
            <DialogDescription>
              Leader will onboard the new specialist and begin delegating small tasks.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Agent name</label>
              <input
                value={newAgent.name}
                onChange={(e) => setNewAgent((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. GMB Review Responder"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Specialty</label>
              <Select value={newAgent.role} onValueChange={(v) => setNewAgent((p) => ({ ...p, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="writer">Content Writer</SelectItem>
                  <SelectItem value="analyzer">Analyzer</SelectItem>
                  <SelectItem value="auditor">Auditor</SelectItem>
                  <SelectItem value="ranker">Ranker</SelectItem>
                  <SelectItem value="generalist">Generalist</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Reports to</label>
              <Select
                value={newAgent.parentId || leader.id}
                onValueChange={(v) => setNewAgent((p) => ({ ...p, parentId: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setAddOpen(false)} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={createMut.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {createMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Spawn agent
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AgentNode({
  agent,
  selected,
  onClick,
  size = "md",
}: {
  agent: AgentRow;
  selected: boolean;
  onClick: () => void;
  size?: "md" | "lg";
}) {
  const Icon = iconMap[agent.icon_key] ?? Bot;
  const imgSrc = agentImageMap[agent.icon_key];
  const meta = statusMeta[normalizeStatus(agent.status)];
  const big = size === "lg";
  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col items-center rounded-2xl border bg-card/60 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-foreground/25 hover:bg-card ${
        selected
          ? "border-foreground/40 shadow-[0_0_0_1px_hsl(var(--foreground)/0.15),0_20px_50px_-20px_rgba(0,0,0,0.9)]"
          : "border-border/60"
      } ${big ? "w-[300px]" : "w-full"}`}
    >
      <div className="relative mb-3">
        <div className={`relative grid ${big ? "h-24 w-24" : "h-20 w-20"} place-items-center overflow-hidden rounded-2xl border border-border/70 bg-background/70`}>
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={`${agent.name} portrait`}
              loading="lazy"
              className={`${big ? "h-[92%] w-[92%]" : "h-[88%] w-[88%]"} object-contain`}
            />
          ) : (
            <Icon className={`${big ? "h-10 w-10" : "h-8 w-8"} text-foreground/85`} />
          )}
          <span className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full ring-2 ring-card ${meta.dot}`} />
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {big && <Crown className="h-3.5 w-3.5 text-amber-400" />}
        <h4 className={`font-display tracking-tight ${big ? "text-lg" : "text-sm"}`}>{agent.name}</h4>
      </div>
      <p className="mt-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">{agent.role}</p>

      <div className="mt-3 flex w-full items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium ring-1 ${meta.ring}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" /> {agent.tasks_today}
        </span>
      </div>

      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted/60">
        <div className="h-full rounded-full bg-foreground/70" style={{ width: `${agent.load}%` }} />
      </div>
    </button>
  );
}

function Metric({ label, value, bar, tone }: { label: string; value: string; bar?: number; tone?: "emerald" }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-xl tracking-tight">{value}</div>
      {typeof bar === "number" && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted/60">
          <div className={`h-full ${tone === "emerald" ? "bg-emerald-400" : "bg-primary"}`} style={{ width: `${bar}%` }} />
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  bar,
}: {
  label: string;
  value: number | string;
  icon: typeof Bot;
  bar?: number;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 p-5 transition hover:border-foreground/20 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </div>
        <span className="grid h-9 w-9 place-items-center rounded-xl border border-border/70 bg-background/60 text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-4 font-display text-4xl font-semibold leading-none tracking-tight text-foreground sm:text-5xl">
        {value}
      </div>
      {typeof bar === "number" && (
        <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
          <div className="h-full rounded-full bg-foreground/70" style={{ width: `${Math.max(0, Math.min(100, bar))}%` }} />
        </div>
      )}
    </div>
  );
}


function TaskDot({ status }: { status: string }) {
  if (status === "done") return <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-400" />;
  if (status === "running") return <Activity className="mt-0.5 h-4 w-4 animate-pulse text-sky-400" />;
  if (status === "awaiting_approval") return <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-400" />;
  return <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />;
}
