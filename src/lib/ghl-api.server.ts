// Direct GoHighLevel API client — publishes a post straight to GHL's Social
// Planner using the Private Integration Token + Location ID already
// collected (and encrypted) in Settings → Integrations, instead of only the
// n8n/GHL webhook relay or the manual CSV export. All three paths coexist:
// this is tried first when a GHL key is saved; the webhook is the fallback;
// the CSV export remains available as a manual option regardless.
//
// Docs: https://highlevel.stoplight.io/docs/integrations/ (Social Media Posting)

const GHL_API_VERSION = "2021-07-28";
const GHL_BASE_URL = "https://services.leadconnectorhq.com";

const GMB_ACTION_MAP: Record<string, string> = {
  book: "ACTION_TYPE_BOOK",
  order: "ACTION_TYPE_ORDER",
  shop: "ACTION_TYPE_SHOP",
  learn_more: "ACTION_TYPE_LEARN_MORE",
  sign_up: "ACTION_TYPE_SIGN_UP",
  call: "ACTION_TYPE_CALL",
};

export async function publishToGhl(
  apiKey: string,
  locationId: string,
  post: {
    caption: string;
    imageUrls: string[];
    ctaType?: string | null;
    ctaUrl?: string | null;
  },
): Promise<{ ok: boolean; status: number; error?: string }> {
  const body: Record<string, unknown> = {
    accountIds: [], // GHL resolves connected GMB accounts for this location automatically
    summary: post.caption,
    ...(post.imageUrls.length ? { medias: post.imageUrls.map((url) => ({ url })) } : {}),
  };

  if (post.ctaType && post.ctaType !== "none") {
    body.type = "GOOGLE_MY_BUSINESS";
    body.googleMyBusiness = {
      callToAction: {
        actionType: GMB_ACTION_MAP[post.ctaType] ?? "ACTION_TYPE_LEARN_MORE",
        url: post.ctaUrl ?? undefined,
      },
    };
  }

  try {
    const res = await fetch(`${GHL_BASE_URL}/social-media-posting/${locationId}/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        Version: GHL_API_VERSION,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return { ok: false, status: res.status, error: (await res.text()).slice(0, 500) };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : "network error" };
  }
}
