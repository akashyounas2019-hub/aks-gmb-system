import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callLovableAI, type ChatMessage } from "./ai-gateway.server";
import { getDecryptedIntegration } from "./user-integrations.functions";
import { callDirectLLM, type DirectProvider } from "./direct-llm.server";

/* ------------------------------------------------------------------ */
/*  Compose a GMB caption with Lovable AI                              */
/* ------------------------------------------------------------------ */

const ComposeInput = z.object({
  keywords: z.array(z.string().min(1)).min(1).max(20),
  imageIds: z.array(z.string().uuid()).max(4).default([]),
  locationLabel: z.string().max(200).optional(),
  // Which LLM the user picked in the Compose screen.
  llm: z.enum(["gemini", "chatgpt", "anthropic", "openrouter", "aks"]).default("gemini"),
  businessName: z.string().max(120).optional(),
  callToAction: z.string().max(200).optional(),
  extraContext: z.string().max(1000).optional(),
  // Template used ONLY as a structural blueprint — the model must mirror the
  // layout/section order and write brand-new copy from the keywords + images.
  styleReference: z
    .object({
      name: z.string().max(120).optional(),
      body: z.string().max(4000),
    })
    .optional(),
});

const LLM_MODELS: Record<"gemini" | "chatgpt" | "anthropic" | "openrouter", string> = {
  gemini: "google/gemini-2.5-flash",
  chatgpt: "openai/gpt-5-mini",
  anthropic: "anthropic/claude-sonnet-5",
  openrouter: "google/gemini-2.5-flash",
};

// Maps the Compose-screen LLM choice to the Settings → Integrations provider
// whose saved key should be tried first, before falling back to the shared
// Lovable AI gateway.
const LLM_TO_DIRECT_PROVIDER: Record<"gemini" | "chatgpt" | "anthropic" | "openrouter", DirectProvider> = {
  gemini: "gemini",
  chatgpt: "openai",
  anthropic: "anthropic",
  openrouter: "openrouter",
};



export const composePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ComposeInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Sign up to 4 image URLs so the vision model can see the frames
    const imageUrls: string[] = [];
    if (data.imageIds.length) {
      const { data: rows } = await supabase
        .from("images")
        .select("id, storage_path, owner_id")
        .in("id", data.imageIds)
        .eq("owner_id", userId);
      for (const row of rows ?? []) {
        const { data: signed } = await supabase.storage
          .from("frames")
          .createSignedUrl(row.storage_path, 300);
        if (signed?.signedUrl) imageUrls.push(signed.signedUrl);
      }
    }

    const system = `You are a senior local-SEO copywriter for a premium Dubai cleaning company.
Write a Google Business Profile post that:
- Reads natural and human — never spammy.
- Weaves the provided keywords into the body naturally (do NOT list them).
- Describes what is actually visible in the attached image(s) when they are provided.
- Ends with 3–6 hashtags derived from the keywords.
- Includes the location naturally in the first two sentences if provided.
- Stays under 1500 characters.
- Written in English.
- If a TEMPLATE is provided, follow ONLY its structural format: the order and number of sections, line/paragraph breaks, where emojis sit, bullet style, and where hashtags/CTA go. Every word must be newly written from the current keywords and images — never reuse its sentences, offers, prices, brand names, or hashtags.
Return ONLY the caption text, no preamble.`;

    const styleBlock = data.styleReference
      ? `\nTEMPLATE (structural blueprint ONLY — copy the layout, section order, line breaks and emoji/hashtag placement; DO NOT copy any wording, offers, prices, brand names, or hashtags from it):\n"""\n${data.styleReference.body}\n"""\n`
      : "";

    const userText = [
      data.businessName ? `Business: ${data.businessName}` : null,
      data.locationLabel ? `Location: ${data.locationLabel}` : null,
      `Keywords: ${data.keywords.join(", ")}`,
      data.callToAction ? `Call-to-action: ${data.callToAction}` : null,
      data.extraContext ? `Extra context: ${data.extraContext}` : null,
      imageUrls.length
        ? `There ${imageUrls.length === 1 ? "is 1 image" : `are ${imageUrls.length} images`} attached — analyse what is visible and let it shape the description.`
        : null,
      styleBlock || null,
    ]
      .filter(Boolean)
      .join("\n");

    const userContent: ChatMessage["content"] = imageUrls.length
      ? [
          { type: "text", text: userText },
          ...imageUrls.map((url) => ({
            type: "image_url" as const,
            image_url: { url },
          })),
        ]
      : userText;

    // "AKS Cloud" routes generation through the configured AKS/n8n worker
    // instead of the built-in models.
    if (data.llm === "aks") {
      const worker = process.env.N8N_WEBHOOK_URL || process.env.GHL_WEBHOOK_URL;
      if (!worker)
        throw new Error(
          "AKS Cloud is not connected yet. Add your AKS worker webhook in Settings → Integrations, or pick Gemini / ChatGPT.",
        );
      const res = await fetch(worker, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "gmb-rank-pilot",
          target: "aks-cloud",
          action: "compose_post",
          system,
          prompt: userText,
          keywords: data.keywords,
          images: imageUrls,
          template: data.styleReference?.body ?? null,
        }),
      });
      if (!res.ok)
        throw new Error(
          `AKS Cloud responded ${res.status}: ${(await res.text()).slice(0, 300)}`,
        );
      const raw = await res.text();
      let caption = raw;
      try {
        const json = JSON.parse(raw) as Record<string, unknown>;
        caption =
          (json.caption as string) ??
          (json.description as string) ??
          (json.text as string) ??
          (json.output as string) ??
          raw;
      } catch {
        // plain-text response
      }
      if (!caption.trim()) throw new Error("AKS Cloud returned an empty caption");
      return { caption: caption.trim() };
    }

    // Prefer the user's own API key (Settings → Integrations) so generation
    // doesn't depend on the shared Lovable AI gateway credit balance. Falls
    // back to the Lovable gateway only if no key is saved or the direct call
    // fails for a reason other than a bad/missing key.
    const directProvider = LLM_TO_DIRECT_PROVIDER[data.llm];
    const saved = await getDecryptedIntegration(supabase, userId, directProvider).catch(() => null);
    const savedKey = saved?.api_key;

    if (savedKey) {
      try {
        const caption = await callDirectLLM(directProvider, savedKey, [
          { role: "system", text: system },
          { role: "user", text: userText, imageUrls },
        ]);
        if (caption.trim()) return { caption: caption.trim() };
      } catch (e) {
        // Fall through to the Lovable gateway below, but surface the direct
        // failure if that fallback also has no key configured.
        const lovableKey = process.env.LOVABLE_API_KEY;
        if (!lovableKey) throw e;
      }
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error(
        `No ${directProvider} key configured in Settings → Integrations, and the built-in AI gateway is not set up. Add your own API key, or contact support to enable the built-in option.`,
      );
    }

    const content = await callLovableAI({
      apiKey,
      model: LLM_MODELS[data.llm as "gemini" | "chatgpt" | "anthropic" | "openrouter"],
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    });

    return { caption: content.trim() };
  });

/* ------------------------------------------------------------------ */
/*  Push the finished post to GHL Social Planner (via n8n or direct)   */
/* ------------------------------------------------------------------ */

const SendInput = z.object({
  caption: z.string().min(1).max(1500),
  imageIds: z.array(z.string().uuid()).max(10).default([]),
  locationLabel: z.string().max(200).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  primaryKeyword: z.string().max(200).optional(),
  ghlLocationId: z.string().max(120).optional(),
  scheduledAt: z.string().datetime().optional(),
  networks: z
    .array(z.enum(["gmb", "facebook", "instagram", "linkedin", "twitter"]))
    .default(["gmb"]),
  ctaType: z
    .enum(["none", "book", "order", "shop", "learn_more", "sign_up", "call"])
    .default("none"),
  ctaUrl: z.string().max(500).optional(),
});


/**
 * A `social_posts` row as needed to actually dispatch it — shared shape
 * between the "send now" server function and the cron dispatcher, which
 * loads existing rows straight from the database.
 */
export type DispatchablePost = {
  id: string;
  owner_id: string;
  caption: string;
  image_ids: string[] | null;
  location_label: string | null;
  lat: number | null;
  lng: number | null;
  ghl_location_id: string | null;
  scheduled_at: string | null;
  primary_keyword?: string | null;
  networks?: string[] | null;
  cta_type?: string | null;
  cta_url?: string | null;
};

const GMB_ACTION_MAP: Record<string, string> = {
  book: "ACTION_TYPE_BOOK",
  order: "ACTION_TYPE_ORDER",
  shop: "ACTION_TYPE_SHOP",
  learn_more: "ACTION_TYPE_LEARN_MORE",
  sign_up: "ACTION_TYPE_SIGN_UP",
  call: "ACTION_TYPE_CALL",
};

/**
 * Sends a persisted social_posts row to the configured destination (GHL
 * direct API if connected, otherwise the n8n/GHL webhook) and updates its
 * status. Used both by "send now" and by the scheduled-post dispatcher —
 * the one place that actually delivers a post, so the row's status always
 * reflects reality instead of just "queued and hoped for."
 *
 * Only marks the post's images as posted on a real, successful dispatch —
 * never just because the post was scheduled or created.
 */
export async function dispatchSocialPost(
  post: DispatchablePost,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<{ ok: boolean; status: "sent" | "failed"; error?: string }> {
  const imageIds = post.image_ids ?? [];

  // Sign each image URL for 24h so the receiving webhook (n8n / GHL) can fetch it
  const imageUrls: Array<{ id: string; url: string; name: string }> = [];
  if (imageIds.length) {
    const { data: rows } = await supabase
      .from("images")
      .select("id, name, storage_path, owner_id")
      .in("id", imageIds)
      .eq("owner_id", post.owner_id);
    for (const row of rows ?? []) {
      const { data: signed } = await supabase.storage
        .from("frames")
        .createSignedUrl(row.storage_path, 60 * 60 * 24);
      if (signed?.signedUrl)
        imageUrls.push({ id: row.id, url: signed.signedUrl, name: row.name });
    }
  }

  // Prefer a direct GHL connection (Settings → Integrations) if the user has
  // one saved; otherwise fall back to the n8n/GHL webhook relay.
  let ok = false;
  let providerStatus = 0;
  let errorText: string | null = null;
  let usedDirectGhl = false;

  const ghlCreds = await getDecryptedIntegration(supabase, post.owner_id, "ghl").catch(() => null);
  if (ghlCreds?.api_key && ghlCreds?.location_id) {
    usedDirectGhl = true;
    try {
      const { publishToGhl } = await import("./ghl-api.server");
      const res = await publishToGhl(ghlCreds.api_key, ghlCreds.location_id, {
        caption: post.caption,
        imageUrls: imageUrls.map((i) => i.url),
        ctaType: post.cta_type ?? "none",
        ctaUrl: post.cta_url ?? null,
      });
      ok = res.ok;
      providerStatus = res.status;
      errorText = res.error ?? null;
    } catch (err) {
      errorText = err instanceof Error ? err.message : "GHL request failed";
    }
  }

  if (!usedDirectGhl) {
    // Prefer the user's own saved n8n webhook (Settings → Integrations) over
    // the shared server env vars — this was previously localStorage-only and
    // never actually reached the server, so a "Test" success there gave no
    // indication of whether sending would really work.
    const n8nCreds = await getDecryptedIntegration(supabase, post.owner_id, "n8n").catch(() => null);
    const webhook = n8nCreds?.webhook_url || process.env.N8N_WEBHOOK_URL || process.env.GHL_WEBHOOK_URL;
    if (!webhook) {
      errorText = "No GHL connection and no webhook configured. Add a GHL API key or n8n webhook in Settings → Integrations.";
    } else {
      const payload = {
        source: "gmb-rank-pilot",
        target: "ghl-social-planner",
        post_id: post.id,
        caption: post.caption,
        primary_keyword: post.primary_keyword ?? null,
        networks: post.networks ?? ["gmb"],
        ghl_location_id: post.ghl_location_id ?? null,
        scheduled_at: post.scheduled_at ?? null,
        location: {
          label: post.location_label ?? null,
          lat: post.lat ?? null,
          lng: post.lng ?? null,
        },
        cta:
          post.cta_type && post.cta_type !== "none"
            ? {
                type: post.cta_type,
                gmb_action_type: GMB_ACTION_MAP[post.cta_type] ?? null,
                url: post.cta_url ?? null,
              }
            : null,
        images: imageUrls,
      };
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (n8nCreds?.auth_header && n8nCreds?.auth_token) {
          headers[n8nCreds.auth_header] = n8nCreds.auth_token;
        }
        const res = await fetch(webhook, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        providerStatus = res.status;
        ok = res.ok;
        if (!res.ok) errorText = (await res.text()).slice(0, 500);
      } catch (err) {
        errorText = err instanceof Error ? err.message : "network error";
      }
    }
  }

  await supabase
    .from("social_posts")
    .update({
      status: ok ? "sent" : "failed",
      provider_response: { status: providerStatus, ok, via: usedDirectGhl ? "ghl_api" : "webhook" },
      error: errorText,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", post.id);

  // Only mark images posted once the post has actually, successfully gone out.
  if (ok && imageIds.length) {
    await supabase
      .from("images")
      .update({ posted_at: new Date().toISOString() } as any)
      .in("id", imageIds)
      .eq("owner_id", post.owner_id);
  }

  return { ok, status: ok ? "sent" : "failed", error: errorText ?? undefined };
}

export const sendPostToSocialPlanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SendInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Persist to social_posts first (draft/queued)
    const status = data.scheduledAt ? "queued" : "sending";
    const { data: inserted, error: insErr } = await supabase
      .from("social_posts")
      .insert({
        owner_id: userId,
        caption: data.caption,
        image_ids: data.imageIds,
        location_label: data.locationLabel ?? null,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        ghl_location_id: data.ghlLocationId ?? null,
        scheduled_at: data.scheduledAt ?? null,
        cta_type: data.ctaType,
        cta_url: data.ctaUrl ?? null,
        status,
      } as any)
      .select("id")
      .single();
    if (insErr) throw insErr;

    // Scheduling for later is a purely internal action — the social_posts row
    // above already makes it show up on the Post Scheduler calendar. Actually
    // sending it happens later, when the cron dispatcher sees its time is due
    // (see run-automations → auto_publish). Nothing is marked "posted" yet.
    if (data.scheduledAt) {
      return { postId: inserted.id, status: "queued" as const };
    }

    const result = await dispatchSocialPost(
      {
        id: inserted.id,
        owner_id: userId,
        caption: data.caption,
        image_ids: data.imageIds,
        location_label: data.locationLabel ?? null,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        ghl_location_id: data.ghlLocationId ?? null,
        scheduled_at: null,
        primary_keyword: data.primaryKeyword,
        networks: data.networks,
        cta_type: data.ctaType,
        cta_url: data.ctaUrl ?? null,
      },
      supabase,
    );

    if (!result.ok) throw new Error(result.error ?? "Failed to send post");

    return { postId: inserted.id, status: "sent" as const };
  });

/* ------------------------------------------------------------------ */
/*  List social posts (for calendar / history view)                    */
/* ------------------------------------------------------------------ */

export const listSocialPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("social_posts")
      .select(
        "id,caption,status,scheduled_at,created_at,updated_at,error,image_ids,location_label,ghl_location_id",
      )
      .eq("owner_id", userId)
      .order("scheduled_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return { posts: data ?? [] };
  });

/* ------------------------------------------------------------------ */
/*  Retry a failed / queued social post                                */
/* ------------------------------------------------------------------ */

const RetryInput = z.object({ postId: z.string().uuid() });

export const retrySocialPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => RetryInput.parse(data))
  .handler(async ({ data, context }) => {
    const webhook = process.env.N8N_WEBHOOK_URL || process.env.GHL_WEBHOOK_URL;
    if (!webhook) throw new Error("No webhook configured.");
    const { supabase, userId } = context;

    const { data: post, error } = await supabase
      .from("social_posts")
      .select("*")
      .eq("id", data.postId)
      .eq("owner_id", userId)
      .single();
    if (error || !post) throw new Error("Post not found");

    // Re-sign image URLs
    const imageUrls: Array<{ id: string; url: string; name: string }> = [];
    if (post.image_ids?.length) {
      const { data: rows } = await supabase
        .from("images")
        .select("id,name,storage_path")
        .in("id", post.image_ids)
        .eq("owner_id", userId);
      for (const row of rows ?? []) {
        const { data: signed } = await supabase.storage
          .from("frames")
          .createSignedUrl(row.storage_path, 60 * 60 * 24);
        if (signed?.signedUrl)
          imageUrls.push({ id: row.id, url: signed.signedUrl, name: row.name });
      }
    }

    const payload = {
      source: "gmb-rank-pilot",
      target: "ghl-social-planner",
      post_id: post.id,
      caption: post.caption,
      ghl_location_id: post.ghl_location_id,
      scheduled_at: post.scheduled_at,
      location: {
        label: post.location_label,
        lat: post.lat,
        lng: post.lng,
      },
      images: imageUrls,
      retry: true,
    };

    let ok = false;
    let providerStatus = 0;
    let errorText: string | null = null;
    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      providerStatus = res.status;
      ok = res.ok;
      if (!res.ok) errorText = (await res.text()).slice(0, 500);
    } catch (err) {
      errorText = err instanceof Error ? err.message : "network error";
    }

    await supabase
      .from("social_posts")
      .update({
        status: ok ? (post.scheduled_at ? "queued" : "sent") : "failed",
        provider_response: { status: providerStatus, ok, retry: true },
        error: errorText,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", post.id);

    if (!ok)
      throw new Error(
        `Webhook responded ${providerStatus}: ${errorText ?? "unknown error"}`,
      );

    return { ok: true, postId: post.id };
  });
