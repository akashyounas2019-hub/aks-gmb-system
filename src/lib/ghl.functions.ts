import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  imageIds: z.array(z.string().uuid()).min(1).max(50),
  extra: z
    .object({
      note: z.string().max(500).optional(),
      contactId: z.string().max(120).optional(),
    })
    .optional(),
});

/**
 * Sends selected images to the configured GoHighLevel inbound webhook.
 * For each image we generate a 24h signed URL (public URL variant) so GHL
 * can fetch the JPEG. Also forwards name, venue, lat/lng, tags.
 */
export const sendImagesToGhl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const webhookUrl = process.env.GHL_WEBHOOK_URL;
    if (!webhookUrl) throw new Error("GHL_WEBHOOK_URL is not configured");

    const { supabase, userId } = context;

    const { data: images, error } = await supabase
      .from("images")
      .select(
        "id, name, storage_path, lat, lng, venue_id, sharpness_score, width, height, created_at",
      )
      .in("id", data.imageIds)
      .eq("owner_id", userId);
    if (error) throw error;
    if (!images || images.length === 0) throw new Error("No images found");

    const venueIds = Array.from(new Set(images.map((i) => i.venue_id).filter(Boolean))) as string[];
    const venueMap = new Map<string, { name: string; address: string | null }>();
    if (venueIds.length > 0) {
      const { data: venues } = await supabase
        .from("venues")
        .select("id, name, address")
        .in("id", venueIds);
      for (const v of venues ?? []) venueMap.set(v.id, { name: v.name, address: v.address });
    }

    const tagRows = await supabase
      .from("image_tags")
      .select("image_id, tags(slug,label)")
      .in("image_id", data.imageIds);
    const tagMap = new Map<string, string[]>();
    for (const row of tagRows.data ?? []) {
      const t = (row as { tags?: { slug: string } }).tags;
      if (!t) continue;
      const arr = tagMap.get(row.image_id) ?? [];
      arr.push(t.slug);
      tagMap.set(row.image_id, arr);
    }

    const results: Array<{
      imageId: string;
      target: "ghl" | "n8n";
      ok: boolean;
      status: number;
      error?: string;
    }> = [];

    for (const img of images) {
      const { data: signed } = await supabase.storage
        .from("frames")
        .createSignedUrl(img.storage_path, 60 * 60 * 24); // 24h
      const imageUrl = signed?.signedUrl;

      const venue = img.venue_id ? venueMap.get(img.venue_id) : null;

      const payload = {
        source: "frame-vault",
        image_id: img.id,
        image_name: img.name,
        image_url: imageUrl,
        width: img.width,
        height: img.height,
        sharpness: img.sharpness_score,
        captured_at: img.created_at,
        location: {
          lat: img.lat != null ? Number(img.lat) : null,
          lng: img.lng != null ? Number(img.lng) : null,
          venue: venue?.name ?? null,
          address: venue?.address ?? null,
        },
        tags: tagMap.get(img.id) ?? [],
        note: data.extra?.note ?? null,
        contact_id: data.extra?.contactId ?? null,
      };

      // Option A: direct GHL inbound webhook.
      // Option B: n8n workflow relay (fires in parallel if N8N_WEBHOOK_URL is set).
      const targets: Array<{ label: "ghl" | "n8n"; url: string }> = [
        { label: "ghl", url: webhookUrl },
      ];
      if (process.env.N8N_WEBHOOK_URL) {
        targets.push({ label: "n8n", url: process.env.N8N_WEBHOOK_URL });
      }

      const perTarget = await Promise.all(
        targets.map(async (t) => {
          try {
            const res = await fetch(t.url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...payload, _target: t.label }),
            });
            return {
              imageId: img.id,
              target: t.label,
              ok: res.ok,
              status: res.status,
              error: res.ok ? undefined : (await res.text()).slice(0, 200),
            };
          } catch (err) {
            return {
              imageId: img.id,
              target: t.label,
              ok: false,
              status: 0,
              error: err instanceof Error ? err.message : "network error",
            };
          }
        }),
      );
      results.push(...perTarget);
    }

    return {
      sent: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  });

/* ------------------------------------------------------------------ */
/*  GoHighLevel Social Planner → Google Business Profile               */
/* ------------------------------------------------------------------ */

const GHL_EXTRA_KEYS = ["account_id", "account_name", "user_id"] as const;

/** Lists the social accounts (and, if the token allows, users) of the saved GHL location. */
export const ghlListTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { getGhlTarget } = await import("./ghl-posting.server");
    const target = await getGhlTarget(supabase, userId);
    if (!target) {
      throw new Error("Save your GHL Private Integration Token and Location ID first.");
    }
    const { listGhlAccounts, listGhlUsers } = await import("./ghl-api.server");
    const [accounts, users] = await Promise.all([
      listGhlAccounts(target.token, target.locationId),
      listGhlUsers(target.token, target.locationId),
    ]);
    if (!accounts.ok) {
      throw new Error(
        `Could not load GHL accounts — ${accounts.error}. Check the token has the "socialplanner/account.readonly" scope and the Location ID is right.`,
      );
    }
    return {
      accounts: accounts.data ?? [],
      users: users.ok ? (users.data ?? []) : [],
      usersError: users.ok ? null : users.error,
      selected: { accountId: target.accountId, userId: target.userId },
    };
  });

/** Saves the chosen GMB account + "post as" user next to the encrypted token. */
export const ghlSaveTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        accountId: z.string().trim().min(3).max(64),
        accountName: z.string().trim().max(200).optional(),
        userId: z
          .string()
          .trim()
          .max(64)
          .regex(/^[A-Za-z0-9]*$/, "User ID must be alphanumeric")
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { encryptSecret, maskValue } = await import("@/lib/integrations-crypto.server");
    const { data: row, error } = await supabase
      .from("user_integrations")
      .select("config")
      .eq("user_id", userId)
      .eq("provider", "ghl")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Save your GHL token and Location ID first.");
    const config = { ...((row.config ?? {}) as Record<string, unknown>) };
    const put = (k: (typeof GHL_EXTRA_KEYS)[number], v?: string) => {
      if (v) config[k] = { c: encryptSecret(v), m: k === "account_name" ? v : maskValue(v) };
      else delete config[k];
    };
    put("account_id", data.accountId);
    put("account_name", data.accountName);
    put("user_id", data.userId);
    const { error: upErr } = await supabase
      .from("user_integrations")
      .update({ config: config as never, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("provider", "ghl");
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

/** Creates a DRAFT post in GHL — proves token, scopes and account work without publishing. */
export const ghlSendTestDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { getGhlTarget } = await import("./ghl-posting.server");
    const target = await getGhlTarget(supabase, userId);
    if (!target?.accountId) throw new Error("Pick your Google Business account first.");
    const { createGhlPost } = await import("./ghl-api.server");
    const res = await createGhlPost(target.token, target.locationId, {
      accountIds: [target.accountId],
      userId: target.userId,
      caption: "Test draft from GMB Rank Pilot — safe to delete.",
      media: [],
      draft: true,
    });
    if (!res.ok) throw new Error(res.error ?? "GHL rejected the test draft");
    return { ok: true, postId: res.postId ?? null };
  });

async function loadGhlPostRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  postId: string,
) {
  const { data: post, error } = await supabase
    .from("social_posts")
    .select(
      "id, owner_id, caption, image_ids, scheduled_at, cta_type, cta_url, status, provider_response",
    )
    .eq("id", postId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!post) throw new Error("Post not found");
  const ghlPostId =
    (post.provider_response as { ghl_post_id?: string } | null)?.ghl_post_id ?? null;
  return { post, ghlPostId };
}

/** After editing a post that GHL is holding for later, push the changes to GHL. */
export const ghlSyncScheduledPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ postId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { post, ghlPostId } = await loadGhlPostRow(supabase, userId, data.postId);
    if (!ghlPostId || post.status !== "scheduled") return { synced: false as const };
    const { getGhlTarget, syncPostToGhl } = await import("./ghl-posting.server");
    const target = await getGhlTarget(supabase, userId);
    if (!target) throw new Error("GHL is no longer connected — reconnect it in Settings.");
    const res = await syncPostToGhl(supabase, target, ghlPostId, post);
    if (!res.ok) throw new Error(res.error ?? "GHL update failed");
    return { synced: true as const };
  });

/** Before deleting a post that GHL is holding for later, remove it from GHL too. */
export const ghlDeleteScheduledPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ postId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { post, ghlPostId } = await loadGhlPostRow(supabase, userId, data.postId);
    if (!ghlPostId || post.status !== "scheduled") return { removed: false as const };
    const { getGhlTarget, removePostFromGhl } = await import("./ghl-posting.server");
    const target = await getGhlTarget(supabase, userId);
    if (!target) throw new Error("GHL is no longer connected — reconnect it in Settings.");
    const res = await removePostFromGhl(target, ghlPostId);
    if (!res.ok && res.status !== 404) throw new Error(res.error ?? "GHL delete failed");
    return { removed: true as const };
  });
