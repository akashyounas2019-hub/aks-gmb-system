import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* Automation CRUD + manual run trigger.
 * The scheduler that actually fires due automations lives at
 * src/routes/api/public/hooks/run-automations.ts and is invoked by pg_cron. */

const KIND = z.enum(["rank_refresh", "auto_publish", "auto_tag", "alert_scan"]);

export const listAutomations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("automations")
      .select("*")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const listAutomationRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ limit: z.number().min(1).max(200).default(50) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("automation_runs")
      .select("*")
      .eq("owner_id", userId)
      .order("started_at", { ascending: false })
      .limit(data.limit);
    if (error) throw error;
    return rows ?? [];
  });

export const createAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().min(1).max(120),
        kind: KIND,
        cron: z.string().min(1).max(64).default("0 * * * *"),
        config: z.record(z.string(), z.unknown()).default({}),
        enabled: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("automations")
      .insert({
        owner_id: userId,
        name: data.name,
        kind: data.kind,
        cron: data.cron,
        config: data.config as never,
        enabled: data.enabled,
        next_run_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const updateAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z
          .object({
            name: z.string().min(1).max(120).optional(),
            cron: z.string().min(1).max(64).optional(),
            config: z.record(z.string(), z.unknown()).optional(),
            enabled: z.boolean().optional(),
          })
          .refine((v) => Object.keys(v).length > 0, "empty patch"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("automations")
      .update(data.patch as never)
      .eq("id", data.id)
      .eq("owner_id", userId)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("automations")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", userId);
    if (error) throw error;
    return { ok: true as const };
  });

export const runAutomationNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: automation, error } = await supabase
      .from("automations")
      .select("*")
      .eq("id", data.id)
      .eq("owner_id", userId)
      .single();
    if (error || !automation) throw error ?? new Error("Automation not found");

    const { executeAutomation } = await import("./automations.server");
    return executeAutomation(automation as never, supabase);
  });
