import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Google Business Profile OAuth + API integration.
 *
 * Scopes: `business.manage` covers My Business Business Information,
 * Account Management, and Business Profile Performance APIs. All three
 * APIs must be enabled in the user's Google Cloud project AND have quota
 * approved by Google for real data to return.
 */
const SCOPE = "https://www.googleapis.com/auth/business.manage";
const REDIRECT_PATH = "/gmb-oauth-callback";

/**
 * Structured server-side logger for the GMB sync path. Every line is
 * prefixed with `[gmb]` and a step tag so the worker log can be grepped
 * to see exactly what happened: whether tokens loaded, whether a refresh
 * ran, which account/location was requested, and which Google API call
 * returned no data. Sensitive values are masked — never log raw tokens
 * or client secrets.
 */
function mask(value: string | null | undefined, keep = 4): string {
  if (!value) return "<none>";
  if (value.length <= keep) return "*".repeat(value.length);
  return `${value.slice(0, keep)}…${value.slice(-2)} (len=${value.length})`;
}
function logGmb(step: string, userId: string, payload: Record<string, unknown> = {}) {
  try {
    // eslint-disable-next-line no-console
    console.log(
      `[gmb] step=${step} user=${userId.slice(0, 8)} ${JSON.stringify(payload)}`,
    );
  } catch {
    // eslint-disable-next-line no-console
    console.log(`[gmb] step=${step} user=${userId.slice(0, 8)} <unserializable payload>`);
  }
}


type SupabaseCtx = {
  supabase: ReturnType<typeof getSupabaseType>;
  userId: string;
};
function getSupabaseType() {
  return null as unknown as import("@supabase/supabase-js").SupabaseClient;
}

async function loadCreds(ctx: SupabaseCtx) {
  const { data, error } = await ctx.supabase
    .from("gmb_credentials")
    .select("client_id, client_secret")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Add your Google OAuth Client ID and Secret first.");
  return data as { client_id: string; client_secret: string };
}

async function loadTokens(ctx: SupabaseCtx) {
  const { data, error } = await ctx.supabase
    .from("gmb_tokens")
    .select("*")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (error) {
    logGmb("loadTokens.error", ctx.userId, { message: error.message });
    throw new Error(error.message);
  }
  logGmb("loadTokens", ctx.userId, {
    hasTokens: Boolean(data),
    accessToken: mask((data?.access_token as string | null) ?? null),
    refreshToken: mask((data?.refresh_token as string | null) ?? null),
    expiresAt: data?.expires_at ?? null,
    accountName: (data?.account_name as string | null) ?? null,
    locationName: (data?.location_name as string | null) ?? null,
    locationTitle: (data?.location_title as string | null) ?? null,
    scope: (data?.scope as string | null) ?? null,
  });
  return data;
}

async function refreshIfNeeded(
  ctx: SupabaseCtx,
  tokens: NonNullable<Awaited<ReturnType<typeof loadTokens>>>,
): Promise<string> {
  const expMs = new Date(tokens.expires_at as string).getTime();
  const secondsToExpiry = Math.round((expMs - Date.now()) / 1000);
  if (expMs - Date.now() > 60_000) {
    logGmb("token.reuse", ctx.userId, { secondsToExpiry });
    return tokens.access_token as string;
  }
  logGmb("token.refresh.start", ctx.userId, {
    secondsToExpiry,
    hasRefreshToken: Boolean(tokens.refresh_token),
  });
  if (!tokens.refresh_token) {
    throw new Error("Access token expired and no refresh token stored. Reconnect Google.");
  }
  if (!tokens.refresh_token) {
    throw new Error("Access token expired and no refresh token stored. Reconnect Google.");
  }
  const creds = await loadCreds(ctx);
  const body = new URLSearchParams({
    client_id: creds.client_id,
    client_secret: creds.client_secret,
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token as string,
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    logGmb("token.refresh.error", ctx.userId, {
      status: res.status,
      error: json.error,
      description: json.error_description,
    });
    throw new Error(`Refresh failed: ${json.error_description ?? json.error ?? res.statusText}`);
  }
  const expiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString();
  await ctx.supabase
    .from("gmb_tokens")
    .update({
      access_token: json.access_token,
      expires_at: expiresAt,
      scope: json.scope ?? tokens.scope,
      token_type: json.token_type ?? tokens.token_type,
    })
    .eq("user_id", ctx.userId);
  logGmb("token.refresh.ok", ctx.userId, {
    newAccessToken: mask(json.access_token),
    expiresAt,
    scope: json.scope,
  });
  return json.access_token;
}

async function callGoogle(accessToken: string, url: string, userId?: string): Promise<unknown> {
  const t0 = Date.now();
  const endpoint = url.split("?")[0];
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  const ms = Date.now() - t0;
  if (!res.ok) {
    const msg =
      (body as { error?: { message?: string } } | null)?.error?.message ??
      (typeof body === "string" ? body : JSON.stringify(body));
    if (userId) {
      logGmb("google.error", userId, { endpoint, status: res.status, ms, message: msg });
    } else {
      // eslint-disable-next-line no-console
      console.log(`[gmb] step=google.error endpoint=${endpoint} status=${res.status} ms=${ms} message=${msg}`);
    }
    throw new Error(`Google API ${res.status}: ${msg}`);
  }
  if (userId) {
    logGmb("google.ok", userId, { endpoint, status: res.status, ms });
  }
  return body;
}

// ─── Build authorization URL ──────────────────────────────────────────
export const getGmbAuthUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { origin: string }) =>
    z.object({ origin: z.string().url() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const creds = await loadCreds(context as SupabaseCtx);
    const redirectUri = `${data.origin}${REDIRECT_PATH}`;
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", creds.client_id);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPE);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "true");
    return { url: url.toString(), redirectUri };
  });

// ─── Exchange authorization code for tokens ───────────────────────────
export const exchangeGmbCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { code: string; origin: string }) =>
    z.object({ code: z.string().min(10), origin: z.string().url() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as SupabaseCtx;
    const creds = await loadCreds(ctx);
    const redirectUri = `${data.origin}${REDIRECT_PATH}`;
    const body = new URLSearchParams({
      code: data.code,
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !json.access_token) {
      logGmb("exchange.error", ctx.userId, {
        status: res.status,
        error: json.error,
        description: json.error_description,
        redirectUri,
      });
      throw new Error(`Token exchange failed: ${json.error_description ?? json.error ?? res.statusText}`);
    }
    const expiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString();

    // Preserve refresh_token if a subsequent auth omits it
    const existing = await loadTokens(ctx);
    const refreshToken = json.refresh_token ?? existing?.refresh_token ?? null;

    const { error: upsertErr } = await ctx.supabase.from("gmb_tokens").upsert(
      {
        user_id: ctx.userId,
        access_token: json.access_token,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        scope: json.scope ?? SCOPE,
        token_type: json.token_type ?? "Bearer",
        account_name: existing?.account_name ?? null,
        location_name: existing?.location_name ?? null,
        location_title: existing?.location_title ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (upsertErr) {
      logGmb("exchange.upsert.error", ctx.userId, { message: upsertErr.message });
      throw new Error(upsertErr.message);
    }
    logGmb("exchange.ok", ctx.userId, {
      accessToken: mask(json.access_token),
      refreshToken: mask(refreshToken),
      expiresAt,
      scope: json.scope,
      keptExistingLocation: Boolean(existing?.location_name),
    });
    return { ok: true };
  });

// ─── Connection status ────────────────────────────────────────────────
export const getGmbConnectionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as SupabaseCtx;
    const tokens = await loadTokens(ctx);
    if (!tokens) {
      logGmb("status", ctx.userId, { connected: false, reason: "no_tokens" });
      return { connected: false as const };
    }
    const result = {
      connected: true as const,
      accountName: tokens.account_name as string | null,
      locationName: tokens.location_name as string | null,
      locationTitle: tokens.location_title as string | null,
      expiresAt: tokens.expires_at as string,
      hasRefresh: Boolean(tokens.refresh_token),
    };
    logGmb("status", ctx.userId, {
      connected: true,
      accountName: result.accountName,
      locationName: result.locationName,
      locationTitle: result.locationTitle,
      hasRefresh: result.hasRefresh,
      // Diagnostic: this is the #1 cause of "still showing dummy data".
      // If locationName is null the metrics fetch cannot run.
      needsLocation: !result.locationName,
    });
    return result;
  });

export const disconnectGmb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as SupabaseCtx;
    const tokens = await loadTokens(ctx);
    // Best-effort revoke
    if (tokens?.refresh_token) {
      try {
        await fetch(
          `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(
            tokens.refresh_token as string,
          )}`,
          { method: "POST" },
        );
      } catch {
        /* ignore */
      }
    }
    await ctx.supabase.from("gmb_tokens").delete().eq("user_id", ctx.userId);
    return { ok: true };
  });

// ─── List accounts + locations ────────────────────────────────────────
type Account = { name: string; accountName?: string };
type Location = { name: string; title?: string; storefrontAddress?: unknown };

export const listGmbAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as SupabaseCtx;
    logGmb("listAccounts.start", ctx.userId);
    const tokens = await loadTokens(ctx);
    if (!tokens) {
      logGmb("listAccounts.error", ctx.userId, { reason: "no_tokens" });
      throw new Error("Not connected to Google");
    }
    const at = await refreshIfNeeded(ctx, tokens);

    const acctResp = (await callGoogle(
      at,
      "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
      ctx.userId,
    )) as { accounts?: Account[] };
    const accounts = acctResp.accounts ?? [];
    logGmb("listAccounts.accounts", ctx.userId, {
      count: accounts.length,
      names: accounts.map((a) => a.name),
    });

    const results = await Promise.all(
      accounts.map(async (acct) => {
        try {
          const locResp = (await callGoogle(
            at,
            `https://mybusinessbusinessinformation.googleapis.com/v1/${acct.name}/locations?readMask=name,title,storefrontAddress`,
            ctx.userId,
          )) as { locations?: Location[] };
          const locations = (locResp.locations ?? []).map((l) => ({
            name: l.name,
            title: l.title ?? l.name,
          }));
          logGmb("listAccounts.locations", ctx.userId, {
            account: acct.name,
            count: locations.length,
            titles: locations.map((l) => l.title),
          });
          return {
            account: acct.name,
            accountLabel: acct.accountName ?? acct.name,
            locations,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to list locations";
          logGmb("listAccounts.locations.error", ctx.userId, {
            account: acct.name,
            message,
          });
          return {
            account: acct.name,
            accountLabel: acct.accountName ?? acct.name,
            locations: [],
            error: message,
          };
        }
      }),
    );
    return results;
  });

// ─── Persist selected location ────────────────────────────────────────
export const setGmbLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { account: string; location: string; locationTitle: string }) =>
      z
        .object({
          account: z.string().min(1),
          location: z.string().min(1),
          locationTitle: z.string().min(1),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as SupabaseCtx;
    logGmb("setLocation.start", ctx.userId, {
      account: data.account,
      location: data.location,
      locationTitle: data.locationTitle,
    });
    const { error } = await ctx.supabase
      .from("gmb_tokens")
      .update({
        account_name: data.account,
        location_name: data.location,
        location_title: data.locationTitle,
      })
      .eq("user_id", ctx.userId);
    if (error) {
      logGmb("setLocation.error", ctx.userId, { message: error.message });
      throw new Error(error.message);
    }
    logGmb("setLocation.ok", ctx.userId, {
      account: data.account,
      location: data.location,
    });
    return { ok: true };
  });

// ─── Performance metrics ──────────────────────────────────────────────
const METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
] as const;
type Metric = (typeof METRICS)[number];

export const getGmbMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as SupabaseCtx;
    logGmb("metrics.start", ctx.userId);
    const tokens = await loadTokens(ctx);
    if (!tokens) {
      logGmb("metrics.error", ctx.userId, { reason: "no_tokens" });
      throw new Error("Not connected to Google");
    }
    if (!tokens.location_name) {
      logGmb("metrics.error", ctx.userId, {
        reason: "no_location_selected",
        accountName: tokens.account_name,
        hint: "User must pick a Business Profile location in Settings → Integrations.",
      });
      throw new Error("Select a business location first");
    }
    logGmb("metrics.location", ctx.userId, {
      account: tokens.account_name,
      location: tokens.location_name,
      locationTitle: tokens.location_title,
    });
    const at = await refreshIfNeeded(ctx, tokens);

    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - 30);

    async function fetchRange(from: Date, to: Date) {
      const qs = new URLSearchParams();
      for (const m of METRICS) qs.append("dailyMetrics", m);
      qs.set("dailyRange.start_date.year", String(from.getUTCFullYear()));
      qs.set("dailyRange.start_date.month", String(from.getUTCMonth() + 1));
      qs.set("dailyRange.start_date.day", String(from.getUTCDate()));
      qs.set("dailyRange.end_date.year", String(to.getUTCFullYear()));
      qs.set("dailyRange.end_date.month", String(to.getUTCMonth() + 1));
      qs.set("dailyRange.end_date.day", String(to.getUTCDate()));
      const url = `https://businessprofileperformance.googleapis.com/v1/${tokens!.location_name}:fetchMultiDailyMetricsTimeSeries?${qs.toString()}`;
      return (await callGoogle(at, url, ctx.userId)) as {
        multiDailyMetricTimeSeries?: Array<{
          dailyMetricTimeSeries?: Array<{
            dailyMetric?: Metric;
            timeSeries?: {
              datedValues?: Array<{
                date?: { year?: number; month?: number; day?: number };
                value?: string;
              }>;
            };
          }>;
        }>;
      };
    }

    function sumBy(payload: Awaited<ReturnType<typeof fetchRange>>) {
      const totals: Record<string, number> = Object.fromEntries(METRICS.map((m) => [m, 0]));
      const daily: Record<string, Array<{ date: string; value: number }>> = Object.fromEntries(
        METRICS.map((m) => [m, []]),
      );
      for (const group of payload.multiDailyMetricTimeSeries ?? []) {
        for (const s of group.dailyMetricTimeSeries ?? []) {
          const m = s.dailyMetric;
          if (!m) continue;
          for (const dv of s.timeSeries?.datedValues ?? []) {
            const v = Number(dv.value ?? 0);
            totals[m] += v;
            if (dv.date) {
              const d = `${dv.date.year}-${String(dv.date.month).padStart(2, "0")}-${String(
                dv.date.day,
              ).padStart(2, "0")}`;
              daily[m].push({ date: d, value: v });
            }
          }
        }
      }
      return { totals, daily };
    }

    const [cur, prev] = await Promise.all([
      fetchRange(start, end),
      fetchRange(prevStart, prevEnd),
    ]);
    const curAgg = sumBy(cur);
    const prevAgg = sumBy(prev);

    const impressions =
      curAgg.totals.BUSINESS_IMPRESSIONS_DESKTOP_MAPS +
      curAgg.totals.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH +
      curAgg.totals.BUSINESS_IMPRESSIONS_MOBILE_MAPS +
      curAgg.totals.BUSINESS_IMPRESSIONS_MOBILE_SEARCH;
    const impressionsPrev =
      prevAgg.totals.BUSINESS_IMPRESSIONS_DESKTOP_MAPS +
      prevAgg.totals.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH +
      prevAgg.totals.BUSINESS_IMPRESSIONS_MOBILE_MAPS +
      prevAgg.totals.BUSINESS_IMPRESSIONS_MOBILE_SEARCH;

    function pct(cur: number, prev: number) {
      if (prev === 0) return cur === 0 ? 0 : 100;
      return Math.round(((cur - prev) / prev) * 100);
    }

    logGmb("metrics.ok", ctx.userId, {
      location: tokens.location_name,
      range: `${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}`,
      impressions,
      callClicks: curAgg.totals.CALL_CLICKS,
      websiteClicks: curAgg.totals.WEBSITE_CLICKS,
      directionRequests: curAgg.totals.BUSINESS_DIRECTION_REQUESTS,
      // If everything is 0, Google returned no data — usually means the
      // Business Profile Performance API isn't enabled for the project, or
      // the location has no traffic in the last 30 days.
      allZero:
        impressions === 0 &&
        curAgg.totals.CALL_CLICKS === 0 &&
        curAgg.totals.WEBSITE_CLICKS === 0 &&
        curAgg.totals.BUSINESS_DIRECTION_REQUESTS === 0,
    });
    return {
      locationTitle: tokens.location_title as string | null,
      range: {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
      },
      totals: {
        impressions,
        callClicks: curAgg.totals.CALL_CLICKS,
        websiteClicks: curAgg.totals.WEBSITE_CLICKS,
        directionRequests: curAgg.totals.BUSINESS_DIRECTION_REQUESTS,
      },
      deltas: {
        impressions: pct(impressions, impressionsPrev),
        callClicks: pct(curAgg.totals.CALL_CLICKS, prevAgg.totals.CALL_CLICKS),
        websiteClicks: pct(curAgg.totals.WEBSITE_CLICKS, prevAgg.totals.WEBSITE_CLICKS),
        directionRequests: pct(
          curAgg.totals.BUSINESS_DIRECTION_REQUESTS,
          prevAgg.totals.BUSINESS_DIRECTION_REQUESTS,
        ),
      },
      daily: curAgg.daily,
    };
  });
