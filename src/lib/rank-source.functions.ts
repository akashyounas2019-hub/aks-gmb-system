import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getDecryptedIntegration } from "@/lib/user-integrations.functions";

/**
 * Live competitor rank lookup against a user's configured rank source.
 * Providers are tried in this order: serpapi → dataforseo → local_falcon.
 * The first configured one wins.
 */

const ProviderOrder = ["serpapi", "dataforseo", "local_falcon"] as const;
type ProviderName = (typeof ProviderOrder)[number];

type LocalPlace = { rank: number; placeId?: string; title?: string };

async function fetchSerpApi(
  keyword: string,
  location: string,
  cfg: { api_key: string },
): Promise<LocalPlace[]> {
  const u = new URL("https://serpapi.com/search.json");
  u.searchParams.set("engine", "google_local");
  u.searchParams.set("q", keyword);
  if (location) u.searchParams.set("location", location);
  u.searchParams.set("hl", "en");
  u.searchParams.set("api_key", cfg.api_key);
  const r = await fetch(u).then((res) => res.json() as Promise<{
    local_results?: Array<{ position?: number; place_id?: string; title?: string }>;
    error?: string;
  }>);
  if (r.error) throw new Error(`SerpApi: ${r.error}`);
  return (r.local_results ?? []).map((row, i) => ({
    rank: row.position ?? i + 1,
    placeId: row.place_id,
    title: row.title,
  }));
}

async function fetchDataForSeo(
  keyword: string,
  location: string,
  cfg: { login: string; password: string },
): Promise<LocalPlace[]> {
  const auth = Buffer.from(`${cfg.login}:${cfg.password}`).toString("base64");
  const body = [
    {
      keyword,
      language_code: "en",
      location_name: location || "United States",
    },
  ];
  const r = await fetch(
    "https://api.dataforseo.com/v3/serp/google/local_finder/live/advanced",
    {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  ).then((res) => res.json() as Promise<{
    status_code?: number;
    status_message?: string;
    tasks?: Array<{
      status_code?: number;
      status_message?: string;
      result?: Array<{
        items?: Array<{
          rank_absolute?: number;
          place_id?: string;
          title?: string;
        }>;
      }>;
    }>;
  }>);
  if (r.status_code && r.status_code >= 40000) {
    throw new Error(`DataForSEO: ${r.status_message ?? "request failed"}`);
  }
  const task = r.tasks?.[0];
  if (task?.status_code && task.status_code >= 40000) {
    throw new Error(`DataForSEO: ${task.status_message ?? "task failed"}`);
  }
  const items = task?.result?.[0]?.items ?? [];
  return items
    .filter((it) => typeof it.rank_absolute === "number")
    .map((it) => ({
      rank: it.rank_absolute as number,
      placeId: it.place_id,
      title: it.title,
    }));
}

/**
 * Match a competitor against the ranked places returned by the SERP API.
 * Prefers exact place_id match, falls back to case-insensitive name contains.
 */
function matchRank(
  places: LocalPlace[],
  competitor: { placeId?: string | null; name: string; gbpUrl: string },
): number | null {
  if (competitor.placeId) {
    const byId = places.find((p) => p.placeId && p.placeId === competitor.placeId);
    if (byId) return byId.rank;
  }
  const needle = competitor.name.trim().toLowerCase();
  if (needle.length >= 3) {
    const byName = places.find((p) => (p.title ?? "").toLowerCase().includes(needle));
    if (byName) return byName.rank;
  }
  return null;
}

export const getCompetitorRanks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      keywords: Array<{ keyword: string; city?: string; userRank?: number | null }>;
      competitors: Array<{ id: string; name: string; gbpUrl: string; placeId: string | null }>;
      defaultLocation?: string;
    }) =>
      z
        .object({
          keywords: z
            .array(
              z.object({
                keyword: z.string().trim().min(1).max(200),
                city: z.string().trim().max(120).optional(),
                userRank: z.number().int().min(1).max(500).nullable().optional(),
              }),
            )
            .min(1)
            .max(50),
          competitors: z
            .array(
              z.object({
                id: z.string().uuid(),
                name: z.string().trim().min(1).max(200),
                gbpUrl: z.string().trim().max(2048),
                placeId: z.string().nullable(),
              }),
            )
            .min(1)
            .max(50),
          defaultLocation: z.string().trim().max(120).optional(),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Find the first configured rank source.
    let source: ProviderName | null = null;
    let cfg: Record<string, string> | null = null;
    for (const p of ProviderOrder) {
      const c = await getDecryptedIntegration(supabase, userId, p);
      if (c && Object.keys(c).length > 0) {
        source = p;
        cfg = c;
        break;
      }
    }
    if (!source || !cfg) {
      return {
        source: null as null,
        error:
          "No rank source configured. Add DataForSEO, SerpApi, or Local Falcon in Settings → Integrations.",
        results: {} as Record<string, Record<string, number | null>>,
      };
    }

    if (source === "local_falcon") {
      return {
        source,
        error:
          "Local Falcon competitor lookups aren't wired yet. Configure DataForSEO or SerpApi to enable live competitor ranks.",
        results: {},
      };
    }

    const results: Record<string, Record<string, number | null>> = {};
    let firstError: string | null = null;
    const snapshots: Array<{
      user_id: string;
      competitor_id: string | null;
      keyword: string;
      city: string | null;
      rank: number | null;
      source: string;
    }> = [];

    for (const kw of data.keywords) {
      const location = kw.city ?? data.defaultLocation ?? "";
      let places: LocalPlace[] = [];
      try {
        places =
          source === "serpapi"
            ? await fetchSerpApi(kw.keyword, location, cfg as { api_key: string })
            : await fetchDataForSeo(kw.keyword, location, cfg as { login: string; password: string });
      } catch (err) {
        if (!firstError) firstError = err instanceof Error ? err.message : String(err);
        results[kw.keyword] = Object.fromEntries(data.competitors.map((c) => [c.id, null]));
        continue;
      }

      const perKw: Record<string, number | null> = {};
      for (const c of data.competitors) {
        const r = matchRank(places, {
          placeId: c.placeId,
          name: c.name,
          gbpUrl: c.gbpUrl,
        });
        perKw[c.id] = r;
        snapshots.push({
          user_id: userId,
          competitor_id: c.id,
          keyword: kw.keyword,
          city: kw.city ?? null,
          rank: r,
          source,
        });
      }
      results[kw.keyword] = perKw;

      if (typeof kw.userRank === "number") {
        snapshots.push({
          user_id: userId,
          competitor_id: null,
          keyword: kw.keyword,
          city: kw.city ?? null,
          rank: kw.userRank,
          source,
        });
      }

      // Overtake detection: fire an alert when a competitor is now ranked
      // better than the user AND wasn't the last time we checked.
      if (typeof kw.userRank === "number") {
        const userRank = kw.userRank;
        for (const c of data.competitors) {
          const r = perKw[c.id];
          if (r == null || r >= userRank) continue;

          const { data: prev } = await supabase
            .from("competitor_rank_history")
            .select("rank")
            .eq("user_id", userId)
            .eq("competitor_id", c.id)
            .eq("keyword", kw.keyword)
            .order("recorded_at", { ascending: false })
            .limit(1);
          const prevRank = prev?.[0]?.rank ?? null;
          const wasAhead = prevRank == null || prevRank >= userRank;
          if (!wasAhead) continue;

          // Skip if an unread alert for this pairing already exists.
          const { data: existing } = await supabase
            .from("rank_alerts")
            .select("id")
            .eq("user_id", userId)
            .eq("competitor_id", c.id)
            .eq("keyword", kw.keyword)
            .is("read_at", null)
            .limit(1);
          if (existing && existing.length > 0) continue;

          await supabase.from("rank_alerts").insert({
            user_id: userId,
            competitor_id: c.id,
            keyword: kw.keyword,
            competitor_rank: r,
            user_rank: userRank,
            source,
          });
        }
      }
    }

    if (snapshots.length > 0) {
      await supabase.from("competitor_rank_history").insert(snapshots);
    }

    return { source, error: firstError, results };
  });

export const getCompetitorRankHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { keyword: string; days?: number }) =>
      z
        .object({
          keyword: z.string().trim().min(1).max(200),
          days: z.number().int().min(1).max(365).optional(),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const days = data.days ?? 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: rows, error } = await supabase
      .from("competitor_rank_history")
      .select("competitor_id, rank, recorded_at, source")
      .eq("user_id", userId)
      .eq("keyword", data.keyword)
      .gte("recorded_at", since)
      .order("recorded_at", { ascending: true });

    if (error) throw new Error(error.message);

    return (rows ?? []).map((r) => ({
      competitorId: r.competitor_id as string | null,
      rank: r.rank as number | null,
      recordedAt: r.recorded_at as string,
      source: r.source as string,
    }));
  });

