// Client-safe validation rules. Mirrors PROVIDER_RULES in
// user-integrations.functions.ts — keep the two in sync.

export type FieldRule = {
  label: string;
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  patternMessage?: string;
};

export type ProviderId =
  | "ghl"
  | "dataforseo"
  | "serpapi"
  | "serpstat"
  | "local_falcon"
  | "openai"
  | "gemini"
  | "anthropic"
  | "openrouter"
  | "n8n";

export const PROVIDER_RULES: Record<ProviderId, Record<string, FieldRule>> = {
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

export function validateField(rule: FieldRule, raw: string): string | null {
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
