import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callLovableAI } from "./ai-gateway.server";

/* ------------------------------------------------------------------ */
/*  AI Change Suggestions Engine                                       */
/*  Reads current keyword rankings + recent post activity and returns  */
/*  a short list of concrete, prioritized actions.                     */
/* ------------------------------------------------------------------ */

const SuggestInput = z.object({
  businessName: z.string().max(120).optional(),
  rankings: z
    .array(
      z.object({
        keyword: z.string(),
        current: z.number(),
        previous: z.number(),
        volume: z.number().optional(),
        city: z.string().optional(),
      }),
    )
    .max(40),
});

export const generateChangeSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SuggestInput.parse(data))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
    const { supabase, userId } = context;

    // Pull recent post activity for context
    const { data: recent } = await supabase
      .from("social_posts")
      .select("caption,status,created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    const rankingsText = data.rankings
      .map(
        (r) =>
          `- "${r.keyword}" rank #${r.current} (was #${r.previous}, Δ ${r.previous - r.current > 0 ? "+" : ""}${r.previous - r.current})${r.city ? ` — ${r.city}` : ""}${r.volume ? ` — ${r.volume}/mo` : ""}`,
      )
      .join("\n");

    const postsText = (recent ?? [])
      .map((p) => `- [${p.status}] ${p.caption.slice(0, 120)}…`)
      .join("\n");

    const system = `You are a senior local-SEO strategist for Google Business Profile.
Given a set of keyword rankings and recent GMB post activity, propose 3–5 SPECIFIC, prioritized actions the business should take THIS WEEK to improve local visibility.
Rules:
- Each suggestion must have: a short title, WHY (1 sentence, referencing the ranking or post data), and HOW (a concrete next step).
- Prioritize keywords that are close to breaking into top 3 or that recently dropped.
- Consider content gaps, geo-grid weak spots, review velocity, service pages, photo cadence.
- Return STRICT JSON only, no prose. Schema:
{ "suggestions": [ { "title": string, "priority": "high"|"medium"|"low", "why": string, "how": string, "targetKeyword": string|null } ] }`;

    const user = `Business: ${data.businessName ?? "Unnamed local business"}

Current rankings (top ${data.rankings.length}):
${rankingsText}

Recent posts:
${postsText || "(none yet)"}
`;

    const content = await callLovableAI({
      apiKey,
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    // Best-effort JSON parse
    const cleaned = content
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "");
    try {
      const parsed = JSON.parse(cleaned);
      return parsed as {
        suggestions: Array<{
          title: string;
          priority: "high" | "medium" | "low";
          why: string;
          how: string;
          targetKeyword: string | null;
        }>;
      };
    } catch {
      return { suggestions: [], raw: content };
    }
  });
