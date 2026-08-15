import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callLovableAI, type ChatMessage } from "./ai-gateway.server";

/* ------------------------------------------------------------------ */
/*  Auto keyword ↔ image matching                                      */
/*  Uses a vision model to pick the most relevant keywords for each    */
/*  image from the user's keyword library, then writes image_keywords. */
/* ------------------------------------------------------------------ */

const Input = z.object({
  imageIds: z.array(z.string().uuid()).min(1).max(20),
  overwrite: z.boolean().default(false),
});

export const autoTagImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
    const { supabase, userId } = context;

    // Load candidate keywords (top 100 by volume) so the model has a fixed pool.
    const { data: kwRows } = await supabase
      .from("keywords")
      .select("id,phrase,cluster")
      .eq("owner_id", userId)
      .order("volume", { ascending: false, nullsFirst: false })
      .limit(100);
    const keywords = kwRows ?? [];
    if (keywords.length === 0) {
      throw new Error("No keywords in library. Import or add keywords first, then run auto-tag.");
    }

    // Load images
    const { data: imgs } = await supabase
      .from("images")
      .select("id,name,storage_path")
      .in("id", data.imageIds)
      .eq("owner_id", userId);
    if (!imgs?.length) throw new Error("No images found");

    let tagged = 0;
    let skipped = 0;
    const failures: Array<{ imageId: string; error: string }> = [];

    for (const img of imgs) {
      try {
        // Skip if already has keywords and overwrite=false
        if (!data.overwrite) {
          const { count } = await supabase
            .from("image_keywords")
            .select("*", { count: "exact", head: true })
            .eq("image_id", img.id);
          if ((count ?? 0) > 0) {
            skipped++;
            continue;
          }
        }

        const { data: signed } = await supabase.storage
          .from("frames")
          .createSignedUrl(img.storage_path, 300);
        if (!signed?.signedUrl) throw new Error("could not sign URL");

        const system = `You are a local-SEO tagger. Given an image and a list of candidate keywords, pick the 3 most relevant keyword IDs. Return STRICT JSON: { "primaryId": string, "secondaryIds": [string, string] }. Only use ids from the provided list.`;
        const kwList = keywords
          .map((k) => `- id=${k.id} :: "${k.phrase}"${k.cluster ? ` [${k.cluster}]` : ""}`)
          .join("\n");

        const userContent: ChatMessage["content"] = [
          {
            type: "text",
            text: `Candidate keywords:\n${kwList}\n\nPick the 3 most relevant for the attached image.`,
          },
          { type: "image_url", image_url: { url: signed.signedUrl } },
        ];

        const content = await callLovableAI({
          apiKey,
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: system },
            { role: "user", content: userContent },
          ],
        });

        const cleaned = content
          .trim()
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/```\s*$/i, "");
        const parsed = JSON.parse(cleaned) as {
          primaryId: string;
          secondaryIds: string[];
        };

        const validIds = new Set(keywords.map((k) => k.id));
        const primaryId = validIds.has(parsed.primaryId) ? parsed.primaryId : keywords[0].id;
        const secondary = (parsed.secondaryIds ?? [])
          .filter((id) => validIds.has(id) && id !== primaryId)
          .slice(0, 2);

        if (data.overwrite) {
          await supabase.from("image_keywords").delete().eq("image_id", img.id);
        }

        const rows = [
          { image_id: img.id, keyword_id: primaryId, is_primary: true, owner_id: userId },
          ...secondary.map((id) => ({
            image_id: img.id,
            keyword_id: id,
            is_primary: false,
            owner_id: userId,
          })),
        ];
        const { error } = await supabase
          .from("image_keywords")
          .upsert(rows as never, { onConflict: "image_id,keyword_id" });
        if (error) throw error;
        tagged++;
      } catch (e) {
        failures.push({
          imageId: img.id,
          error: e instanceof Error ? e.message : "unknown",
        });
      }
    }

    return { tagged, skipped, failed: failures.length, failures };
  });
