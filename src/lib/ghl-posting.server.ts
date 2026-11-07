// Glue between our social_posts rows and the GHL Social Planner API.
import { getDecryptedIntegration } from "./user-integrations.functions";
import {
  createGhlPost,
  deleteGhlPost,
  ghlMediaType,
  updateGhlPost,
  type GhlMedia,
  type GhlPostInput,
} from "./ghl-api.server";

export type GhlTarget = {
  token: string;
  locationId: string;
  accountId: string | null;
  userId: string | null;
};

/** The user's saved GHL connection, or null if no token/location is saved. */
export async function getGhlTarget(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ownerId: string,
): Promise<GhlTarget | null> {
  const cfg = await getDecryptedIntegration(supabase, ownerId, "ghl").catch(() => null);
  if (!cfg?.api_key || !cfg?.location_id) return null;
  return {
    token: cfg.api_key,
    locationId: cfg.location_id,
    accountId: cfg.account_id || null,
    userId: cfg.user_id || null,
  };
}

const DAY = 24 * 60 * 60;

/**
 * Public media URLs GHL can fetch. Signed URLs stay valid until a few days
 * after the scheduled time, so GHL can still read them when it publishes.
 */
export async function ghlMediaForImages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ownerId: string,
  imageIds: string[],
  scheduleAt: string | null,
): Promise<{ media: GhlMedia[]; skipped: string[]; imageNames: Record<string, string> }> {
  const media: GhlMedia[] = [];
  const skipped: string[] = [];
  const imageNames: Record<string, string> = {};
  if (!imageIds.length) return { media, skipped, imageNames };

  const untilSchedule = scheduleAt
    ? Math.max(0, Math.ceil((new Date(scheduleAt).getTime() - Date.now()) / 1000))
    : 0;
  const expiresIn = Math.min(365 * DAY, Math.max(DAY, untilSchedule + 3 * DAY));

  const { data: rows } = await supabase
    .from("images")
    .select("id, name, storage_path")
    .in("id", imageIds)
    .eq("owner_id", ownerId);
  // keep the user's chosen order
  const byId = new Map((rows ?? []).map((r: { id: string }) => [r.id, r]));
  for (const id of imageIds) {
    const row = byId.get(id) as { id: string; name: string; storage_path: string } | undefined;
    if (!row) continue;
    imageNames[row.id] = row.name;
    const type = ghlMediaType(row.storage_path);
    if (!type) {
      skipped.push(row.name || row.id);
      continue;
    }
    const { data: signed } = await supabase.storage
      .from("frames")
      .createSignedUrl(row.storage_path, expiresIn);
    if (signed?.signedUrl) media.push({ url: signed.signedUrl, type });
  }
  return { media, skipped, imageNames };
}

export type GhlPostRow = {
  id: string;
  owner_id: string;
  caption: string;
  image_ids: string[] | null;
  scheduled_at: string | null;
  cta_type?: string | null;
  cta_url?: string | null;
};

async function buildInput(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  target: GhlTarget,
  post: GhlPostRow,
): Promise<{ input: GhlPostInput; skipped: string[] }> {
  const { media, skipped } = await ghlMediaForImages(
    supabase,
    post.owner_id,
    post.image_ids ?? [],
    post.scheduled_at,
  );
  return {
    skipped,
    input: {
      accountIds: target.accountId ? [target.accountId] : [],
      userId: target.userId,
      caption: post.caption,
      media,
      ctaType: post.cta_type ?? null,
      ctaUrl: post.cta_url ?? null,
      scheduleAt: post.scheduled_at,
    },
  };
}

const NO_ACCOUNT =
  "No Google Business account selected for GoHighLevel. Open Settings → Integrations → GoHighLevel and pick your GMB account.";

/** Create the post in GHL (published now, or scheduled for post.scheduled_at). */
export async function sendPostToGhl(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  target: GhlTarget,
  post: GhlPostRow,
) {
  if (!target.accountId) {
    return { ok: false, status: 0, error: NO_ACCOUNT, scheduled: false, postId: null };
  }
  const { input, skipped } = await buildInput(supabase, target, post);
  const res = await createGhlPost(target.token, target.locationId, input);
  const note = skipped.length ? ` (skipped unsupported images: ${skipped.join(", ")})` : "";
  return { ...res, error: res.error ? res.error + note : undefined, skippedNote: note };
}

/** Push edits of an already-created GHL post (caption / images / time / CTA). */
export async function syncPostToGhl(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  target: GhlTarget,
  ghlPostId: string,
  post: GhlPostRow,
) {
  if (!target.accountId) return { ok: false, status: 0, error: NO_ACCOUNT };
  const { input } = await buildInput(supabase, target, post);
  return updateGhlPost(target.token, target.locationId, ghlPostId, input);
}

export async function removePostFromGhl(target: GhlTarget, ghlPostId: string) {
  return deleteGhlPost(target.token, target.locationId, ghlPostId);
}
