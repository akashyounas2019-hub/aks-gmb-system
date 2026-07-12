import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UrlSchema = z
  .string()
  .trim()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), { message: "Must be http(s)" })
  .refine(
    (u) => /google\.[a-z.]+\/maps|maps\.google|goo\.gl\/maps|maps\.app\.goo\.gl|share\.google/i.test(u),
    { message: "Must be a Google Maps / Business Profile URL" },
  );

const SHORT_URL_HOSTS = /^(maps\.app\.goo\.gl|goo\.gl|share\.google)$/i;
const PLACE_ID_RE = /^ChIJ[A-Za-z0-9_-]{20,}$/;

/** Follow redirects on a shortened share link to reveal the canonical Maps URL. */
async function expandShortUrl(url: string): Promise<string> {
  try {
    const host = new URL(url).hostname;
    if (!SHORT_URL_HOSTS.test(host)) return url;
    // HEAD first — cheap; fall back to GET if server refuses.
    const doFetch = async (method: "HEAD" | "GET") =>
      fetch(url, {
        method,
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; LovableGMB/1.0)" },
      });
    let res = await doFetch("HEAD").catch(() => null);
    if (!res || !res.ok) res = await doFetch("GET").catch(() => null);
    return res?.url ?? url;
  } catch {
    return url;
  }
}

/** Local hints we can pull from the URL without any API call. */
function extractHintsFromUrl(url: string): { placeId?: string; ftid?: string; cid?: string; name?: string } {
  const out: { placeId?: string; ftid?: string; cid?: string; name?: string } = {};

  const placeidParam = url.match(/[?&]place_?id=([^&]+)/i);
  if (placeidParam) out.placeId = decodeURIComponent(placeidParam[1]);

  const ftid = url.match(/[?&]ftid=([^&]+)/i);
  if (ftid) out.ftid = decodeURIComponent(ftid[1]);

  const bang = url.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  if (bang && !out.ftid) out.ftid = bang[1];

  const cid = url.match(/[?&]cid=(\d+)/i);
  if (cid) out.cid = cid[1];

  const namePart = url.match(/\/maps\/place\/([^/@]+)/i);
  if (namePart) out.name = decodeURIComponent(namePart[1].replace(/\+/g, " "));

  return out;
}

/**
 * Resolve a canonical Google Place ID (ChIJ…) for a competitor URL.
 * Uses the Google Places API when GOOGLE_MAPS_API_KEY is available.
 * Returns null when no confident match can be made — never throws.
 */
export async function resolvePlaceId(rawUrl: string): Promise<string | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const expanded = await expandShortUrl(rawUrl);
  const hints = extractHintsFromUrl(expanded);

  // Already a place_id in the URL — trust it.
  if (hints.placeId && PLACE_ID_RE.test(hints.placeId)) return hints.placeId;

  if (!key) {
    // No API key configured: fall back to the ftid hint so we still store *something*.
    return hints.placeId ?? hints.ftid ?? (hints.cid ? `cid:${hints.cid}` : null);
  }

  // 1) ftid → place_id via the classic Place Details endpoint.
  if (hints.ftid) {
    const u = new URL("https://maps.googleapis.com/maps/api/place/details/json");
    u.searchParams.set("ftid", hints.ftid);
    u.searchParams.set("fields", "place_id");
    u.searchParams.set("key", key);
    try {
      const r = await fetch(u).then((res) => res.json() as Promise<{ result?: { place_id?: string }; status?: string }>);
      const pid = r?.result?.place_id;
      if (pid && PLACE_ID_RE.test(pid)) return pid;
    } catch {
      /* try next strategy */
    }
  }

  // 2) Business name → Find Place From Text.
  if (hints.name) {
    const u = new URL("https://maps.googleapis.com/maps/api/place/findplacefromtext/json");
    u.searchParams.set("input", hints.name);
    u.searchParams.set("inputtype", "textquery");
    u.searchParams.set("fields", "place_id");
    u.searchParams.set("key", key);
    try {
      const r = await fetch(u).then(
        (res) => res.json() as Promise<{ candidates?: Array<{ place_id?: string }> }>,
      );
      const pid = r?.candidates?.[0]?.place_id;
      if (pid && PLACE_ID_RE.test(pid)) return pid;
    } catch {
      /* fall through */
    }
  }

  // Last resort — keep a stable hint so rank lookups can still cache results.
  return hints.ftid ?? (hints.cid ? `cid:${hints.cid}` : null);
}

export const listCompetitors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("competitors")
      .select("id, name, gbp_url, place_id, notes, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const addCompetitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { name: string; gbpUrl: string; notes?: string }) => {
    return z
      .object({
        name: z.string().trim().min(1).max(120),
        gbpUrl: UrlSchema,
        notes: z.string().trim().max(500).optional(),
      })
      .parse(data);
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const placeId = await resolvePlaceId(data.gbpUrl);
    const { data: row, error } = await supabase
      .from("competitors")
      .insert({
        user_id: userId,
        name: data.name,
        gbp_url: data.gbpUrl,
        place_id: placeId,
        notes: data.notes ?? null,
      })
      .select("id, name, gbp_url, place_id, notes, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateCompetitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; name?: string; gbpUrl?: string; notes?: string }) => {
    return z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(120).optional(),
        gbpUrl: UrlSchema.optional(),
        notes: z.string().trim().max(500).optional(),
      })
      .parse(data);
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: {
      name?: string;
      gbp_url?: string;
      place_id?: string | null;
      notes?: string;
    } = {};
    if (data.name != null) patch.name = data.name;
    if (data.gbpUrl != null) {
      patch.gbp_url = data.gbpUrl;
      patch.place_id = await resolvePlaceId(data.gbpUrl);
    }
    if (data.notes != null) patch.notes = data.notes;
    const { error } = await supabase
      .from("competitors")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Re-run Place ID resolution for a saved competitor (useful after a failed lookup). */
export const refreshCompetitorPlaceId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error: readErr } = await supabase
      .from("competitors")
      .select("gbp_url")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row) throw new Error("Competitor not found");
    const placeId = await resolvePlaceId(row.gbp_url);
    const { error } = await supabase
      .from("competitors")
      .update({ place_id: placeId })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { placeId };
  });

export const deleteCompetitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("competitors")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
