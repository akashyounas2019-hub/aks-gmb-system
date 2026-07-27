import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { executeAutomation, type AutomationRow } from "@/lib/automations.server";
import { dispatchSocialPost } from "@/lib/post-generator.functions";

/**
 * Scheduler endpoint invoked by pg_cron every N minutes (see the migration
 * that schedules `dispatch-scheduled-posts`).
 *
 * Does two things on every tick:
 *  1. Sweeps ALL users' due, scheduled social_posts and actually sends them —
 *     this does not depend on any per-user "auto_publish" automation being
 *     configured; scheduling a post always means it eventually goes out.
 *  2. Runs any enabled per-user automations (rank refresh, auto-tag, alert
 *     scan) whose next_run_at is due.
 *
 * Auth: this route lives under /api/public/*, which bypasses normal
 * session auth — so it requires the `x-automations-secret` header to match
 * AUTOMATIONS_CRON_SECRET. Without a matching secret, anyone who finds the
 * URL could trigger it (and, previously, nothing stopped them).
 */

const MAX_PER_TICK = 50;
const MAX_POSTS_PER_TICK = 50;

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
      POST: async ({ request }) => {
        const expectedSecret = process.env.AUTOMATIONS_CRON_SECRET;
        if (!expectedSecret) {
          return new Response("AUTOMATIONS_CRON_SECRET not configured", { status: 500 });
        }
        const gotSecret = request.headers.get("x-automations-secret");
        if (gotSecret !== expectedSecret) {
          return new Response("Unauthorized", { status: 401 });
        }

        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) {
          return new Response("Supabase env missing", { status: 500 });
        }
        const supabase = createClient<Database>(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const nowIso = new Date().toISOString();

        // 1) Send every due scheduled post, for every user — independent of
        //    whether that user has an "auto_publish" automation configured.
        const { data: duePosts, error: postsErr } = await supabase
          .from("social_posts")
          .select(
            "id, owner_id, caption, image_ids, location_label, lat, lng, ghl_location_id, scheduled_at",
          )
          .eq("status", "queued")
          .not("scheduled_at", "is", null)
          .lte("scheduled_at", nowIso)
          .limit(MAX_POSTS_PER_TICK);

        const postResults: Array<{ id: string; status: string }> = [];
        if (!postsErr) {
          for (const post of duePosts ?? []) {
            // A claim step would be needed to be fully safe against two
            // overlapping ticks; MAX_POSTS_PER_TICK plus the 5-minute cadence
            // keeps the overlap window small in the meantime.
            const result = await dispatchSocialPost(post as never, supabase);
            postResults.push({ id: post.id, status: result.status });
          }
        }

        // 2) Run enabled per-user automations (rank refresh, auto-tag, alerts).
        const { data: due, error } = await supabase
          .from("automations")
          .select("*")
          .eq("enabled", true)
          .or(`next_run_at.is.null,next_run_at.lte.${nowIso}`)
          .limit(MAX_PER_TICK);

        if (error) {
          return Response.json(
            { postsProcessed: postResults.length, postResults, error: error.message },
            { status: 500 },
          );
        }

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

        return Response.json({
          postsProcessed: postResults.length,
          postResults,
          automationsProcessed: results.length,
          results,
        });
      },
    },
  },
});
