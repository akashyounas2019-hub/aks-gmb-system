import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED_PROVIDERS = [
  "ghl",
  "dataforseo",
  "serpapi",
  "local_falcon",
] as const;
type Provider = (typeof ALLOWED_PROVIDERS)[number];

function mask(v: string | undefined): string | undefined {
  if (!v) return undefined;
  if (v.length <= 8) return "••••";
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

export const listIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_integrations")
      .select("provider, config, updated_at")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => {
      const cfg = (row.config ?? {}) as Record<string, string>;
      const masked: Record<string, string> = {};
      for (const [k, v] of Object.entries(cfg)) {
        masked[k] = mask(String(v)) ?? "";
      }
      return {
        provider: row.provider as Provider,
        updatedAt: row.updated_at,
        masked,
        keys: Object.keys(cfg),
      };
    });
  });

export const saveIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { provider: string; config: Record<string, string> }) => {
    if (!ALLOWED_PROVIDERS.includes(data.provider as Provider)) {
      throw new Error("Unsupported provider");
    }
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(data.config)) {
      const val = String(v ?? "").trim();
      if (val.length > 0) cleaned[k] = val;
    }
    if (Object.keys(cleaned).length === 0) throw new Error("Provide at least one field");
    return { provider: data.provider as Provider, config: cleaned };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("user_integrations").upsert(
      {
        user_id: userId,
        provider: data.provider,
        config: data.config,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { provider: string }) => {
    if (!ALLOWED_PROVIDERS.includes(data.provider as Provider)) {
      throw new Error("Unsupported provider");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("user_integrations")
      .delete()
      .eq("user_id", userId)
      .eq("provider", data.provider);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
