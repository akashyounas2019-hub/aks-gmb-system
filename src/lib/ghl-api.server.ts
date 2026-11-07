// Direct GoHighLevel (LeadConnector) API client for the Social Planner.
// Uses the Private Integration Token + Location ID saved (encrypted) in
// Settings → Integrations, plus the Google Business account + user picked
// there. Request shapes follow the official docs:
//   https://marketplace.gohighlevel.com/docs/2021-04-15/ghl/social-planner/create-post.md
//   https://marketplace.gohighlevel.com/docs/2021-04-15/ghl/social-planner/get-account.md
//
// Required Private Integration scopes:
//   socialplanner/post.write, socialplanner/post.readonly,
//   socialplanner/account.readonly, users.readonly (optional — only used to
//   look up the "post as" user automatically).

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
/** Social Planner endpoints only accept this Version header value. */
const SOCIAL_VERSION = "2021-04-15";
/** Users API version. */
const USERS_VERSION = "2021-07-28";

export type GhlResult<T = unknown> = { ok: boolean; status: number; error?: string; data?: T };

async function ghlFetch<T>(
  token: string,
  path: string,
  init: { method?: string; body?: unknown; version?: string } = {},
): Promise<GhlResult<T>> {
  try {
    const res = await fetch(`${GHL_BASE_URL}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Version: init.version ?? SOCIAL_VERSION,
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    const text = await res.text();
    // One line per GHL call (no token / body) so deliveries can be verified in server logs.
    console.info(
      `[ghl] ${init.method ?? "GET"} ${path.split("?")[0]} -> ${res.status}${
        res.ok ? "" : ` ${text.slice(0, 300)}`
      }`,
    );
    let json: unknown = undefined;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      /* non-JSON body */
    }
    if (!res.ok) {
      const msg =
        (json as { message?: string | string[] } | undefined)?.message ?? text.slice(0, 500);
      return {
        ok: false,
        status: res.status,
        error: `GHL ${res.status}: ${Array.isArray(msg) ? msg.join("; ") : msg}`,
      };
    }
    return { ok: true, status: res.status, data: json as T };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : "network error" };
  }
}

/* -------------------------------- accounts -------------------------------- */

export type GhlSocialAccount = {
  id: string;
  name: string;
  platform: string; // "google" for Google Business Profile
  type: string;
  isExpired: boolean;
  active: boolean;
};

export async function listGhlAccounts(
  token: string,
  locationId: string,
): Promise<GhlResult<GhlSocialAccount[]>> {
  const res = await ghlFetch<{ results?: { accounts?: Record<string, unknown>[] } }>(
    token,
    `/social-media-posting/${encodeURIComponent(locationId)}/accounts`,
  );
  if (!res.ok) return { ok: false, status: res.status, error: res.error };
  const accounts = (res.data?.results?.accounts ?? []).map((a) => ({
    id: String(a.id ?? a._id ?? ""),
    name: String(a.name ?? "Unnamed account"),
    platform: String(a.platform ?? ""),
    type: String(a.type ?? ""),
    isExpired: Boolean(a.isExpired),
    active: a.active === undefined ? true : Boolean(a.active),
  }));
  return { ok: true, status: res.status, data: accounts.filter((a) => a.id) };
}

export type GhlUser = { id: string; name: string; email?: string };

export async function listGhlUsers(
  token: string,
  locationId: string,
): Promise<GhlResult<GhlUser[]>> {
  const res = await ghlFetch<{ users?: Record<string, unknown>[] }>(
    token,
    `/users/?locationId=${encodeURIComponent(locationId)}`,
    { version: USERS_VERSION },
  );
  if (!res.ok) return { ok: false, status: res.status, error: res.error };
  const users = (res.data?.users ?? []).map((u) => ({
    id: String(u.id ?? u._id ?? ""),
    name:
      String(u.name ?? "").trim() ||
      `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() ||
      String(u.email ?? "User"),
    email: u.email ? String(u.email) : undefined,
  }));
  return { ok: true, status: res.status, data: users.filter((u) => u.id) };
}

/* ---------------------------------- posts --------------------------------- */

/** GHL `gmbPostDetails.actionType` values. Accepts our lower- or upper-case CTA ids. */
const GMB_ACTION_TYPES = new Set(["order", "book", "shop", "learn_more", "call", "sign_up"]);

export type GhlMedia = { url: string; type: string };

export type GhlPostInput = {
  accountIds: string[];
  userId?: string | null;
  caption: string;
  media: GhlMedia[];
  ctaType?: string | null;
  ctaUrl?: string | null;
  /** ISO time — when set and in the future GHL schedules the post itself. */
  scheduleAt?: string | null;
  /** Create as a draft (used by "Send test draft"). */
  draft?: boolean;
};

export function buildGhlPostBody(p: GhlPostInput): Record<string, unknown> {
  const scheduled =
    !p.draft && !!p.scheduleAt && new Date(p.scheduleAt).getTime() > Date.now() + 60_000;
  const body: Record<string, unknown> = {
    type: "post",
    accountIds: p.accountIds,
    summary: p.caption,
    media: p.media,
    status: p.draft ? "draft" : scheduled ? "scheduled" : "published",
    ...(scheduled ? { scheduleDate: new Date(p.scheduleAt as string).toISOString() } : {}),
    ...(p.userId ? { userId: p.userId } : {}),
  };
  const action = (p.ctaType ?? "").toLowerCase();
  if (GMB_ACTION_TYPES.has(action)) {
    body.gmbPostDetails = {
      gmbEventType: "STANDARD",
      actionType: action,
      // `url` is required for every action except "call".
      ...(action !== "call" && p.ctaUrl ? { url: p.ctaUrl } : {}),
    };
  }
  return body;
}

function extractPostId(data: unknown): string | null {
  const d = data as Record<string, any> | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
  const candidates = [
    d?.results?.post?._id,
    d?.results?.post?.id,
    d?.results?._id,
    d?.results?.id,
    d?.post?._id,
    d?.post?.id,
    d?._id,
    d?.id,
  ];
  const hit = candidates.find((c) => typeof c === "string" && c.length > 0);
  return hit ?? null;
}

export async function createGhlPost(
  token: string,
  locationId: string,
  post: GhlPostInput,
): Promise<GhlResult & { postId?: string | null; scheduled?: boolean }> {
  const body = buildGhlPostBody(post);
  const res = await ghlFetch(
    token,
    `/social-media-posting/${encodeURIComponent(locationId)}/posts`,
    {
      method: "POST",
      body,
    },
  );
  return {
    ...res,
    postId: res.ok ? extractPostId(res.data) : null,
    scheduled: body.status === "scheduled",
  };
}

export async function updateGhlPost(
  token: string,
  locationId: string,
  ghlPostId: string,
  post: GhlPostInput,
): Promise<GhlResult & { scheduled?: boolean }> {
  const body = buildGhlPostBody(post);
  const res = await ghlFetch(
    token,
    `/social-media-posting/${encodeURIComponent(locationId)}/posts/${encodeURIComponent(ghlPostId)}`,
    { method: "PUT", body },
  );
  return { ...res, scheduled: body.status === "scheduled" };
}

export async function deleteGhlPost(
  token: string,
  locationId: string,
  ghlPostId: string,
): Promise<GhlResult> {
  return ghlFetch(
    token,
    `/social-media-posting/${encodeURIComponent(locationId)}/posts/${encodeURIComponent(ghlPostId)}`,
    { method: "DELETE" },
  );
}

/** GHL accepts these media MIME types (docs: media[].type enum). */
export function ghlMediaType(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "mp4") return "video/mp4";
  if (ext === "mov") return "video/mov";
  if (ext === "webm") return "video/webm";
  if (!ext || ext === path.toLowerCase()) return "image/jpeg";
  return null; // e.g. webp / heic are not accepted by GHL
}
