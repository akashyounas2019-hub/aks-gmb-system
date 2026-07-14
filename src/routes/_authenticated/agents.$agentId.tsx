import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bot,
  Crown,
  PenSquare,
  BarChart3,
  ShieldCheck,
  TrendingUp,
  Activity,
  CheckCircle2,
  Clock,
  Loader2,
  Save,
  BookOpen,
  Terminal,
  CalendarClock,
  Settings2,
  Brain,
  Plus,
  Trash2,
  ListChecks,
} from "lucide-react";
import {
  getAgentsState,
  getTaskEvents as getTaskEventsFn,
  updateAgent as updateAgentFn,
} from "@/lib/agents.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import agentLeaderImg from "@/assets/agent-leader.png";
import agentWriterImg from "@/assets/agent-writer.png";
import agentAnalyzerImg from "@/assets/agent-analyzer.png";
import agentAuditorImg from "@/assets/agent-auditor.png";
import agentRankerImg from "@/assets/agent-ranker.png";

const iconMap: Record<string, typeof Bot> = {
  crown: Crown,
  pen: PenSquare,
  chart: BarChart3,
  shield: ShieldCheck,
  trending: TrendingUp,
  bot: Bot,
};

const agentImageMap: Record<string, string> = {
  crown: agentLeaderImg,
  pen: agentWriterImg,
  chart: agentAnalyzerImg,
  shield: agentAuditorImg,
  trending: agentRankerImg,
};

const ROLE_COPY: Record<string, { headline: string; blurb: string; skillHint: string }> = {
  leader: {
    headline: "Team Leader",
    blurb: "Orchestrates the squad, dispatches jobs, and enforces quality gates.",
    skillHint: "e.g. Delegation, prioritization, approvals, escalation triage",
  },
  writer: {
    headline: "Content Writer",
    blurb: "Drafts posts, review replies, and long-form GMB copy on brand.",
    skillHint: "e.g. Local SEO copy, review responses, brand voice tuning",
  },
  analyzer: {
    headline: "Insights Analyst",
    blurb: "Reads dashboards, spots trends, and surfaces performance signals.",
    skillHint: "e.g. Rank trend analysis, competitor deltas, weekly briefings",
  },
  auditor: {
    headline: "Profile Auditor",
    blurb: "Scans GMB listings for gaps, inconsistencies, and policy risks.",
    skillHint: "e.g. NAP audits, category checks, photo policy scans",
  },
  ranker: {
    headline: "Rank Optimizer",
    blurb: "Tunes keywords, listings, and geo signals to climb the map pack.",
    skillHint: "e.g. Keyword clustering, geo-grid optimization, citation building",
  },
};

function roleMeta(role: string) {
  return (
    ROLE_COPY[role.toLowerCase()] ?? {
      headline: role.charAt(0).toUpperCase() + role.slice(1),
      blurb: "Autonomous specialist supporting the GMB team.",
      skillHint: "Describe this agent's core competency…",
    }
  );
}

type AgentRow = {
  id: string;
  name: string;
  role: string;
  scope: string;
  icon_key: string;
  status: string;
  load: number;
  tasks_today: number;
  success_rate: number;
  parent_id: string | null;
  last_activity: string;
  main_skill?: string | null;
};

type TaskRow = {
  id: string;
  agent_id: string;
  title: string;
  status: string;
  relative_time: string;
  priority?: string;
};

export const Route = createFileRoute("/_authenticated/agents/$agentId")({
  component: AgentProfilePage,
  head: () => ({
    meta: [
      { title: "Agent profile — Autonomous GMB Team" },
      { name: "description", content: "Agent status, metrics, recent activity, and main-skill configuration." },
    ],
  }),
});

type ScheduledTask = {
  id: string;
  title: string;
  due: string;
  priority: "Low" | "Medium" | "High";
};

type MemoryFact = { id: string; text: string; at: string };

function AgentProfilePage() {
  const { agentId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchState = useServerFn(getAgentsState);
  const fetchEvents = useServerFn(getTaskEventsFn);
  const updateAgent = useServerFn(updateAgentFn);

  const { data, isLoading } = useQuery({
    queryKey: ["agents-state"],
    queryFn: () => fetchState(),
  });

  const agents: AgentRow[] = data?.agents ?? [];
  const tasks: TaskRow[] = data?.tasks ?? [];
  const agent = agents.find((a) => a.id === agentId) ?? null;
  const leader = agents.find((a) => a.parent_id === null);

  const { data: events = [] } = useQuery({
    queryKey: ["task-events", agentId],
    queryFn: () => fetchEvents({ data: { agent_id: agentId, limit: 100 } }),
    enabled: !!agent,
  });

  // Editable / persisted
  const [skill, setSkill] = useState("");
  const [name, setName] = useState("");
  const [scope, setScope] = useState("");

  // Local-only UI state (per-profile mock config the reference shows)
  const [priority, setPriority] = useState<"Low" | "Medium" | "High">("Medium");
  const [model, setModel] = useState("gpt-4o");
  const [autonomy, setAutonomy] = useState(60);
  const [notes, setNotes] = useState("");
  const [longMemory, setLongMemory] = useState("");
  const [factDraft, setFactDraft] = useState("");
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [active, setActive] = useState(true);
  const [autoSchedule, setAutoSchedule] = useState(true);

  const [newTask, setNewTask] = useState<{ title: string; due: string; priority: "Low" | "Medium" | "High" }>({
    title: "",
    due: "",
    priority: "Medium",
  });
  const [scheduled, setScheduled] = useState<ScheduledTask[]>([]);

  useEffect(() => {
    if (!agent) return;
    setSkill(agent.main_skill ?? "");
    setName(agent.name);
    setScope(agent.scope ?? "");
  }, [agent?.id, agent?.main_skill, agent?.name, agent?.scope]);

  const meta = agent ? roleMeta(agent.role) : null;
  const agentTasks = useMemo(() => tasks.filter((t) => t.agent_id === agentId), [tasks, agentId]);
  const processing = agentTasks.filter((t) => t.status === "running").length;
  const completed = agentTasks.filter((t) => t.status === "done").length;

  const saveMut = useMutation({
    mutationFn: () =>
      updateAgent({
        data: {
          id: agentId,
          name: name.trim() || undefined,
          scope: scope.trim() || undefined,
          main_skill: skill.trim() ? skill.trim() : null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents-state"] });
      toast.success("Profile updated.");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to save."),
  });

  if (isLoading) {
    return (
      <div className="grid min-h-full place-items-center p-10 text-muted-foreground">
        <div className="inline-flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading profile…
        </div>
      </div>
    );
  }

  if (!agent || !meta) {
    return (
      <div className="mx-auto max-w-lg p-10 text-center">
        <h1 className="font-display text-2xl">Agent not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">This agent may have been removed.</p>
        <Link to="/agents" className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
          <ArrowLeft className="h-4 w-4" /> Back to team
        </Link>
      </div>
    );
  }

  const Icon = iconMap[agent.icon_key] ?? Bot;
  const img = agentImageMap[agent.icon_key];
  const isLeader = agent.parent_id === null;
  const dirty =
    (agent.main_skill ?? "") !== skill ||
    agent.name !== name ||
    (agent.scope ?? "") !== scope;

  const priorityChip = (p: string) => {
    const map: Record<string, string> = {
      High: "text-rose-300 ring-rose-400/40",
      Medium: "text-cyan-300 ring-cyan-400/40",
      Low: "text-emerald-300 ring-emerald-400/40",
    };
    return map[p] ?? "text-muted-foreground ring-border";
  };

  const addTask = () => {
    if (!newTask.title.trim()) return;
    setScheduled((p) => [
      { id: crypto.randomUUID(), title: newTask.title.trim(), due: newTask.due || "—", priority: newTask.priority },
      ...p,
    ]);
    setNewTask({ title: "", due: "", priority: "Medium" });
  };

  const addFact = () => {
    if (!factDraft.trim()) return;
    setFacts((p) => [{ id: crypto.randomUUID(), text: factDraft.trim(), at: new Date().toLocaleString() }, ...p]);
    setFactDraft("");
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] w-full">
      <div className="mx-auto w-full max-w-[1200px] p-6">
        {/* Breadcrumb + back */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            onClick={() => navigate({ to: "/agents" })}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card/60 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to {meta.headline.split(" ")[0]}
          </button>
          <div className="text-xs text-muted-foreground">
            Console <span className="mx-1.5 text-border">/</span> {meta.headline}
            <span className="mx-1.5 text-border">/</span>
            <span className="text-foreground">{agent.name}</span>
          </div>
        </div>

        {/* Header card */}
        <header
          className={`relative mb-4 overflow-hidden rounded-2xl border p-5 ${
            isLeader
              ? "border-amber-300/40 bg-gradient-to-br from-amber-500/10 via-card/70 to-card/40"
              : "border-cyan-400/30 bg-gradient-to-br from-cyan-500/10 via-card/70 to-card/40"
          }`}
        >
          <span
            aria-hidden
            className={`pointer-events-none absolute inset-x-0 top-0 h-px ${
              isLeader ? "bg-gradient-to-r from-transparent via-amber-300 to-transparent" : "bg-gradient-to-r from-transparent via-cyan-300 to-transparent"
            }`}
          />
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-5">
            <div className={`grid h-16 w-16 place-items-center overflow-hidden rounded-2xl border bg-background/70 ${isLeader ? "border-amber-300/60 ring-2 ring-amber-300/25" : "border-cyan-400/40 ring-2 ring-cyan-400/20"}`}>
              {img ? <img src={img} alt={agent.name} className="h-[92%] w-[92%] object-contain" /> : <Icon className="h-8 w-8" />}
            </div>
            <div className="min-w-0">
              <div className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {isLeader ? <Crown className="h-3 w-3 text-amber-300" /> : <Bot className="h-3 w-3 text-cyan-300" />}
                GMB Agent Profile
              </div>
              <h1 className="truncate font-display text-2xl leading-tight tracking-tight sm:text-3xl">{agent.name}</h1>
              <p className="mt-1 truncate text-xs text-muted-foreground">{meta.blurb}</p>
            </div>

            {/* Right-side metric + toggles */}
            <div className="flex flex-wrap items-center gap-2">
              <MiniChip label="Processing" value={processing} />
              <MiniChip label="Completed" value={completed} />
              <ToggleChip label="Active" checked={active} onChange={setActive} />
              <ToggleChip label="Auto" checked={autoSchedule} onChange={setAutoSchedule} />
            </div>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          {/* LEFT COLUMN */}
          <div className="space-y-4">
            {/* Skill set */}
            <Panel icon={Brain} title="Skill set" accent={isLeader ? "amber" : "cyan"}>
              <textarea
                value={skill}
                onChange={(e) => setSkill(e.target.value)}
                placeholder={meta.skillHint}
                rows={5}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-cyan-400/60"
              />
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Auto-saved locally as you type.</span>
                <span>{skill.length}/200</span>
              </div>
            </Panel>

            {/* Agent settings */}
            <Panel icon={Settings2} title="Agent settings" accent={isLeader ? "amber" : "cyan"}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Default priority">
                  <Select value={priority} onValueChange={(v) => setPriority(v as "Low" | "Medium" | "High")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Low">Low</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Model">
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4o">gpt-4o</SelectItem>
                      <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
                      <SelectItem value="claude-3.5">claude-3.5</SelectItem>
                      <SelectItem value="gemini-2.0">gemini-2.0</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                  <span>Autonomy level</span>
                  <span>{autonomy}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={autonomy}
                  onChange={(e) => setAutonomy(Number(e.target.value))}
                  className="w-full accent-cyan-400"
                />
              </div>

              <div className="mt-4">
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Operator notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Runbook, quirks, escalation contacts…"
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
                />
              </div>

              <div className="mt-4 border-t border-border/60 pt-4">
                <Field label="Display name">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
                  />
                </Field>
                <div className="mt-3">
                  <Field label="Configuration / scope">
                    <textarea
                      value={scope}
                      onChange={(e) => setScope(e.target.value)}
                      maxLength={500}
                      rows={2}
                      className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
                    />
                  </Field>
                </div>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    onClick={() => {
                      setSkill(agent.main_skill ?? "");
                      setName(agent.name);
                      setScope(agent.scope ?? "");
                    }}
                    disabled={!dirty || saveMut.isPending}
                    className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
                  >
                    Reset
                  </button>
                  <button
                    onClick={() => saveMut.mutate()}
                    disabled={!dirty || saveMut.isPending}
                    className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-cyan-950 hover:bg-cyan-400 disabled:opacity-50"
                  >
                    {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save changes
                  </button>
                </div>
              </div>
            </Panel>
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-4">
            {/* Assign & schedule */}
            <Panel icon={CalendarClock} title="Assign & schedule task" accent={isLeader ? "amber" : "cyan"}>
              <input
                value={newTask.title}
                onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
                placeholder={`Task title (e.g. ${isLeader ? "Weekly team review" : "Audit homepage schema"})`}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-cyan-400/60"
              />
              <div className="mt-3 grid grid-cols-3 gap-3">
                <Field label="Assignee">
                  <Select value={agent.id} onValueChange={() => {}}>
                    <SelectTrigger><SelectValue placeholder={agent.name} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={agent.id}>{agent.name}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Due">
                  <input
                    type="date"
                    value={newTask.due}
                    onChange={(e) => setNewTask((p) => ({ ...p, due: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
                  />
                </Field>
                <Field label="Priority">
                  <Select value={newTask.priority} onValueChange={(v) => setNewTask((p) => ({ ...p, priority: v as "Low" | "Medium" | "High" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Low">Low</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <button
                onClick={addTask}
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-cyan-500 py-2.5 text-sm font-semibold text-cyan-950 transition hover:bg-cyan-400"
              >
                <Plus className="h-4 w-4" /> Schedule task
              </button>
            </Panel>

            {/* Scheduled tasks */}
            <Panel icon={ListChecks} title={`Scheduled tasks (${scheduled.length})`} accent={isLeader ? "amber" : "cyan"}>
              {scheduled.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 py-8 text-center text-sm text-muted-foreground">
                  No tasks scheduled yet
                </div>
              ) : (
                <ul className="space-y-2">
                  {scheduled.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 p-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{t.title}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">Due {t.due}</div>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ${priorityChip(t.priority)}`}>
                        {t.priority}
                      </span>
                      <button
                        onClick={() => setScheduled((p) => p.filter((x) => x.id !== t.id))}
                        className="text-muted-foreground transition hover:text-rose-400"
                        aria-label="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {/* Memory */}
            <Panel icon={BookOpen} title={`Memory (${facts.length})`} accent={isLeader ? "amber" : "cyan"}>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Long-term memory</label>
              <textarea
                value={longMemory}
                onChange={(e) => setLongMemory(e.target.value)}
                rows={3}
                placeholder="Prefer entity-first briefs. Client tone: pragmatic. Cluster around service + area."
                className="w-full resize-none rounded-lg border border-cyan-400/30 bg-background px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Injected as system context on every task the agent runs. Auto-saved locally.
              </p>

              <div className="mt-4 rounded-lg border border-dashed border-border/60 p-3">
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Teach a new fact</label>
                <div className="flex gap-2">
                  <input
                    value={factDraft}
                    onChange={(e) => setFactDraft(e.target.value)}
                    placeholder="e.g. Client prefers 'schedule a clean' over 'book a service'"
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
                  />
                  <button
                    onClick={addFact}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 text-xs font-semibold text-cyan-950 hover:bg-cyan-400"
                  >
                    <Plus className="h-3.5 w-3.5" /> Remember
                  </button>
                </div>
                {facts.length === 0 ? (
                  <p className="mt-2 text-center text-[11px] text-muted-foreground">
                    No memories yet. Teach the agent something it should remember.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {facts.map((f) => (
                      <li key={f.id} className="flex items-start gap-2 rounded-md bg-background/50 p-2 text-xs">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate">{f.text}</div>
                          <div className="text-[10px] text-muted-foreground">{f.at}</div>
                        </div>
                        <button
                          onClick={() => setFacts((p) => p.filter((x) => x.id !== f.id))}
                          className="text-muted-foreground hover:text-rose-400"
                          aria-label="Forget"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Panel>

            {/* Logs */}
            <Panel icon={Terminal} title={`Logs (${events.length})`} accent={isLeader ? "amber" : "cyan"}>
              <div className="mb-3 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  </span>
                  Live — updates in real time as the agent works
                </span>
              </div>
              {events.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 py-6 text-center text-sm text-muted-foreground">
                  No activity yet.
                </div>
              ) : (
                <ol className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                  {events.slice(0, 30).map((e: { id: string; event_type: string; message: string; created_at: string }) => (
                    <li key={e.id} className="flex items-center gap-2 rounded-md border border-border/40 bg-background/40 px-2.5 py-1.5 font-mono text-[11px]">
                      <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
                        {e.event_type}
                      </span>
                      <span className="flex-1 truncate">{e.message}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(e.created_at).toLocaleTimeString()}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          </div>
        </div>

        {leader && !isLeader && (
          <p className="mt-6 text-xs text-muted-foreground">
            Reports to{" "}
            <Link to="/agents/$agentId" params={{ agentId: leader.id }} className="text-foreground underline underline-offset-4 hover:text-cyan-400">
              {leader.name}
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function Panel({
  icon: Icon,
  title,
  accent = "cyan",
  children,
}: {
  icon: typeof Bot;
  title: string;
  accent?: "cyan" | "amber";
  children: React.ReactNode;
}) {
  const ring = accent === "amber" ? "border-amber-300/40" : "border-cyan-400/30";
  const iconTone = accent === "amber" ? "text-amber-300" : "text-cyan-300";
  return (
    <section className={`overflow-hidden rounded-2xl border ${ring} bg-card/60 p-5 backdrop-blur-sm`}>
      <div className="mb-3 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${iconTone}`} />
        <h2 className="font-display text-sm font-semibold uppercase tracking-widest">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function MiniChip({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/50 px-2.5 py-1.5 text-center min-w-[64px]">
      <div className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-display text-lg leading-none">{value}</div>
    </div>
  );
}

function ToggleChip({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-widest transition ${checked ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-200" : "border-border/60 bg-background/50 text-muted-foreground"}`}>
      {label}
      <Switch checked={checked} onCheckedChange={onChange} />
      <span className="sr-only"><Activity className="h-3 w-3" /><CheckCircle2 className="h-3 w-3" /><Clock className="h-3 w-3" /></span>
    </label>
  );
}
