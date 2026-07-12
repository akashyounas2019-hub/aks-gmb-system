import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, ExternalLink, MapPin, Plug, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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

function IntegrationsPage() {
  const [gmb, setGmb] = useState<GmbConn>({ connected: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setGmb(readGmbConnection());
  }, []);

  async function connect() {
    setBusy(true);
    try {
      // Placeholder: real Google Business Profile OAuth requires the user's
      // Google Cloud OAuth credentials. For now this simulates a successful
      // connection so the analytics screen can toggle to live-mode UI.
      await new Promise((r) => setTimeout(r, 700));
      const next: GmbConn = {
        connected: true,
        accountName: "Pearl Home Cleaning",
        locationName: "Downtown Dubai",
        connectedAt: new Date().toISOString(),
      };
      writeGmbConnection(next);
      setGmb(next);
      toast.success("Google Business Profile connected");
    } finally {
      setBusy(false);
    }
  }

  function disconnect() {
    writeGmbConnection({ connected: false });
    setGmb({ connected: false });
    toast.message("Disconnected");
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
              {gmb.connected ? (
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
            {gmb.connected && (
              <div className="mt-3 text-xs text-muted-foreground">
                <div><span className="text-foreground">{gmb.accountName}</span> · {gmb.locationName}</div>
                <div>Connected {gmb.connectedAt ? new Date(gmb.connectedAt).toLocaleString() : ""}</div>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {gmb.connected ? (
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
                {busy ? "Connecting…" : "Connect"}
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-600 dark:text-amber-400">
          Live GMB data requires a Google Cloud OAuth client with the Business
          Profile API enabled. Share your OAuth client ID and secret to enable
          live insights; without them, connecting activates the live-mode UI
          against sample data.
        </div>

        <div className="mt-3">
          <Link to="/gmb-analytics" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            Open GMB Analytics <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
