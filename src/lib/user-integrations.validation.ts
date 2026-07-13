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

export type ProviderId = "ghl" | "dataforseo" | "serpapi" | "local_falcon" | "facebook" | "instagram";

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
};

export function validateField(rule: FieldRule, raw: string): string | null {
  const v = raw.trim();
  if (!v) return rule.required ? `${rule.label} is required.` : null;
  if (rule.min && v.length < rule.min) return `${rule.label} must be at least ${rule.min} characters.`;
  if (rule.max && v.length > rule.max) return `${rule.label} must be at most ${rule.max} characters.`;
  if (rule.pattern && !rule.pattern.test(v)) return rule.patternMessage ?? `${rule.label} format is invalid.`;
  return null;
}
