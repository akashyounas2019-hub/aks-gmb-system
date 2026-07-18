import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Heart, ExternalLink, RefreshCw, Settings as SettingsIcon } from "lucide-react";
import { getHeartbeatBaseUrl, resolveHeartbeatUrl } from "@/lib/heartbeat";
import { supabase } from "@/integrations/supabase/client";

type Status =
  | { kind: "not-configured" }
  | { kind: "checking" }
  | { kind: "online"; latencyMs: number; imported: number | null; lastImportAt: string | null }
  | { kind: "offline"; reason: string };

// Ping HeartBeat's public gallery and count how many images have already
// been imported into the shared library from this source. Doubles as a
// dashboard-wide status widget for the integration.
export function HeartbeatStatusCard() {
  const [status, setStatus] = useState<Status>({ kind: "checking" });
  const [baseUrl, setBaseUrl] = useState("");

  async function refresh() {
    const url = getHeartbeatBaseUrl();
    setBaseUrl(url);
    if (!url) return setStatus({ kind: "not-configured" });

    setStatus({ kind: "checking" });

    // Reachability probe — image request, no CORS preflight issues.
    const reachable = await new Promise<boolean>((resolve) => {
      const started = performance.now();
      const img = new Image();
      const done = (ok: boolean) => {
        (img as unknown as { _t?: number })._t = performance.now() - started;
        resolve(ok);
      };
      img.onload = () => done(true);
      img.onerror = () => done(false);
      img.src = resolveHeartbeatUrl(url, "/offers/house-01.png") + `?_=${Date.now()}`;
    });

    if (!reachable) {
      return setStatus({ kind: "offline", reason: "Gallery URL is not responding." });
    }

    // Count imports we have from HeartBeat in the shared library.
    let imported: number | null = null;
    let lastImportAt: string | null = null;
    try {
      const t0 = performance.now();
      const { count } = await supabase
        .from("images")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id", { count: "exact", head: true } as any)
        .eq("source", "heartbeat")
        .is("deleted_at", null);
      const latencyMs = Math.round(performance.now() - t0);
      imported = typeof count === "number" ? count : 0;

      if (imported > 0) {
        const { data: latest } = await supabase
          .from("images")
          .select("created_at")
          .eq("source", "heartbeat")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1);
        lastImportAt = latest?.[0]?.created_at ?? null;
      }

      setStatus({ kind: "online", latencyMs, imported, lastImportAt });
    } catch (e) {
      setStatus({
        kind: "offline",
        reason: e instanceof Error ? e.message : "Backend read failed.",
      });
    }
  }

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    if (typeof window !== "undefined") {
      window.addEventListener("heartbeat-base-url-changed", onChange);
      return () => window.removeEventListener("heartbeat-base-url-changed", onChange);
    }
  }, []);

  const { dotClass, label } = presentation(status);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/15 text-rose-500">
            <Heart className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold">HeartBeat Helper</div>
              <span className={"inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider " + dotClass}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {label}
              </span>
            </div>
            <StatusLine status={status} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={refresh}
            className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Re-check"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          {baseUrl && (
            <a
              href={baseUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Open HeartBeat"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {status.kind === "not-configured" ? (
            <Link
              to="/settings/integrations"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <SettingsIcon className="h-3.5 w-3.5" /> Configure
            </Link>
          ) : (
            <Link
              to="/social/facebook/heartbeat"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
            >
              Open gallery
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function presentation(s: Status): { dotClass: string; label: string } {
  switch (s.kind) {
    case "online":
      return { dotClass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600", label: "Online" };
    case "checking":
      return { dotClass: "border-amber-500/40 bg-amber-500/10 text-amber-600", label: "Checking" };
    case "offline":
      return { dotClass: "border-rose-500/40 bg-rose-500/10 text-rose-600", label: "Offline" };
    case "not-configured":
      return { dotClass: "border-border bg-muted/40 text-muted-foreground", label: "Not set" };
  }
}

function StatusLine({ status }: { status: Status }) {
  if (status.kind === "not-configured") {
    return (
      <p className="mt-0.5 text-xs text-muted-foreground">
        Paste the published HeartBeat URL in Settings → Integrations to connect.
      </p>
    );
  }
  if (status.kind === "checking") {
    return <p className="mt-0.5 text-xs text-muted-foreground">Pinging gallery…</p>;
  }
  if (status.kind === "offline") {
    return <p className="mt-0.5 text-xs text-rose-500">{status.reason}</p>;
  }
  const when = status.lastImportAt ? relative(status.lastImportAt) : "never";
  return (
    <p className="mt-0.5 text-xs text-muted-foreground">
      <span className="text-foreground">{status.imported ?? 0}</span> imported ·
      last <span className="text-foreground">{when}</span> ·
      <span className="ml-1">gallery {status.latencyMs}ms</span>
    </p>
  );
}

function relative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "recently";
  const diff = Date.now() - then;
  const m = Math.round(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
