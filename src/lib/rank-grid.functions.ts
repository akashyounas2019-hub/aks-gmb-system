import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { refreshUserRankGrid } from "./rank-grid.server";

export type RankGridCell = { lat: number; lng: number; rank: number };
export type RankGridKeyword = {
  id: string;
  phrase: string;
  current: number;
  previous: number;
  volume: number;
};

export const refreshRankGrid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return refreshUserRankGrid(context.supabase, context.userId);
  });

/**
 * Returns the two most recent grids for a given keyword (current + previous)
 * plus the list of tracked keywords with their latest center-cell rank.
 */
export const getRankGrid = createServerFn({ method: "POST" })
  .inputValidator((d: { phrase?: string | null }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Load user keywords with latest ranks (2 most recent runs per phrase).
    const { data: kws } = await supabase
      .from("keywords")
      .select("id, phrase, volume")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true });

    if (!kws || kws.length === 0) {
      return {
        keywords: [] as RankGridKeyword[],
        current: [] as RankGridCell[],
        previous: [] as RankGridCell[],
        center: { lat: 25.2048, lng: 55.2708 },
        selectedPhrase: null as string | null,
      };
    }

    // Fetch latest snapshots (last 14 days) for these phrases.
    const phrases = kws.map((k) => k.phrase);
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const { data: snaps } = await supabase
      .from("rank_snapshots")
      .select("keyword_phrase, lat, lng, rank, checked_at")
      .eq("owner_id", userId)
      .in("keyword_phrase", phrases)
      .gte("checked_at", since)
      .order("checked_at", { ascending: false })
      .limit(5000);

    // Group by phrase → distinct checked_at buckets.
    const byPhrase = new Map<string, Map<string, RankGridCell[]>>();
    for (const s of snaps ?? []) {
      const p = s.keyword_phrase;
      if (!byPhrase.has(p)) byPhrase.set(p, new Map());
      const buckets = byPhrase.get(p)!;
      const key = s.checked_at;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push({ lat: s.lat, lng: s.lng, rank: s.rank });
    }

    const centerRank = (cells: RankGridCell[]): number => {
      if (cells.length === 0) return 20;
      // Approximate: median rank.
      const sorted = [...cells].map((c) => c.rank).sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    };

    const kwRows: RankGridKeyword[] = kws.map((k) => {
      const buckets = byPhrase.get(k.phrase);
      const runs = buckets ? Array.from(buckets.values()) : [];
      const current = runs[0] ? centerRank(runs[0]) : 20;
      const previous = runs[1] ? centerRank(runs[1]) : current;
      return {
        id: k.id,
        phrase: k.phrase,
        current,
        previous,
        volume: k.volume ?? 0,
      };
    });

    const selectedPhrase = data.phrase ?? kwRows[0]?.phrase ?? null;
    const selBuckets = selectedPhrase ? byPhrase.get(selectedPhrase) : undefined;
    const runs = selBuckets ? Array.from(selBuckets.values()) : [];
    const current = runs[0] ?? [];
    const previous = runs[1] ?? [];

    // Derive map center from mean lat/lng of current grid (fallback to default).
    const center =
      current.length > 0
        ? {
            lat: current.reduce((a, c) => a + c.lat, 0) / current.length,
            lng: current.reduce((a, c) => a + c.lng, 0) / current.length,
          }
        : { lat: 25.2048, lng: 55.2708 };

    return { keywords: kwRows, current, previous, center, selectedPhrase };
  });
