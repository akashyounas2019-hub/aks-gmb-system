import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AlertSettings = {
  threatKeywordThreshold: number;
  rankImprovementDelta: number;
  overtakeEnabled: boolean;
  threatEnabled: boolean;
  improvementEnabled: boolean;
};

const DEFAULTS: AlertSettings = {
  threatKeywordThreshold: 2,
  rankImprovementDelta: 3,
  overtakeEnabled: true,
  threatEnabled: true,
  improvementEnabled: true,
};

export const getAlertSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AlertSettings> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("alert_settings")
      .select(
        "threat_keyword_threshold, rank_improvement_delta, overtake_enabled, threat_enabled, improvement_enabled",
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return DEFAULTS;
    return {
      threatKeywordThreshold: data.threat_keyword_threshold ?? DEFAULTS.threatKeywordThreshold,
      rankImprovementDelta: data.rank_improvement_delta ?? DEFAULTS.rankImprovementDelta,
      overtakeEnabled: data.overtake_enabled ?? DEFAULTS.overtakeEnabled,
      threatEnabled: data.threat_enabled ?? DEFAULTS.threatEnabled,
      improvementEnabled: data.improvement_enabled ?? DEFAULTS.improvementEnabled,
    };
  });

export const updateAlertSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Partial<AlertSettings>) =>
    z
      .object({
        threatKeywordThreshold: z.number().int().min(1).max(50).optional(),
        rankImprovementDelta: z.number().int().min(1).max(50).optional(),
        overtakeEnabled: z.boolean().optional(),
        threatEnabled: z.boolean().optional(),
        improvementEnabled: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const row: {
      user_id: string;
      threat_keyword_threshold?: number;
      rank_improvement_delta?: number;
      overtake_enabled?: boolean;
      threat_enabled?: boolean;
      improvement_enabled?: boolean;
    } = { user_id: userId };
    if (data.threatKeywordThreshold != null) row.threat_keyword_threshold = data.threatKeywordThreshold;
    if (data.rankImprovementDelta != null) row.rank_improvement_delta = data.rankImprovementDelta;
    if (data.overtakeEnabled != null) row.overtake_enabled = data.overtakeEnabled;
    if (data.threatEnabled != null) row.threat_enabled = data.threatEnabled;
    if (data.improvementEnabled != null) row.improvement_enabled = data.improvementEnabled;
    const { error } = await supabase
      .from("alert_settings")
      .upsert(row, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
