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
  Zap,
  Loader2,
  Sparkles,
  Save,
} from "lucide-react";
import {
  getAgentsState,
  getTaskEvents as getTaskEventsFn,
  updateAgent as updateAgentFn,
} from "@/lib/agents.functions";

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

  const [skill, setSkill] = useState("");
  const [name, setName] = useState("");
  const [scope, setScope] = useState("");

  useEffect(() => {
    if (!agent) return;
    setSkill(agent.main_skill ?? "");
    setName(agent.name);
    setScope(agent.scope ?? "");
  }, [agent?.id, agent?.main_skill, agent?.name, agent?.scope]);

  const agentTasks = useMemo(() => tasks.filter((t) => t.agent_id === agentId), [tasks, agentId]);
  const inflight = agentTasks.filter((t) => t.status === "running" || t.status === "awaiting_approval");
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

  if (!agent) {
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

  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full flex-col">
      <div className="mx-auto w-full max-w-[1200px] p-6">
        <button
          onClick={() => navigate({ to: "/agents" })}
          className="mb-6 inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card/60 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to team
        </button>

        <header className="mb-8 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-6">
          <div className="relative grid h-28 w-28 place-items-center overflow-hidden rounded-2xl border border-border/70 bg-background/70">
            {img ? (
              <img src={img} alt={`${agent.name} portrait`} className="h-[92%] w-[92%] object-contain" />
            ) : (
              <Icon className="h-12 w-12 text-foreground/85" />
            )}
          </div>
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {isLeader ? <Crown className="h-3 w-3 text-amber-400" /> : <Bot className="h-3 w-3" />}
              {isLeader ? "Team Leader" : "Sub-agent"} · {agent.role}
            </div>
            <h1 className="font-display text-3xl leading-tight tracking-tight sm:text-4xl">{agent.name}</h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{agent.last_activity}</p>
          </div>
        </header>

        <section className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Stat label="Status" value={agent.status} icon={Activity} />
          <Stat label="Load" value={`${agent.load}%`} icon={Zap} bar={agent.load} />
          <Stat label="Tasks today" value={String(agent.tasks_today)} icon={Clock} />
          <Stat label="Success" value={`${agent.success_rate}%`} icon={CheckCircle2} bar={agent.success_rate} />
        </section>

        <section className="mb-8 rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur-sm">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-400" />
            <h2 className="font-display text-lg tracking-tight">Main skill</h2>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Defines the agent's core specialty. Tasks routed here are tuned to this skill.
          </p>
          <input
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            maxLength={200}
            placeholder="e.g. Local SEO copywriting, review triage, rank tracking…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-cyan-400/60"
          />
          <div className="mt-1 text-[11px] text-muted-foreground">{skill.length}/200</div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Display name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Configuration / scope</label>
              <textarea
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                maxLength={500}
                rows={3}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
              />
            </div>
          </div>

          <div className="mt-5 flex items-center justify-end gap-2">
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
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-50"
            >
              {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save changes
            </button>
          </div>
        </section>

        <section className="mb-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur-sm">
            <h3 className="mb-4 font-display text-base tracking-tight">In-flight tasks</h3>
            {inflight.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                Nothing running right now.
              </div>
            ) : (
              <ul className="space-y-2">
                {inflight.map((t) => (
                  <li key={t.id} className="rounded-lg border border-border/60 p-3 text-sm">
                    <div className="truncate font-medium">{t.title}</div>
                    <div className="mt-0.5 text-xs capitalize text-muted-foreground">{t.status} · {t.relative_time}</div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 text-xs text-muted-foreground">
              {completed} completed · {agentTasks.length} total
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur-sm">
            <h3 className="mb-4 font-display text-base tracking-tight">Recent activity</h3>
            {events.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                No activity yet.
              </div>
            ) : (
              <ol className="space-y-2">
                {events.slice(0, 10).map((e: { id: string; event_type: string; message: string; created_at: string }) => (
                  <li key={e.id} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
                    <div className="min-w-0">
                      <div className="truncate">{e.message}</div>
                      <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
                        {e.event_type} · {new Date(e.created_at).toLocaleString()}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        {leader && !isLeader && (
          <p className="text-xs text-muted-foreground">
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

function Stat({
  label,
  value,
  icon: Icon,
  bar,
}: {
  label: string;
  value: string;
  icon: typeof Bot;
  bar?: number;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
        <span className="grid h-7 w-7 place-items-center rounded-lg border border-border/70 bg-background/60 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="mt-2 font-display text-2xl font-semibold capitalize leading-none tracking-tight sm:text-3xl">
        {value}
      </div>
      {typeof bar === "number" && (
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted/50">
          <div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.max(0, Math.min(100, bar))}%` }} />
        </div>
      )}
    </div>
  );
}
