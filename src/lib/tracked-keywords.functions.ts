import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type TrackedKeyword = {
  keyword: string;
  city: string;
  userRank: number;
  volume: number;
  category: "Residential" | "Commercial" | "Specialty";
};

/**
 * Seed used only when the user hasn't added any tracked keywords yet.
 * Once they save any row via the UI, this array is no longer used.
 */
export const STARTER_TRACKED_KEYWORDS: TrackedKeyword[] = [
  {
    keyword: "deep cleaning dubai",
    city: "Downtown Dubai",
    userRank: 3,
    volume: 2900,
    category: "Residential",
  },
  {
    keyword: "sofa cleaning near me",
    city: "Al Qusais",
    userRank: 5,
    volume: 1600,
    category: "Residential",
  },
  {
    keyword: "move in cleaning dubai",
    city: "Dubai Marina",
    userRank: 12,
    volume: 720,
    category: "Residential",
  },
  {
    keyword: "carpet cleaning service",
    city: "Business Bay",
    userRank: 8,
    volume: 990,
    category: "Specialty",
  },
  {
    keyword: "post construction cleaning",
    city: "JLT",
    userRank: 2,
    volume: 480,
    category: "Specialty",
  },
  {
    keyword: "villa deep cleaning",
    city: "Al Barsha",
    userRank: 14,
    volume: 590,
    category: "Residential",
  },
  {
    keyword: "office cleaning dubai",
    city: "Deira",
    userRank: 4,
    volume: 1300,
    category: "Commercial",
  },
];

type Ctx = { supabase: SupabaseClient<Database>; userId: string };

export const listTrackedKeywords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as Ctx;
    const { data, error } = await supabase
      .from("tracked_keywords")
      .select("phrase, city, user_rank, volume, category")
      .order("sort_index", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const rows: TrackedKeyword[] = (data ?? []).map((r) => ({
      keyword: r.phrase,
      city: r.city ?? "",
      userRank: r.user_rank ?? 20,
      volume: r.volume ?? 0,
      category: (r.category as TrackedKeyword["category"]) ?? "Residential",
    }));
    return {
      rows: rows.length > 0 ? rows : STARTER_TRACKED_KEYWORDS,
      isCustom: rows.length > 0,
    };
  });

export const saveTrackedKeywords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rows: TrackedKeyword[] }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    // Replace the entire set — simple and matches the UI's bulk-edit shape.
    const { error: delErr } = await supabase
      .from("tracked_keywords")
      .delete()
      .eq("owner_id", userId);
    if (delErr) throw new Error(delErr.message);
    if (data.rows.length === 0) return { ok: true, count: 0 };
    const insertRows = data.rows.map((r, i) => ({
      owner_id: userId,
      phrase: r.keyword.trim(),
      city: r.city,
      user_rank: r.userRank,
      volume: r.volume,
      category: r.category,
      sort_index: i,
    }));
    const { error: insErr } = await supabase.from("tracked_keywords").insert(insertRows);
    if (insErr) throw new Error(insErr.message);
    return { ok: true, count: insertRows.length };
  });
