import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function logEvent(
  supabase: any,
  userId: string,
  input: {
    agent_id: string;
    task_id?: string | null;
    event_type: string;
    message: string;
    progress?: number | null;
    metadata?: Record<string, unknown> | null;
  },
) {
  try {
    await supabase.from("agent_task_events").insert({
      user_id: userId,
      agent_id: input.agent_id,
      task_id: input.task_id ?? null,
      event_type: input.event_type,
      message: input.message,
      progress: input.progress ?? null,
      metadata: input.metadata ?? null,
    });
  } catch {
    // history logging is best-effort — never break the primary action
  }
}

type NotifyKind = "assigned" | "started" | "completed" | "failed";

async function notify(
  supabase: any,
  userId: string,
  rows: Array<{
    agent_id: string;
    related_agent_id?: string | null;
    task_id?: string | null;
    kind: NotifyKind;
    title: string;
    message: string;
  }>,
) {
  try {
    if (rows.length === 0) return;
    await supabase.from("agent_notifications").insert(
      rows.map((r) => ({
        user_id: userId,
        agent_id: r.agent_id,
        related_agent_id: r.related_agent_id ?? null,
        task_id: r.task_id ?? null,
        kind: r.kind,
        title: r.title,
        message: r.message,
      })),
    );
  } catch {
    // best-effort — never break the primary action
  }
}

async function getLeaderId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("agents")
    .select("id")
    .eq("user_id", userId)
    .is("parent_id", null)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Compute ETA + confidence from an effective start time and current progress.
 * `started_at` is the wall-clock start adjusted forward across any paused
 * intervals, so `now - started_at` = active working time.
 */
function computeEta(
  startedAtIso: string | null | undefined,
  progress: number,
): { eta_at: string | null; eta_confidence: string | null } {
  if (!startedAtIso) return { eta_at: null, eta_confidence: null };
  const p = Math.max(0, Math.min(100, progress ?? 0));
  if (p <= 0 || p >= 100) return { eta_at: null, eta_confidence: null };
  const startedMs = new Date(startedAtIso).getTime();
  if (!Number.isFinite(startedMs)) return { eta_at: null, eta_confidence: null };
  const elapsedMs = Math.max(1000, Date.now() - startedMs);
  const remainingMs = (elapsedMs / p) * (100 - p);
  const etaMs = Date.now() + remainingMs;
  // Confidence: needs both enough progress AND enough elapsed time to trust the rate.
  let confidence: "low" | "medium" | "high" = "low";
  if (p >= 50 && elapsedMs >= 120_000) confidence = "high";
  else if (p >= 20 && elapsedMs >= 45_000) confidence = "medium";
  return { eta_at: new Date(etaMs).toISOString(), eta_confidence: confidence };
}

const DEFAULT_AGENTS = [
  {
    slug: "leader",
    name: "GMB Leader",
    role: "Orchestrator",
    scope: "Strategy · Delegation · Autonomous decisions",
    icon_key: "crown",
    tone: "from-amber-400 to-orange-500",
    glow: "shadow-[0_0_60px_-10px_rgba(251,191,36,0.55)]",
    status: "online",
    load: 62,
    tasks_today: 24,
    success_rate: 96,
    parent_slug: null as string | null,
    last_activity: "Approved citation cleanup plan",
    sort_order: 0,
  },
  {
    slug: "writer",
    name: "GMB Content Writer",
    role: "Content generation",
    scope: "Posts · Descriptions · Q&A",
    icon_key: "pen",
    tone: "from-violet-400 to-fuchsia-500",
    glow: "shadow-[0_0_40px_-12px_rgba(217,70,239,0.55)]",
    status: "working",
    load: 78,
    tasks_today: 11,
    success_rate: 94,
    parent_slug: "leader",
    last_activity: "Drafting weekly service post",
    sort_order: 1,
  },
  {
    slug: "analyzer",
    name: "GMB Analyzer",
    role: "Signal analysis",
    scope: "Insights · Anomalies · Trends",
    icon_key: "chart",
    tone: "from-sky-400 to-cyan-500",
    glow: "shadow-[0_0_40px_-12px_rgba(56,189,248,0.55)]",
    status: "online",
    load: 41,
    tasks_today: 7,
    success_rate: 98,
    parent_slug: "leader",
    last_activity: "Detected CTR dip on 'plumber near me'",
    sort_order: 2,
  },
  {
    slug: "auditor",
    name: "GMB Auditor",
    role: "Quality & compliance",
    scope: "Profile health · Reviews · Policy",
    icon_key: "shield",
    tone: "from-emerald-400 to-teal-500",
    glow: "shadow-[0_0_40px_-12px_rgba(16,185,129,0.55)]",
    status: "idle",
    load: 18,
    tasks_today: 3,
    success_rate: 99,
    parent_slug: "leader",
    last_activity: "Full profile audit clean",
    sort_order: 3,
  },
  {
    slug: "ranker",
    name: "GMB Ranker",
    role: "Ranking growth",
    scope: "Grid tracking · Boost tactics",
    icon_key: "trending",
    tone: "from-rose-400 to-pink-500",
    glow: "shadow-[0_0_40px_-12px_rgba(244,63,94,0.55)]",
    status: "review",
    load: 55,
    tasks_today: 9,
    success_rate: 91,
    parent_slug: "leader",
    last_activity: "Proposed geo-grid expansion (needs approval)",
    sort_order: 4,
  },
];

const DEFAULT_TASKS = [
  { agent_slug: "writer", title: "Draft this week's promo post", status: "running", major: false, relative_time: "2m ago" },
  { agent_slug: "analyzer", title: "Investigate impression drop", status: "done", major: false, relative_time: "8m ago" },
  { agent_slug: "ranker", title: "Expand grid to 7×7 near HQ", status: "awaiting_approval", major: true, relative_time: "12m ago" },
  { agent_slug: "auditor", title: "Review NAP consistency", status: "queued", major: false, relative_time: "20m ago" },
  { agent_slug: "writer", title: "Reply to 3 new Q&A", status: "done", major: false, relative_time: "34m ago" },
];

async function ensureSeed(supabase: any, userId: string) {
  const { data: existing } = await supabase.from("agents").select("id").eq("user_id", userId).limit(1);
  if (existing && existing.length > 0) return;

  const slugToId: Record<string, string> = {};
  // Insert leader first (no parent)
  for (const a of DEFAULT_AGENTS.filter((x) => x.parent_slug === null)) {
    const { data, error } = await supabase
      .from("agents")
      .insert({
        user_id: userId,
        slug: a.slug,
        name: a.name,
        role: a.role,
        scope: a.scope,
        icon_key: a.icon_key,
        tone: a.tone,
        glow: a.glow,
        status: a.status,
        load: a.load,
        tasks_today: a.tasks_today,
        success_rate: a.success_rate,
        parent_id: null,
        last_activity: a.last_activity,
        sort_order: a.sort_order,
      })
      .select("id")
      .single();
    if (error) throw error;
    slugToId[a.slug] = data.id;
  }
  // Then sub-agents
  for (const a of DEFAULT_AGENTS.filter((x) => x.parent_slug !== null)) {
    const { data, error } = await supabase
      .from("agents")
      .insert({
        user_id: userId,
        slug: a.slug,
        name: a.name,
        role: a.role,
        scope: a.scope,
        icon_key: a.icon_key,
        tone: a.tone,
        glow: a.glow,
        status: a.status,
        load: a.load,
        tasks_today: a.tasks_today,
        success_rate: a.success_rate,
        parent_id: slugToId[a.parent_slug!],
        last_activity: a.last_activity,
        sort_order: a.sort_order,
      })
      .select("id")
      .single();
    if (error) throw error;
    slugToId[a.slug] = data.id;
  }
  // Seed tasks
  for (const t of DEFAULT_TASKS) {
    await supabase.from("agent_tasks").insert({
      user_id: userId,
      agent_id: slugToId[t.agent_slug],
      title: t.title,
      status: t.status,
      major: t.major,
      relative_time: t.relative_time,
    });
  }
}

export const getAgentsState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await ensureSeed(supabase, userId);
    const [{ data: agents, error: aErr }, { data: tasks, error: tErr }] = await Promise.all([
      supabase.from("agents").select("*").eq("user_id", userId).order("sort_order", { ascending: true }),
      supabase.from("agent_tasks").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    ]);
    if (aErr) throw aErr;
    if (tErr) throw tErr;
    return { agents: agents ?? [], tasks: tasks ?? [] };
  });

export const createAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().min(1),
        role: z.string().min(1),
        parent_id: z.string().uuid(),
        icon_key: z.string(),
        tone: z.string(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("agents")
      .insert({
        user_id: userId,
        name: data.name,
        role: data.role[0].toUpperCase() + data.role.slice(1),
        scope: "Custom-defined scope",
        icon_key: data.icon_key,
        tone: data.tone,
        glow: "shadow-[0_0_40px_-12px_rgba(129,140,248,0.55)]",
        status: "idle",
        load: 5,
        tasks_today: 0,
        success_rate: 100,
        parent_id: data.parent_id,
        last_activity: "Spawned by Leader",
        sort_order: 99,
      })
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const approveTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: task, error } = await supabase
      .from("agent_tasks")
      .update({ status: "running", started_at: new Date().toISOString(), paused_at: null, eta_at: null, eta_confidence: "low" })
      .eq("id", data.id)
      .eq("user_id", userId)
      .select("agent_id, title")
      .maybeSingle();
    if (error) throw error;
    if (task) {
      await logEvent(supabase, userId, {
        agent_id: task.agent_id,
        task_id: data.id,
        event_type: "approved",
        message: `Approved: ${task.title}`,
      });
      const leaderId = await getLeaderId(supabase, userId);
      const rows: Parameters<typeof notify>[2] = [
        {
          agent_id: task.agent_id,
          related_agent_id: leaderId,
          task_id: data.id,
          kind: "started",
          title: "Task started",
          message: `Leader approved and started "${task.title}".`,
        },
      ];
      if (leaderId && leaderId !== task.agent_id) {
        rows.push({
          agent_id: leaderId,
          related_agent_id: task.agent_id,
          task_id: data.id,
          kind: "started",
          title: "Task started",
          message: `Approved "${task.title}" — now running.`,
        });
      }
      await notify(supabase, userId, rows);
    }
    return { ok: true };
  });

export const rejectTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: task } = await supabase
      .from("agent_tasks")
      .select("agent_id, title")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (task) {
      await logEvent(supabase, userId, {
        agent_id: task.agent_id,
        task_id: null,
        event_type: "rejected",
        message: `Rejected: ${task.title}`,
      });
      const leaderId = await getLeaderId(supabase, userId);
      const rows: Parameters<typeof notify>[2] = [
        {
          agent_id: task.agent_id,
          related_agent_id: leaderId,
          task_id: null,
          kind: "failed",
          title: "Task rejected",
          message: `Leader rejected "${task.title}".`,
        },
      ];
      if (leaderId && leaderId !== task.agent_id) {
        rows.push({
          agent_id: leaderId,
          related_agent_id: task.agent_id,
          task_id: null,
          kind: "failed",
          title: "Task rejected",
          message: `You rejected "${task.title}".`,
        });
      }
      await notify(supabase, userId, rows);
    }
    const { error } = await supabase
      .from("agent_tasks")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

export const updateAgentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["online", "working", "idle", "review"]).optional(),
        load: z.number().min(0).max(100).optional(),
        last_activity: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: { status?: string; load?: number; last_activity?: string } = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.load !== undefined) patch.load = data.load;
    if (data.last_activity !== undefined) patch.last_activity = data.last_activity;
    const { error } = await supabase
      .from("agents")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

export const assignTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        agent_id: z.string().uuid(),
        title: z.string().min(2).max(200),
        priority: z.enum(["low", "normal", "high"]).default("normal"),
        major: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Ensure agent belongs to user
    const { data: agent, error: aErr } = await supabase
      .from("agents")
      .select("id, name")
      .eq("id", data.agent_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (aErr) throw aErr;
    if (!agent) throw new Error("Agent not found.");

    const nowIso = new Date().toISOString();
    const { data: task, error } = await supabase
      .from("agent_tasks")
      .insert({
        user_id: userId,
        agent_id: data.agent_id,
        title: data.title,
        status: data.major ? "awaiting_approval" : "running",
        major: data.major,
        priority: data.priority,
        progress: data.major ? 0 : 5,
        relative_time: "just now",
        started_at: data.major ? null : nowIso,
        eta_confidence: data.major ? null : "low",
      })
      .select("*")
      .single();
    if (error) throw error;

    // Bump agent activity
    await supabase
      .from("agents")
      .update({
        status: data.major ? "review" : "working",
        last_activity: `Assigned: ${data.title}`,
      })
      .eq("id", data.agent_id)
      .eq("user_id", userId);

    await logEvent(supabase, userId, {
      agent_id: data.agent_id,
      task_id: task.id,
      event_type: data.major ? "awaiting_approval" : "assigned",
      message: data.major
        ? `Awaiting approval: ${data.title}`
        : `Assigned: ${data.title}`,
      progress: task.progress ?? 0,
      metadata: { priority: data.priority, major: data.major },
    });

    {
      const leaderId = await getLeaderId(supabase, userId);
      const rows: Parameters<typeof notify>[2] = [];
      // Notify the sub-agent it received a task (or a queued major task pending approval)
      rows.push({
        agent_id: data.agent_id,
        related_agent_id: leaderId,
        task_id: task.id,
        kind: "assigned",
        title: data.major ? "New major task queued" : "New task assigned",
        message: data.major
          ? `Leader queued "${data.title}" — awaiting your operator's approval.`
          : `Leader assigned "${data.title}".`,
      });
      // Notify the leader for oversight
      if (leaderId && leaderId !== data.agent_id) {
        rows.push({
          agent_id: leaderId,
          related_agent_id: data.agent_id,
          task_id: task.id,
          kind: "assigned",
          title: "Dispatched a task",
          message: `Sent "${data.title}" to ${agent.name}${data.major ? " (major — needs approval)" : ""}.`,
        });
      }
      // Non-major tasks start immediately
      if (!data.major) {
        rows.push({
          agent_id: data.agent_id,
          related_agent_id: leaderId,
          task_id: task.id,
          kind: "started",
          title: "Task started",
          message: `Working on "${data.title}".`,
        });
      }
      await notify(supabase, userId, rows);
    }

    return task;
  });

export const updateTaskProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        progress: z.number().min(0).max(100).optional(),
        status: z
          .enum(["queued", "running", "done", "awaiting_approval", "paused", "cancelled"])
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Load current task to compute ETA off its started_at
    const { data: current } = await supabase
      .from("agent_tasks")
      .select("started_at, progress, status")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();

    const patch: {
      progress?: number;
      status?: string;
      started_at?: string | null;
      eta_at?: string | null;
      eta_confidence?: string | null;
    } = {};
    if (data.progress !== undefined) patch.progress = data.progress;
    if (data.status !== undefined) patch.status = data.status;
    if (data.progress !== undefined && data.progress >= 100 && data.status === undefined) {
      patch.status = "done";
    }

    // If moving to running and no started_at yet, stamp one now.
    const nextStatus = patch.status ?? current?.status;
    let effectiveStartedAt = current?.started_at ?? null;
    if (nextStatus === "running" && !effectiveStartedAt) {
      effectiveStartedAt = new Date().toISOString();
      patch.started_at = effectiveStartedAt;
    }

    const nextProgress = data.progress ?? current?.progress ?? 0;
    if (nextStatus === "running") {
      const { eta_at, eta_confidence } = computeEta(effectiveStartedAt, nextProgress);
      patch.eta_at = eta_at;
      patch.eta_confidence = eta_confidence;
    } else if (
      nextStatus === "done" ||
      nextStatus === "cancelled" ||
      nextStatus === "paused"
    ) {
      // Keep eta stable while paused? Simpler: clear on non-running terminal transitions.
      if (nextStatus !== "paused") {
        patch.eta_at = null;
        patch.eta_confidence = null;
      }
    }

    const { data: updated, error } = await supabase
      .from("agent_tasks")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", userId)
      .select("agent_id, title, progress, status")
      .maybeSingle();
    if (error) throw error;
    if (updated) {
      const isDone = updated.status === "done";
      await logEvent(supabase, userId, {
        agent_id: updated.agent_id,
        task_id: data.id,
        event_type: isDone ? "completed" : "progress",
        message: isDone
          ? `Completed: ${updated.title}`
          : `Progress ${updated.progress ?? 0}% — ${updated.title}`,
        progress: updated.progress ?? null,
      });
      if (isDone) {
        const leaderId = await getLeaderId(supabase, userId);
        const rows: Parameters<typeof notify>[2] = [
          {
            agent_id: updated.agent_id,
            related_agent_id: leaderId,
            task_id: data.id,
            kind: "completed",
            title: "Task completed",
            message: `Finished "${updated.title}".`,
          },
        ];
        if (leaderId && leaderId !== updated.agent_id) {
          rows.push({
            agent_id: leaderId,
            related_agent_id: updated.agent_id,
            task_id: data.id,
            kind: "completed",
            title: "Task completed",
            message: `Agent finished "${updated.title}".`,
          });
        }
        await notify(supabase, userId, rows);
      }
    }
    return { ok: true };
  });

export const pauseTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: task, error } = await supabase
      .from("agent_tasks")
      .update({ status: "paused" })
      .eq("id", data.id)
      .eq("user_id", userId)
      .eq("status", "running")
      .select("agent_id, title, progress")
      .maybeSingle();
    if (error) throw error;
    if (task?.agent_id) {
      await supabase
        .from("agents")
        .update({ status: "idle", last_activity: "Task paused by operator" })
        .eq("id", task.agent_id)
        .eq("user_id", userId);
      await logEvent(supabase, userId, {
        agent_id: task.agent_id,
        task_id: data.id,
        event_type: "paused",
        message: `Paused: ${task.title ?? "task"}`,
        progress: task.progress ?? null,
      });
    }
    return { ok: true };
  });

export const resumeTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: task, error } = await supabase
      .from("agent_tasks")
      .update({ status: "running" })
      .eq("id", data.id)
      .eq("user_id", userId)
      .eq("status", "paused")
      .select("agent_id, title, progress")
      .maybeSingle();
    if (error) throw error;
    if (task?.agent_id) {
      await supabase
        .from("agents")
        .update({ status: "working", last_activity: `Resumed: ${task.title}` })
        .eq("id", task.agent_id)
        .eq("user_id", userId);
      await logEvent(supabase, userId, {
        agent_id: task.agent_id,
        task_id: data.id,
        event_type: "resumed",
        message: `Resumed: ${task.title}`,
        progress: task.progress ?? null,
      });
    }
    return { ok: true };
  });

export const cancelTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: task, error } = await supabase
      .from("agent_tasks")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .eq("user_id", userId)
      .in("status", ["running", "paused", "queued", "awaiting_approval"])
      .select("agent_id, title, progress")
      .maybeSingle();
    if (error) throw error;
    if (task?.agent_id) {
      await supabase
        .from("agents")
        .update({ status: "idle", last_activity: "Task cancelled by operator" })
        .eq("id", task.agent_id)
        .eq("user_id", userId);
      await logEvent(supabase, userId, {
        agent_id: task.agent_id,
        task_id: data.id,
        event_type: "cancelled",
        message: `Cancelled: ${task.title ?? "task"}`,
        progress: task.progress ?? null,
      });
      const leaderId = await getLeaderId(supabase, userId);
      const rows: Parameters<typeof notify>[2] = [
        {
          agent_id: task.agent_id,
          related_agent_id: leaderId,
          task_id: data.id,
          kind: "failed",
          title: "Task cancelled",
          message: `Operator cancelled "${task.title ?? "task"}".`,
        },
      ];
      if (leaderId && leaderId !== task.agent_id) {
        rows.push({
          agent_id: leaderId,
          related_agent_id: task.agent_id,
          task_id: data.id,
          kind: "failed",
          title: "Task cancelled",
          message: `Cancelled "${task.title ?? "task"}" — agent stood down.`,
        });
      }
      await notify(supabase, userId, rows);
    }
    return { ok: true };
  });

export const getTaskEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        agent_id: z.string().uuid().optional(),
        task_id: z.string().uuid().optional(),
        limit: z.number().min(1).max(500).default(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("agent_task_events")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.agent_id) q = q.eq("agent_id", data.agent_id);
    if (data.task_id) q = q.eq("task_id", data.task_id);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });



export const listAgentNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        onlyUnread: z.boolean().optional(),
        agent_id: z.string().uuid().optional(),
        limit: z.number().min(1).max(200).default(50),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("agent_notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.onlyUnread) q = q.is("read_at", null);
    if (data.agent_id) q = q.eq("agent_id", data.agent_id);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const markAgentNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("agent_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

export const markAllAgentNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ agent_id: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("agent_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
    if (data.agent_id) q = q.eq("agent_id", data.agent_id);
    const { error } = await q;
    if (error) throw error;
    return { ok: true };
  });
