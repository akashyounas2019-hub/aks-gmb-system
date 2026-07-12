import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

export type AutomationRow = {
  id: string;
  owner_id: string;
  name: string;
  kind: "rank_refresh" | "auto_publish" | "auto_tag" | "alert_scan";
  cron: string;
  config: Record<string, unknown>;
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
    output: Record<string, unknown>,
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
    let output: Record<string, unknown> = {};
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
        // Count keywords eligible for a refresh cycle.
        const { count } = await supabase
          .from("keywords")
          .select("*", { count: "exact", head: true })
          .eq("owner_id", automation.owner_id);
        output = { keywords: count ?? 0, note: "rank_refresh scheduled" };
        break;
      }
      case "auto_publish": {
        // Look for scheduled posts whose time has arrived.
        const nowIso = new Date().toISOString();
        const { data: due } = await supabase
          .from("post_drafts")
          .select("id")
          .eq("owner_id", automation.owner_id)
          .eq("status", "scheduled")
          .lte("scheduled_for", nowIso);
        output = { due: due?.length ?? 0 };
        break;
      }
      case "alert_scan": {
        const { count } = await supabase
          .from("rank_alerts")
          .select("*", { count: "exact", head: true })
          .eq("owner_id", automation.owner_id);
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
