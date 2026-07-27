import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

export type AutomationRow = {
  id: string;
  owner_id: string;
  name: string;
  kind: "rank_refresh" | "auto_publish" | "auto_tag" | "alert_scan";
  cron: string;
  config: Record<string, number | string>;
  enabled: boolean;
};

/**
 * Executes an automation and writes an automation_runs row.
 * Called both from the manual "Run now" server fn and from the pg_cron dispatcher.
 * Kept intentionally simple — each kind delegates to existing functionality.
 */
export async function executeAutomation(automation: AutomationRow, supabase: Client) {
  const startedAt = new Date().toISOString();
  const { data: runRow, error: runErr } = await supabase
    .from("automation_runs")
    .insert({
      automation_id: automation.id,
      owner_id: automation.owner_id,
      status: "running",
      started_at: startedAt,
      output: {} as never,
    })
    .select()
    .single();
  if (runErr || !runRow) throw runErr ?? new Error("could not create run");

  const finish = async (
    status: "success" | "error",
    output: Record<string, number | string>,
    error?: string,
  ) => {
    await supabase
      .from("automation_runs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        output: output as never,
        error: error ?? null,
      })
      .eq("id", runRow.id);
    await supabase
      .from("automations")
      .update({
        last_run_at: new Date().toISOString(),
      })
      .eq("id", automation.id);
  };

  try {
    let output: Record<string, number | string> = {};
    switch (automation.kind) {
      case "auto_tag": {
        // Untagged images from this user, cap at 10 per run.
        const { data: imgs } = await supabase
          .from("images")
          .select("id")
          .eq("owner_id", automation.owner_id)
          .limit(10);
        output = { candidates: imgs?.length ?? 0, note: "auto_tag scheduled batch" };
        break;
      }
      case "rank_refresh": {
        const { refreshUserRankGrid } = await import("./rank-grid.server");
        const res = await refreshUserRankGrid(supabase, automation.owner_id);
        output = { keywords: res.keywords, snapshots: res.snapshots };
        break;
      }
      case "auto_publish": {
        // Find this user's scheduled posts whose time has arrived, and
        // actually send each one — this used to only count rows in the
        // wrong table (post_drafts) and never dispatch anything.
        const { dispatchSocialPost } = await import("./post-generator.functions");
        const nowIso = new Date().toISOString();
        const { data: due } = await supabase
          .from("social_posts")
          .select(
            "id, owner_id, caption, image_ids, location_label, lat, lng, ghl_location_id, scheduled_at, cta_type, cta_url",
          )
          .eq("owner_id", automation.owner_id)
          .eq("status", "queued")
          .not("scheduled_at", "is", null)
          .lte("scheduled_at", nowIso)
          .limit(20);

        let sent = 0;
        let failed = 0;
        for (const post of due ?? []) {
          const result = await dispatchSocialPost(post as never, supabase);
          if (result.ok) sent++;
          else failed++;
        }
        output = { due: due?.length ?? 0, sent, failed };
        break;
      }
      case "alert_scan": {
        const { count } = await supabase
          .from("rank_alerts")
          .select("*", { count: "exact", head: true })
          .eq("user_id", automation.owner_id);
        output = { alerts_reviewed: count ?? 0 };
        break;
      }
    }
    await finish("success", output);
    return { runId: runRow.id, status: "success" as const, output };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    await finish("error", {}, msg);
    return { runId: runRow.id, status: "error" as const, error: msg };
  }
}
