import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED_PROVIDERS = [
  "ghl",
  "dataforseo",
  "serpapi",
  "serpstat",
  "local_falcon",
  "openai",
  "gemini",
  "anthropic",
  "openrouter",
  "n8n",
] as const;
export type Provider = (typeof ALLOWED_PROVIDERS)[number];

type StoredField = { c: string; m: string };

type Rule = {
  label: string;
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  patternMessage?: string;
};
const PROVIDER_RULES: Record<Provider, Record<string, Rule>> = {
  ghl: {
    api_key: {
      label: "Private Integration Token",
      required: true,
      min: 20,
      max: 512,
      pattern: /^[A-Za-z0-9._-]+$/,
      patternMessage: "Only letters, numbers, '.', '_', and '-' are allowed.",
    },
    location_id: {
      label: "Location ID",
      required: true,
      min: 3,
      max: 64,
      pattern: /^[A-Za-z0-9]+$/,
      patternMessage: "Location ID must be alphanumeric.",
    },
  },
  dataforseo: {
    login: {
      label: "Login (email)",
      required: true,
      max: 254,
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      patternMessage: "Enter a valid email address.",
    },
    password: { label: "API password", required: true, min: 8, max: 256 },
  },
  serpapi: {
    api_key: {
      label: "API key",
      required: true,
      min: 32,
      max: 128,
      pattern: /^[A-Za-z0-9]+$/,
      patternMessage: "SerpApi keys are alphanumeric.",
    },
  },
  serpstat: {
    api_key: {
      label: "API key",
      required: true,
      min: 16,
      max: 128,
      pattern: /^[A-Za-z0-9._-]+$/,
      patternMessage: "Only letters, numbers, '.', '_', and '-' are allowed.",
    },
  },
  local_falcon: {
    api_key: {
      label: "API key",
      required: true,
      min: 16,
      max: 128,
      pattern: /^[A-Za-z0-9._-]+$/,
      patternMessage: "Only letters, numbers, '.', '_', and '-' are allowed.",
    },
  },
  openai: {
    api_key: {
      label: "API key",
      required: true,
      min: 20,
      max: 256,
      pattern: /^sk-[A-Za-z0-9_-]+$/,
      patternMessage: "OpenAI keys start with 'sk-'.",
    },
  },
  gemini: {
    api_key: {
      label: "API key",
      required: true,
      min: 20,
      max: 128,
      pattern: /^[A-Za-z0-9_-]+$/,
      patternMessage: "Only letters, numbers, '_', and '-' are allowed.",
    },
  },
  anthropic: {
    api_key: {
      label: "API key",
      required: true,
      min: 20,
      max: 256,
      pattern: /^sk-ant-[A-Za-z0-9_-]+$/,
      patternMessage: "Anthropic keys start with 'sk-ant-'.",
    },
  },
  openrouter: {
    api_key: {
      label: "API key",
      required: true,
      min: 20,
      max: 256,
      pattern: /^sk-or-[A-Za-z0-9_-]+$/,
      patternMessage: "OpenRouter keys start with 'sk-or-'.",
    },
  },
  n8n: {
    webhook_url: {
      label: "Webhook URL",
      required: true,
      min: 10,
      max: 1000,
      pattern: /^https?:\/\/.+/,
      patternMessage: "Enter a full http(s):// webhook URL.",
    },
    auth_header: { label: "Auth header name", max: 200 },
    auth_token: { label: "Auth token", max: 1000 },
  },
};

function validateField(rule: Rule, raw: string): string | null {
  const v = raw.trim();
  if (!v) return rule.required ? `${rule.label} is required.` : null;
  if (rule.min && v.length < rule.min)
    return `${rule.label} must be at least ${rule.min} characters.`;
  if (rule.max && v.length > rule.max)
    return `${rule.label} must be at most ${rule.max} characters.`;
  if (rule.pattern && !rule.pattern.test(v))
    return rule.patternMessage ?? `${rule.label} format is invalid.`;
  return null;
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
    const provider = data.provider as Provider;
    const rules = PROVIDER_RULES[provider];
    const cleaned: Record<string, string> = {};
    const errors: string[] = [];
    for (const [k, rule] of Object.entries(rules)) {
      const raw = String(data.config?.[k] ?? "");
      const err = validateField(rule, raw);
      if (err) {
        errors.push(err);
        continue;
      }
      const trimmed = raw.trim();
      if (trimmed) cleaned[k] = trimmed;
    }
    // Reject unknown keys so callers can't smuggle extra fields into storage.
    for (const k of Object.keys(data.config ?? {})) {
      if (!(k in rules)) errors.push(`Unknown field "${k}".`);
    }
    if (errors.length > 0) throw new Error(errors.join(" "));
    return { provider, config: cleaned };
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
  // Any Supabase-shaped client (typed or generic) — we only use .from().select().eq().eq().maybeSingle().
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
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
