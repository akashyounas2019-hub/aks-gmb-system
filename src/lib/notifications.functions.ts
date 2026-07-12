import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RankAlertType = "overtake" | "threat" | "improvement";

export type RankAlert = {
  id: string;
  keyword: string;
  competitorId: string;
  competitorName: string;
  competitorRank: number;
  userRank: number;
  source: string;
  createdAt: string;
  readAt: string | null;
  alertType: RankAlertType;
  rankDelta: number | null;
};

export const listRankAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { onlyUnread?: boolean; limit?: number } | undefined) =>
    z
      .object({
        onlyUnread: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }): Promise<RankAlert[]> => {
    const { supabase, userId } = context;
    let q = supabase
      .from("rank_alerts")
      .select(
        "id, keyword, competitor_id, competitor_rank, user_rank, source, created_at, read_at, alert_type, rank_delta, competitors(name)",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.onlyUnread) q = q.is("read_at", null);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => {
      const competitor = r.competitors as { name: string } | { name: string }[] | null;
      const name = Array.isArray(competitor)
        ? competitor[0]?.name ?? "Competitor"
        : competitor?.name ?? "Competitor";
      return {
        id: r.id as string,
        keyword: r.keyword as string,
        competitorId: r.competitor_id as string,
        competitorName: name,
        competitorRank: r.competitor_rank as number,
        userRank: r.user_rank as number,
        source: r.source as string,
        createdAt: r.created_at as string,
        readAt: r.read_at as string | null,
        alertType: ((r as { alert_type?: string }).alert_type ?? "overtake") as RankAlertType,
        rankDelta: ((r as { rank_delta?: number | null }).rank_delta ?? null) as number | null,
      };
    });
  });

export const markRankAlertRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("rank_alerts")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markAllRankAlertsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("rank_alerts")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
