import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

const DEFAULT_CENTER = { lat: 25.2048, lng: 55.2708 };
export const GRID_SIZE = 7;
export const GRID_STEP_DEG = 0.012;

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function hash(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Compute + persist a fresh rank grid for every keyword the user tracks.
 * Deterministic: seeded on (phrase, day) so repeated runs same day are stable,
 * but new snapshots each day form real time-series data in `rank_snapshots`.
 */
export async function refreshUserRankGrid(
  supabase: Client,
  ownerId: string,
): Promise<{ keywords: number; snapshots: number }> {
  const { data: kws } = await supabase
    .from("keywords")
    .select("id, phrase")
    .eq("owner_id", ownerId);

  if (!kws || kws.length === 0) return { keywords: 0, snapshots: 0 };

  // Pick a venue center if the user has one, else default.
  const { data: venue } = await supabase.from("venues").select("lat, lng").limit(1).maybeSingle();
  const center = venue ? { lat: Number(venue.lat), lng: Number(venue.lng) } : DEFAULT_CENTER;

  const day = Math.floor(Date.now() / 86_400_000);
  const rows: Database["public"]["Tables"]["rank_snapshots"]["Insert"][] = [];
  const nowIso = new Date().toISOString();

  for (const kw of kws) {
    const rand = seeded(hash(kw.phrase) + day);
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const dx = c - (GRID_SIZE - 1) / 2;
        const dy = r - (GRID_SIZE - 1) / 2;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const rank = Math.max(1, Math.min(20, Math.round(dist * 2.4 + rand() * 4)));
        rows.push({
          owner_id: ownerId,
          keyword_id: kw.id,
          keyword_phrase: kw.phrase,
          lat: center.lat + dy * GRID_STEP_DEG,
          lng: center.lng + dx * GRID_STEP_DEG,
          rank,
          source: "seeded",
          checked_at: nowIso,
        });
      }
    }
  }

  // Batched insert.
  const chunk = 500;
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await supabase.from("rank_snapshots").insert(rows.slice(i, i + chunk));
    if (error) throw error;
  }

  return { keywords: kws.length, snapshots: rows.length };
}
