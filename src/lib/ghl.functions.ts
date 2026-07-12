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

    const venueIds = Array.from(
      new Set(images.map((i) => i.venue_id).filter(Boolean)),
    ) as string[];
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

    const results: Array<{ imageId: string; ok: boolean; status: number; error?: string }> = [];

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

      try {
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        results.push({
          imageId: img.id,
          ok: res.ok,
          status: res.status,
          error: res.ok ? undefined : (await res.text()).slice(0, 200),
        });
      } catch (err) {
        results.push({
          imageId: img.id,
          ok: false,
          status: 0,
          error: err instanceof Error ? err.message : "network error",
        });
      }
    }

    return {
      sent: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  });
