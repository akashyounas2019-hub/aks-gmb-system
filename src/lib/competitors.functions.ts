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

/**
 * Best-effort extract of the Google Place ID from a GBP/Maps URL.
 * Real resolution requires the Places API; here we pull hex "ftid" or the
 * "!1s0x…" chunk when present so we have a stable identifier.
 */
function extractPlaceHint(url: string): string | null {
  const ftid = url.match(/[?&]ftid=([^&]+)/i);
  if (ftid) return decodeURIComponent(ftid[1]);
  const bang = url.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  if (bang) return bang[1];
  const cid = url.match(/[?&]cid=(\d+)/i);
  if (cid) return `cid:${cid[1]}`;
  return null;
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
    const placeId = extractPlaceHint(data.gbpUrl);
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
      patch.place_id = extractPlaceHint(data.gbpUrl);
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
