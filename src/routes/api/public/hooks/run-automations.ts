import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { executeAutomation, type AutomationRow } from "@/lib/automations.server";

/**
 * Scheduler endpoint invoked by pg_cron every N minutes.
 * Iterates enabled automations whose next_run_at is due (or null),
 * runs each, and updates next_run_at based on the automation's cron.
 *
 * Auth: standard Supabase anon `apikey` header (bypassed on /api/public/*)
 * plus this endpoint uses the service role internally to iterate across users.
 */

const MAX_PER_TICK = 50;

// Very small cron -> nextRunAt calculator supporting the common forms we use.
// Falls back to +1h for anything more exotic to keep automations advancing.
function nextRunFromCron(cron: string, from: Date): Date {
  const parts = cron.trim().split(/\s+/);
  const next = new Date(from);
  if (parts.length !== 5) {
    next.setHours(next.getHours() + 1);
    return next;
  }
  const [min, hour] = parts;
  if (min.startsWith("*/")) {
    const step = Math.max(1, parseInt(min.slice(2), 10) || 1);
    next.setMinutes(next.getMinutes() + step, 0, 0);
    return next;
  }
  if (hour.startsWith("*/")) {
    const step = Math.max(1, parseInt(hour.slice(2), 10) || 1);
    next.setHours(next.getHours() + step, 0, 0, 0);
    return next;
  }
  // Default: bump by an hour so it always makes progress.
  next.setHours(next.getHours() + 1, 0, 0, 0);
  return next;
}

export const Route = createFileRoute("/api/public/hooks/run-automations")({
  server: {
    handlers: {
      POST: async () => {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) {
          return new Response("Supabase env missing", { status: 500 });
        }
        const supabase = createClient<Database>(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const nowIso = new Date().toISOString();
        const { data: due, error } = await supabase
          .from("automations")
          .select("*")
          .eq("enabled", true)
          .or(`next_run_at.is.null,next_run_at.lte.${nowIso}`)
          .limit(MAX_PER_TICK);

        if (error) return Response.json({ error: error.message }, { status: 500 });

        const results: Array<{ id: string; status: string }> = [];
        for (const row of due ?? []) {
          const automation = row as unknown as AutomationRow;
          const res = await executeAutomation(automation, supabase);
          const nextAt = nextRunFromCron(automation.cron, new Date());
          await supabase
            .from("automations")
            .update({ next_run_at: nextAt.toISOString() })
            .eq("id", automation.id);
          results.push({ id: automation.id, status: res.status });
        }

        return Response.json({ processed: results.length, results });
      },
    },
  },
});
