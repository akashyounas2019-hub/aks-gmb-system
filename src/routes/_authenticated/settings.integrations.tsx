import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, Bot, CheckCircle2, Eye, EyeOff, ExternalLink, KeyRound, Loader2, MapPin, Plug, Radar, Route as RouteIcon, Search, ShieldCheck, Sparkles, Webhook, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getGmbCredentialsStatus,
  saveGmbCredentials,
  clearGmbCredentials,
} from "@/lib/gmb-credentials.functions";
import {
  getGmbAuthUrl,
  getGmbConnectionStatus,
  disconnectGmb,
  listGmbAccounts,
  setGmbLocation,
} from "@/lib/gmb-oauth.functions";
import {
  listIntegrations,
  saveIntegration,
  deleteIntegration,
} from "@/lib/user-integrations.functions";
import { PROVIDER_RULES, validateField, type ProviderId } from "@/lib/user-integrations.validation";

export const Route = createFileRoute("/_authenticated/settings/integrations")({
  component: IntegrationsPage,
});

type GmbConn = {
  connected: boolean;
  accountName?: string;
  locationName?: string;
  connectedAt?: string;
};

const STORAGE_KEY = "gmb_connection_v1";

export function readGmbConnection(): GmbConn {
  if (typeof window === "undefined") return { connected: false };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { connected: false };
    return JSON.parse(raw);
  } catch {
    return { connected: false };
  }
}

export function writeGmbConnection(conn: GmbConn) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conn));
  window.dispatchEvent(new Event("gmb-connection-changed"));
}

type CredStatus =
  | { configured: false }
  | { configured: true; clientIdMasked: string; updatedAt: string };

function IntegrationsPage() {
  const [gmb, setGmb] = useState<GmbConn>({ connected: false });
  const [busy, setBusy] = useState(false);
  const [credStatus, setCredStatus] = useState<CredStatus | null>(null);
  const [showCredForm, setShowCredForm] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [savingCreds, setSavingCreds] = useState(false);

  // Real OAuth connection state
  type ServerConn = {
    connected: boolean;
    accountName?: string | null;
    locationName?: string | null;
    locationTitle?: string | null;
    expiresAt?: string;
    hasRefresh?: boolean;
  };
  const [serverConn, setServerConn] = useState<ServerConn>({ connected: false });
  const [accounts, setAccounts] = useState<
    Array<{ account: string; accountLabel: string; locations: Array<{ name: string; title: string }>; error?: string }>
  >([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [savingLoc, setSavingLoc] = useState(false);

  const fetchStatus = useServerFn(getGmbCredentialsStatus);
  const saveCreds = useServerFn(saveGmbCredentials);
  const removeCreds = useServerFn(clearGmbCredentials);
  const getAuthUrl = useServerFn(getGmbAuthUrl);
  const fetchConn = useServerFn(getGmbConnectionStatus);
  const fetchAccounts = useServerFn(listGmbAccounts);
  const chooseLocation = useServerFn(setGmbLocation);
  const revoke = useServerFn(disconnectGmb);

  const syncConn = useCallback(async () => {
    try {
      const s = await fetchConn();
      setServerConn(s);
      // Only mark "connected" once a location has been selected — otherwise
      // gmb-analytics would show "Live · connected" while getGmbMetrics still
      // throws "Select a business location first" and the UI keeps rendering
      // sample data.
      writeGmbConnection(
        s.connected && s.locationName
          ? {
              connected: true,
              accountName: s.accountName ?? "Google Business Profile",
              locationName: s.locationTitle ?? s.locationName ?? "Location",
              connectedAt: new Date().toISOString(),
            }
          : { connected: false },
      );
      setGmb(readGmbConnection());
    } catch {
      setServerConn({ connected: false });
    }
  }, [fetchConn]);

  useEffect(() => {
    setGmb(readGmbConnection());
    fetchStatus().then(setCredStatus).catch(() => setCredStatus({ configured: false }));
    syncConn();
  }, [fetchStatus, syncConn]);

  async function connect() {
    if (!credStatus?.configured) {
      toast.error("Add your Google OAuth credentials first");
      setShowCredForm(true);
      return;
    }
    setBusy(true);
    try {
      const { url } = await getAuthUrl({ data: { origin: window.location.origin } });
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start OAuth");
      setBusy(false);
    }
  }

  async function disconnect() {
    try {
      await revoke({});
    } catch {
      /* ignore revoke errors */
    }
    writeGmbConnection({ connected: false });
    setGmb({ connected: false });
    setServerConn({ connected: false });
    setAccounts([]);
    toast.message("Disconnected");
  }

  async function loadAccountsList() {
    setLoadingAccounts(true);
    try {
      const rows = await fetchAccounts();
      setAccounts(rows);
      if (rows.length === 0) toast.message("No Business Profile accounts found on this Google account.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load accounts");
    } finally {
      setLoadingAccounts(false);
    }
  }

  async function pickLocation(account: string, loc: { name: string; title: string }) {
    setSavingLoc(true);
    try {
      await chooseLocation({ data: { account, location: loc.name, locationTitle: loc.title } });
      toast.success(`Selected ${loc.title}`);
      await syncConn();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save location");
    } finally {
      setSavingLoc(false);
    }
  }


  async function submitCreds(e: React.FormEvent) {
    e.preventDefault();
    setSavingCreds(true);
    try {
      await saveCreds({ data: { clientId, clientSecret } });
      const s = await fetchStatus();
      setCredStatus(s);
      setClientId("");
      setClientSecret("");
      setShowCredForm(false);
      toast.success("Credentials saved securely");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingCreds(false);
    }
  }

  async function removeStoredCreds() {
    if (!confirm("Remove saved OAuth credentials?")) return;
    await removeCreds({});
    setCredStatus({ configured: false });
    if (gmb.connected) disconnect();
    toast.message("Credentials removed");
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Integrations</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect external accounts to power live analytics and posting.
        </p>
      </div>

      {/* GMB card */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <MapPin className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-[220px]">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold">Google Business Profile</h3>
              {serverConn.connected ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-emerald-500">
                  <CheckCircle2 className="h-3 w-3" /> Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                  <XCircle className="h-3 w-3" /> Not connected
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Pulls views, calls, reviews, and rankings from your GMB account.
            </p>
            {serverConn.connected && (
              <div className="mt-3 space-y-0.5 text-xs text-muted-foreground">
                {serverConn.locationTitle ? (
                  <div>
                    <span className="text-foreground">{serverConn.locationTitle}</span>
                    <span className="ml-1 font-mono text-[10px] opacity-70">{serverConn.locationName}</span>
                  </div>
                ) : (
                  <div className="text-amber-500">No location selected — pick one below.</div>
                )}
                <div>Token expires {serverConn.expiresAt ? new Date(serverConn.expiresAt).toLocaleString() : ""}</div>
                {!serverConn.hasRefresh && (
                  <div className="text-amber-500">
                    No refresh token stored — reconnect to obtain one (Google issues it on first consent).
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {serverConn.connected ? (
              <>
                <button
                  onClick={connect}
                  disabled={busy}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
                >
                  Reconnect
                </button>
                <button
                  onClick={disconnect}
                  className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive hover:bg-destructive/20"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={connect}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <Plug className="h-4 w-4" />
                {busy ? "Redirecting…" : "Connect with Google"}
              </button>
            )}
          </div>
        </div>

        {/* Account / location picker */}
        {serverConn.connected && (
          <div className="mt-5 rounded-xl border border-border bg-background/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">Business location</div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Choose which Business Profile location powers analytics. Requires the
                  Business Profile APIs enabled in your Google Cloud project.
                </p>
              </div>
              <button
                onClick={loadAccountsList}
                disabled={loadingAccounts}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
              >
                {loadingAccounts ? <Loader2 className="h-3 w-3 animate-spin" /> : "Load accounts"}
              </button>
            </div>
            {accounts.length > 0 && (
              <div className="mt-3 space-y-3">
                {accounts.map((a) => (
                  <div key={a.account} className="rounded-lg border border-border p-3">
                    <div className="text-xs font-medium">{a.accountLabel}</div>
                    {a.error ? (
                      <div className="mt-1 text-xs text-destructive">{a.error}</div>
                    ) : a.locations.length === 0 ? (
                      <div className="mt-1 text-xs text-muted-foreground">No locations on this account.</div>
                    ) : (
                      <ul className="mt-2 space-y-1">
                        {a.locations.map((l) => {
                          const active = serverConn.locationName === l.name;
                          return (
                            <li key={l.name} className="flex items-center justify-between gap-2 text-sm">
                              <div className="min-w-0">
                                <div className="truncate">{l.title}</div>
                                <div className="truncate font-mono text-[10px] text-muted-foreground">{l.name}</div>
                              </div>
                              <button
                                onClick={() => pickLocation(a.account, l)}
                                disabled={savingLoc || active}
                                className={`rounded-md border px-2 py-1 text-xs ${
                                  active
                                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                                    : "border-border bg-card hover:bg-accent"
                                }`}
                              >
                                {active ? "Selected" : "Use this"}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* OAuth credentials block */}
        <div className="mt-5 rounded-xl border border-border bg-background/50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <KeyRound className="mt-0.5 h-4 w-4 text-primary" />
              <div>
                <div className="text-sm font-medium">Google OAuth credentials</div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Provide your own OAuth Client ID and Secret from Google Cloud (Business Profile API enabled).
                  Stored securely per user with row-level security.
                </p>
                {credStatus?.configured && (
                  <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-500">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Configured · Client ID {credStatus.clientIdMasked}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCredForm((v) => !v)}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs hover:bg-accent"
              >
                {credStatus?.configured ? "Update" : "Add credentials"}
              </button>
              {credStatus?.configured && (
                <button
                  onClick={removeStoredCreds}
                  className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/20"
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          {showCredForm && (
            <form onSubmit={submitCreds} className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">Client ID</span>
                <input
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="123456789-abc.apps.googleusercontent.com"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">Client secret</span>
                <div className="relative">
                  <input
                    type={showSecret ? "text" : "password"}
                    autoComplete="off"
                    spellCheck={false}
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    placeholder="GOCSPX-••••••••••••••••"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 text-sm font-mono"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent"
                    aria-label={showSecret ? "Hide" : "Show"}
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={savingCreds}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {savingCreds ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Save securely
                </button>
                <button
                  type="button"
                  onClick={() => setShowCredForm(false)}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
                >
                  Cancel
                </button>
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Get credentials <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Values are transmitted over HTTPS and stored server-side with RLS scoped to your user.
                Never shared with other accounts.
              </p>
            </form>
          )}
        </div>

        <div className="mt-4">
          <Link to="/gmb-analytics" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            Open GMB Analytics <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* GHL */}
      <ProviderCard
        provider="ghl"
        title="GoHighLevel (GHL)"
        description="Direct API access for contacts, opportunities, and posting. Paste your Private Integration Token."
        icon={<Webhook className="h-6 w-6" />}
        fields={[
          { key: "api_key", label: "Private Integration Token", secret: true, placeholder: "pit-••••••••••••••••" },
          { key: "location_id", label: "Location ID", secret: false, placeholder: "ABC123..." },
        ]}
        docsUrl="https://highlevel.stoplight.io/docs/integrations/"
      />

      {/* n8n */}
      <N8nIntegrationCard />








      {/* AI providers */}
      <div>
        <h3 className="text-lg font-semibold">AI providers</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your own LLM API keys to power AI features with the provider and model of your choice.
          Keys are encrypted at rest and scoped to your user.
        </p>
      </div>

      <ProviderCard
        provider="openai"
        title="ChatGPT (OpenAI)"
        description="Use your own OpenAI API key for GPT models."
        icon={<Sparkles className="h-6 w-6" />}
        fields={[
          { key: "api_key", label: "API key", secret: true, placeholder: "sk-••••••••••••••••" },
        ]}
        docsUrl="https://platform.openai.com/api-keys"
      />

      <ProviderCard
        provider="gemini"
        title="Gemini (Google AI)"
        description="Use your own Google AI Studio API key for Gemini models."
        icon={<Bot className="h-6 w-6" />}
        fields={[
          { key: "api_key", label: "API key", secret: true, placeholder: "••••••••••••••••" },
        ]}
        docsUrl="https://aistudio.google.com/app/apikey"
      />

      <ProviderCard
        provider="anthropic"
        title="Claude (Anthropic)"
        description="Use your own Anthropic API key for Claude models."
        icon={<Bot className="h-6 w-6" />}
        fields={[
          { key: "api_key", label: "API key", secret: true, placeholder: "sk-ant-••••••••••••••••" },
        ]}
        docsUrl="https://console.anthropic.com/settings/keys"
      />

      <ProviderCard
        provider="openrouter"
        title="OpenRouter"
        description="Use your own OpenRouter API key to access many models through one account."
        icon={<RouteIcon className="h-6 w-6" />}
        fields={[
          { key: "api_key", label: "API key", secret: true, placeholder: "sk-or-••••••••••••••••" },
        ]}
        docsUrl="https://openrouter.ai/keys"
      />

      {/* Rank sources */}
      <div>
        <h3 className="text-lg font-semibold">Rank sources</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure one or more rank-tracking providers. Keys are stored server-side with RLS.
        </p>
      </div>

      <ProviderCard
        provider="dataforseo"
        title="DataForSEO"
        description="SERP + rank tracking. Uses HTTP Basic auth (login + password)."
        icon={<BarChart3 className="h-6 w-6" />}
        fields={[
          { key: "login", label: "Login (email)", secret: false, placeholder: "you@example.com" },
          { key: "password", label: "API password", secret: true, placeholder: "••••••••" },
        ]}
        docsUrl="https://app.dataforseo.com/api-access"
      />

      <ProviderCard
        provider="serpapi"
        title="SerpApi"
        description="Google SERP scraping. Uses a single API key."
        icon={<Search className="h-6 w-6" />}
        fields={[
          { key: "api_key", label: "API key", secret: true, placeholder: "••••••••••••••••" },
        ]}
        docsUrl="https://serpapi.com/manage-api-key"
      />

      <ProviderCard
        provider="local_falcon"
        title="Local Falcon"
        description="Geo-grid local rank tracking. Uses an API key."
        icon={<Radar className="h-6 w-6" />}
        fields={[
          { key: "api_key", label: "API key", secret: true, placeholder: "••••••••••••••••" },
        ]}
        docsUrl="https://www.localfalcon.com/api"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* n8n integration card                                                       */
/* -------------------------------------------------------------------------- */

type N8nConfig = {
  webhookUrl: string;
  authHeader: string;
  authToken: string;
  enabled: boolean;
};

const N8N_ENABLED_KEY = "n8n_integration_enabled_v1";

function N8nIntegrationCard() {
  const fetchAll = useServerFn(listIntegrations);
  const saveN8n = useServerFn(saveIntegration);
  const removeN8n = useServerFn(deleteIntegration);

  const [cfg, setCfg] = useState<N8nConfig>({
    webhookUrl: "",
    authHeader: "",
    authToken: "",
    enabled: false,
  });
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Whether the webhook is "enabled" is purely a UI toggle (server-side
  // sending doesn't gate on it), so it stays as a small local preference
  // rather than needing its own encrypted column.
  async function refresh() {
    try {
      const all = await fetchAll();
      const mine = all.find((r) => r.provider === "n8n");
      setSaved(!!mine);
      const enabled = localStorage.getItem(N8N_ENABLED_KEY) !== "false";
      setCfg((c) => ({ ...c, enabled: !!mine && enabled }));
    } catch {
      setSaved(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function testHook() {
    if (!cfg.webhookUrl) {
      toast.error("Add a webhook URL first.");
      return;
    }
    setTesting(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (cfg.authHeader && cfg.authToken) headers[cfg.authHeader] = cfg.authToken;
      const res = await fetch(cfg.webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          event: "test.ping",
          source: "gmb-rank-pilot",
          sentAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error(`Webhook returned ${res.status}`);
      toast.success("Test payload delivered to n8n.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reach n8n");
    } finally {
      setTesting(false);
    }
  }

  async function saveConfig() {
    if (!cfg.webhookUrl.trim()) {
      toast.error("Add a webhook URL first.");
      return;
    }
    setSaving(true);
    try {
      await saveN8n({
        data: {
          provider: "n8n",
          config: {
            webhook_url: cfg.webhookUrl.trim(),
            auth_header: cfg.authHeader.trim(),
            auth_token: cfg.authToken.trim(),
          },
        },
      });
      localStorage.setItem(N8N_ENABLED_KEY, "true");
      setCfg((c) => ({ ...c, enabled: true }));
      setOpen(false);
      await refresh();
      toast.success("n8n webhook saved — posts will now be sent through it.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function toggleEnabled() {
    const next = !cfg.enabled;
    localStorage.setItem(N8N_ENABLED_KEY, String(next));
    setCfg((c) => ({ ...c, enabled: next }));
  }

  async function disconnect() {
    if (!confirm("Remove n8n webhook configuration?")) return;
    try {
      await removeN8n({ data: { provider: "n8n" } });
      setCfg({ webhookUrl: "", authHeader: "", authToken: "", enabled: false });
      setSaved(false);
      toast.message("n8n disconnected");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    }
  }

  const connected = saved;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Webhook className="h-6 w-6" />
        </div>
        <div className="min-w-[220px] flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">n8n Workflows</h3>
            {connected && cfg.enabled ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-emerald-500">
                <CheckCircle2 className="h-3 w-3" /> Active
              </span>
            ) : connected ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-amber-500">
                Paused
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                <XCircle className="h-3 w-3" /> Not connected
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Forward app events — new posts, competitor alerts, rank changes, geotag runs — to an
            n8n workflow via webhook. Paste the URL from your n8n{" "}
            <span className="font-mono text-xs">Webhook</span> trigger node.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {connected && (
            <>
              <button
                onClick={testHook}
                disabled={testing}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
              >
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send test"}
              </button>
              <button
                onClick={toggleEnabled}
                className={`rounded-lg px-3 py-2 text-sm ${
                  cfg.enabled
                    ? "border border-border bg-card hover:bg-accent"
                    : "bg-primary text-primary-foreground hover:opacity-90"
                }`}
              >
                {cfg.enabled ? "Pause" : "Enable"}
              </button>
            </>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
          >
            {connected ? "Update" : "Add API"}
          </button>
          {connected && (
            <button
              onClick={disconnect}
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive hover:bg-destructive/20"
            >
              Disconnect
            </button>
          )}
        </div>
      </div>

      {open && (
        <>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <label className="block md:col-span-2">
          <span className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
            Webhook URL
          </span>
          <input
            type="url"
            spellCheck={false}
            autoComplete="off"
            placeholder="https://your-n8n.example.com/webhook/abc123"
            value={cfg.webhookUrl}
            onChange={(e) => setCfg({ ...cfg, webhookUrl: e.target.value })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
            Auth header name (optional)
          </span>
          <input
            type="text"
            spellCheck={false}
            placeholder="X-N8N-Signature"
            value={cfg.authHeader}
            onChange={(e) => setCfg({ ...cfg, authHeader: e.target.value })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
            Auth token (optional)
          </span>
          <div className="relative">
            <input
              type={showToken ? "text" : "password"}
              spellCheck={false}
              autoComplete="off"
              placeholder="••••••••••••"
              value={cfg.authToken}
              onChange={(e) => setCfg({ ...cfg, authToken: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent"
              aria-label={showToken ? "Hide" : "Show"}
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={saveConfig}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Save n8n configuration
        </button>
        <Link
          to="/settings/webhooks"
          className="text-xs text-primary hover:underline"
        >
          Manage all webhooks →
        </Link>
        <a
          href="https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/"
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          n8n Webhook docs <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Encrypted at rest and used server-side when sending posts — this is the same webhook the
        Post Scheduler and GHL publishing use, not just a local preference.
      </p>
        </>
      )}
    </div>
  );
}


type FieldDef = { key: string; label: string; secret: boolean; placeholder?: string };

type ProviderCardProps = {
  provider: ProviderId;
  title: string;
  description: string;
  icon: React.ReactNode;
  fields: FieldDef[];
  docsUrl?: string;
  onTest?: () => Promise<void>;
  testLabel?: string;
};

function ProviderCard({ provider, title, description, icon, fields, docsUrl, onTest, testLabel }: ProviderCardProps) {
  const fetchAll = useServerFn(listIntegrations);
  const save = useServerFn(saveIntegration);
  const remove = useServerFn(deleteIntegration);
  const rules = PROVIDER_RULES[provider];

  const [configured, setConfigured] = useState<null | { masked: Record<string, string>; updatedAt: string }>(null);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  async function refresh() {
    try {
      const all = await fetchAll();
      const mine = all.find((r) => r.provider === provider);
      setConfigured(mine ? { masked: mine.masked, updatedAt: mine.updatedAt } : null);
    } catch {
      setConfigured(null);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setField(key: string, val: string) {
    setValues((v) => ({ ...v, [key]: val }));
    if (touched[key]) {
      const rule = rules[key];
      setErrors((e) => ({ ...e, [key]: rule ? (validateField(rule, val) ?? "") : "" }));
    }
  }

  function markTouched(key: string) {
    setTouched((t) => ({ ...t, [key]: true }));
    const rule = rules[key];
    if (rule) {
      setErrors((e) => ({ ...e, [key]: validateField(rule, values[key] ?? "") ?? "" }));
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    // Validate every field before submitting.
    const nextErrors: Record<string, string> = {};
    const nextTouched: Record<string, boolean> = {};
    for (const f of fields) {
      const rule = rules[f.key];
      if (!rule) continue;
      nextTouched[f.key] = true;
      const err = validateField(rule, values[f.key] ?? "");
      if (err) nextErrors[f.key] = err;
    }
    setTouched((t) => ({ ...t, ...nextTouched }));
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setBusy(true);
    try {
      await save({ data: { provider, config: values } });
      setValues({});
      setErrors({});
      setTouched({});
      setOpen(false);
      await refresh();
      toast.success(`${title} saved`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    if (!confirm(`Remove ${title} credentials?`)) return;
    try {
      await remove({ data: { provider } });
      await refresh();
      toast.message("Removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
          {icon}
        </div>
        <div className="flex-1 min-w-[220px]">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">{title}</h3>
            {configured ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-emerald-500">
                <CheckCircle2 className="h-3 w-3" /> Configured
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                <XCircle className="h-3 w-3" /> Not configured
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          {configured && (
            <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              {Object.entries(configured.masked).map(([k, v]) => (
                <div key={k}><span className="text-foreground">{k}:</span> <span className="font-mono">{v}</span></div>
              ))}
              <div>Updated {new Date(configured.updatedAt).toLocaleString()}</div>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {configured && onTest && (
            <button
              onClick={async () => {
                setTesting(true);
                try {
                  await onTest();
                } finally {
                  setTesting(false);
                }
              }}
              disabled={testing}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : (testLabel ?? "Send test")}
            </button>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
          >
            {configured ? "Update" : "Add API"}
          </button>
          {configured && (
            <button
              onClick={onRemove}
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive hover:bg-destructive/20"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {open && (
        <form onSubmit={onSave} noValidate className="mt-4 space-y-3">
          {fields.map((f) => {
            const err = touched[f.key] ? errors[f.key] : "";
            const inputId = `${provider}-${f.key}`;
            return (
              <label key={f.key} htmlFor={inputId} className="block">
                <span className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">{f.label}</span>
                <div className="relative">
                  <input
                    id={inputId}
                    type={f.secret && !reveal[f.key] ? "password" : "text"}
                    autoComplete="off"
                    spellCheck={false}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setField(f.key, e.target.value)}
                    onBlur={() => markTouched(f.key)}
                    placeholder={f.placeholder}
                    aria-invalid={err ? true : undefined}
                    aria-describedby={err ? `${inputId}-error` : undefined}
                    className={`w-full rounded-lg border bg-background px-3 py-2 pr-10 text-sm font-mono ${
                      err ? "border-destructive focus:outline-destructive" : "border-border"
                    }`}
                  />
                  {f.secret && (
                    <button
                      type="button"
                      onClick={() => setReveal((r) => ({ ...r, [f.key]: !r[f.key] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent"
                      aria-label={reveal[f.key] ? "Hide" : "Show"}
                    >
                      {reveal[f.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  )}
                </div>
                {err && (
                  <p id={`${inputId}-error`} className="mt-1 text-xs text-destructive">
                    {err}
                  </p>
                )}
              </label>
            );
          })}
          {formError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {formError}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Save securely
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setErrors({});
                setTouched({});
                setFormError(null);
              }}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
            >
              Cancel
            </button>
            {docsUrl && (
              <a
                href={docsUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Get key <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Values are encrypted at rest and scoped to your user with row-level security.
          </p>
        </form>
      )}
    </div>
  );
}





