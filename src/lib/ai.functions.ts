import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callLovableAI } from "./ai-gateway.server";

const InputSchema = z.object({ imageId: z.string().uuid() });

/**
 * Sends a signed image URL to Gemini vision and asks it to pick tag slugs
 * from the shared tag library. Returns the accepted slugs.
 */
export const suggestTagsForImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const { supabase, userId } = context;

    const { data: img, error } = await supabase
      .from("images")
      .select("id, storage_path, owner_id")
      .eq("id", data.imageId)
      .single();
    if (error || !img) throw new Error("Image not found");
    if (img.owner_id !== userId) throw new Error("Forbidden");

    const { data: signed } = await supabase.storage
      .from("frames")
      .createSignedUrl(img.storage_path, 300);
    if (!signed?.signedUrl) throw new Error("Could not sign image URL");

    const { data: tags } = await supabase
      .from("tags")
      .select("slug,label,category");
    const tagList = (tags ?? [])
      .map((t) => `${t.slug} (${t.label})`)
      .join(", ");

    const content = await callLovableAI({
      apiKey,
      model: "google/gemini-3-flash-preview",
      responseFormat: "json_object",
      messages: [
        {
          role: "system",
          content:
            "You are an image tagger. Pick 3 to 6 tag slugs from the provided list that best describe the image. Reply ONLY with JSON of shape {\"tags\":[\"slug1\",\"slug2\"]}. Slugs must exactly match ones from the list.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Available tags: ${tagList}` },
            { type: "image_url", image_url: { url: signed.signedUrl } },
          ],
        },
      ],
    });

    let parsed: { tags?: string[] } = {};
    try {
      parsed = JSON.parse(content) as { tags?: string[] };
    } catch {
      parsed = {};
    }
    const validSlugs = new Set((tags ?? []).map((t) => t.slug));
    const slugs = (parsed.tags ?? []).filter((s) => validSlugs.has(s));
    return { slugs };
  });

/**
 * Generates a short marketing-style description for an image.
 */
export const describeImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const { supabase, userId } = context;
    const { data: img, error } = await supabase
      .from("images")
      .select("id, storage_path, owner_id")
      .eq("id", data.imageId)
      .single();
    if (error || !img) throw new Error("Image not found");
    if (img.owner_id !== userId) throw new Error("Forbidden");

    const { data: signed } = await supabase.storage
      .from("frames")
      .createSignedUrl(img.storage_path, 300);
    if (!signed?.signedUrl) throw new Error("Could not sign image URL");

    const content = await callLovableAI({
      apiKey,
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content:
            "You write concise, upbeat marketing descriptions (1-2 sentences, max 220 characters) for cleaning/service business photos. Highlight cleanliness, professionalism, and results. Reply with the description only, no quotes.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this image for a social/CRM post." },
            { type: "image_url", image_url: { url: signed.signedUrl } },
          ],
        },
      ],
    });

    return { description: content.trim().replace(/^["']|["']$/g, "") };
  });
