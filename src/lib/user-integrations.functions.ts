import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED_PROVIDERS = [
  "ghl",
  "dataforseo",
  "serpapi",
  "local_falcon",
] as const;
type Provider = (typeof ALLOWED_PROVIDERS)[number];

type StoredField = { c: string; m: string };

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
      const cfg = (row.config ?? {}) as Record<string, unknown>;
      const masked: Record<string, string> = {};
      for (const [k, v] of Object.entries(cfg)) {
        if (v && typeof v === "object" && "m" in (v as object)) {
          masked[k] = (v as StoredField).m;
        } else if (typeof v === "string") {
          // Legacy plaintext row — display generic mask.
          masked[k] = "••••";
        }
      }
      return {
        provider: row.provider as Provider,
        updatedAt: row.updated_at,
        masked,
        keys: Object.keys(masked),
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
    const { encryptSecret, maskValue } = await import("@/lib/integrations-crypto.server");
    const { supabase, userId } = context;

    const encrypted: Record<string, StoredField> = {};
    for (const [k, v] of Object.entries(data.config)) {
      encrypted[k] = { c: encryptSecret(v), m: maskValue(v) };
    }

    const { error } = await supabase.from("user_integrations").upsert(
      {
        user_id: userId,
        provider: data.provider,
        config: encrypted,
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

/**
 * Server-only helper for other server functions that need plaintext credentials
 * (e.g. to call GHL / DataForSEO / SerpApi / Local Falcon on the user's behalf).
 * Never expose the return value to the client.
 */
export async function getDecryptedIntegration(
  supabase: {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => {
            maybeSingle: () => Promise<{ data: { config: unknown } | null; error: unknown }>;
          };
        };
      };
    };
  },
  userId: string,
  provider: Provider,
): Promise<Record<string, string> | null> {
  const { decryptSecret } = await import("@/lib/integrations-crypto.server");
  const { data, error } = await supabase
    .from("user_integrations")
    .select("config")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw new Error(String(error));
  if (!data) return null;
  const cfg = (data.config ?? {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(cfg)) {
    if (v && typeof v === "object" && "c" in (v as object)) {
      out[k] = decryptSecret((v as StoredField).c);
    } else if (typeof v === "string") {
      out[k] = v; // legacy plaintext
    }
  }
  return out;
}
