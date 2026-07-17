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
  language: z.enum(["en", "ar", "both"]).default("en"),
  tone: z
    .enum(["friendly", "premium", "urgent", "informative"])
    .default("premium"),
  businessName: z.string().max(120).optional(),
  callToAction: z.string().max(200).optional(),
  extraContext: z.string().max(1000).optional(),
  // Optional template used ONLY as a stylistic reference — the model must
  // produce a fresh, unique caption in a similar voice/structure, never copy
  // sentences from it verbatim.
  styleReference: z
    .object({
      name: z.string().max(120).optional(),
      body: z.string().max(4000),
    })
    .optional(),
});


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

    const langInstruction =
      data.language === "ar"
        ? "Write the caption in Arabic (Modern Standard, natural UAE flavor). Use Arabic hashtags where possible."
        : data.language === "both"
          ? "Write two variants separated by a line with only '---'. First an English caption, then an Arabic caption (Modern Standard, natural UAE flavor)."
          : "Write the caption in English.";

    const system = `You are a senior local-SEO copywriter for a premium Dubai cleaning company.
Write a Google Business Profile post that:
- Reads natural, ${data.tone}, and human — never spammy.
- Weaves the provided keywords into the body naturally (do NOT list them).
- Ends with 3–6 hashtags derived from the keywords.
- Includes the location naturally in the first two sentences if provided.
- Stays under 1500 characters.
${langInstruction}
Return ONLY the caption text, no preamble.`;

    const userText = [
      data.businessName ? `Business: ${data.businessName}` : null,
      data.locationLabel ? `Location: ${data.locationLabel}` : null,
      `Keywords: ${data.keywords.join(", ")}`,
      data.callToAction ? `Call-to-action: ${data.callToAction}` : null,
      data.extraContext ? `Extra context: ${data.extraContext}` : null,
      imageUrls.length
        ? `There ${imageUrls.length === 1 ? "is 1 image" : `are ${imageUrls.length} images`} attached — describe what's visible only if it strengthens the post.`
        : null,
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

    const content = await callLovableAI({
      apiKey,
      model: "google/gemini-2.5-flash",
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
