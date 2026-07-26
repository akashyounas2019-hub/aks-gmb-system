import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callLovableAI, type ChatMessage } from "./ai-gateway.server";

/* ------------------------------------------------------------------ */
/*  Compose a GMB caption with Lovable AI                              */
/* ------------------------------------------------------------------ */

const ComposeInput = z.object({
  keywords: z.array(z.string().min(1)).min(1).max(20),
  imageIds: z.array(z.string().uuid()).max(4).default([]),
  locationLabel: z.string().max(200).optional(),
  // Which LLM the user picked in the Compose screen.
  llm: z.enum(["gemini", "chatgpt", "aks"]).default("gemini"),
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

const LLM_MODELS: Record<"gemini" | "chatgpt", string> = {
  gemini: "google/gemini-2.5-flash",
  chatgpt: "openai/gpt-5-mini",
};



export const composePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ComposeInput.parse(data))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
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

    const content = await callLovableAI({
      apiKey,
      model: LLM_MODELS[data.llm],
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


export const sendPostToSocialPlanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SendInput.parse(data))
  .handler(async ({ data, context }) => {
    const webhook = process.env.N8N_WEBHOOK_URL || process.env.GHL_WEBHOOK_URL;
    if (!webhook)
      throw new Error(
        "No webhook configured. Set N8N_WEBHOOK_URL or GHL_WEBHOOK_URL.",
      );
    const { supabase, userId } = context;

    // Sign each image URL for 24h so the receiving webhook (n8n / GHL) can fetch it
    const imageUrls: Array<{ id: string; url: string; name: string }> = [];
    if (data.imageIds.length) {
      const { data: rows } = await supabase
        .from("images")
        .select("id, name, storage_path, owner_id")
        .in("id", data.imageIds)
        .eq("owner_id", userId);
      for (const row of rows ?? []) {
        const { data: signed } = await supabase.storage
          .from("frames")
          .createSignedUrl(row.storage_path, 60 * 60 * 24);
        if (signed?.signedUrl)
          imageUrls.push({ id: row.id, url: signed.signedUrl, name: row.name });
      }
    }

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
        status,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    const GMB_ACTION_MAP: Record<string, string> = {
      book: "ACTION_TYPE_BOOK",
      order: "ACTION_TYPE_ORDER",
      shop: "ACTION_TYPE_SHOP",
      learn_more: "ACTION_TYPE_LEARN_MORE",
      sign_up: "ACTION_TYPE_SIGN_UP",
      call: "ACTION_TYPE_CALL",
    };

    const payload = {
      source: "gmb-rank-pilot",
      target: "ghl-social-planner",
      post_id: inserted.id,
      caption: data.caption,
      primary_keyword: data.primaryKeyword ?? null,
      networks: data.networks,
      ghl_location_id: data.ghlLocationId ?? null,
      scheduled_at: data.scheduledAt ?? null,
      location: {
        label: data.locationLabel ?? null,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
      },
      cta:
        data.ctaType && data.ctaType !== "none"
          ? {
              type: data.ctaType,
              gmb_action_type: GMB_ACTION_MAP[data.ctaType] ?? null,
              url: data.ctaUrl ?? null,
            }
          : null,
      images: imageUrls,
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
        status: ok ? (data.scheduledAt ? "queued" : "sent") : "failed",
        provider_response: { status: providerStatus, ok },
        error: errorText,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", inserted.id);

    if (!ok)
      throw new Error(
        `Webhook responded ${providerStatus}: ${errorText ?? "unknown error"}`,
      );

    // Mark images as posted so they don't get selected again
    if (data.imageIds.length) {
      await supabase
        .from("images")
        .update({ posted_at: new Date().toISOString() } as any)
        .in("id", data.imageIds)
        .eq("owner_id", userId);
    }

    return { postId: inserted.id, status: data.scheduledAt ? "queued" : "sent" };
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
