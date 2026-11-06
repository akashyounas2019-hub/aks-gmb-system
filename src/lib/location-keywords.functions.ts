import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LocationKeyword = { id: string; name: string; created_at: string };

export const listLocationKeywords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("location_keywords")
      .select("id,name,created_at")
      .eq("owner_id", userId)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as LocationKeyword[];
  });

/** Add one or more locations (comma/newline separated input is split client-side). */
export const addLocationKeywords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ names: z.array(z.string().trim().min(1).max(120)).min(1).max(200) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing, error: readErr } = await supabase
      .from("location_keywords")
      .select("name")
      .eq("owner_id", userId);
    if (readErr) throw new Error(readErr.message);
    const seen = new Set((existing ?? []).map((r) => r.name.trim().toLowerCase()));
    const rows: { owner_id: string; name: string }[] = [];
    for (const raw of data.names) {
      const name = raw.trim();
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ owner_id: userId, name });
    }
    if (rows.length === 0) return { added: 0 };
    const { error } = await supabase.from("location_keywords").insert(rows);
    if (error) throw new Error(error.message);
    return { added: rows.length };
  });

export const deleteLocationKeyword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("location_keywords")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
