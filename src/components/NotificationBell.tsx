import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Check, CheckCheck } from "lucide-react";
import {
  listRankAlerts,
  markAllRankAlertsRead,
  markRankAlertRead,
  type RankAlert,
} from "@/lib/notifications.functions";

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<RankAlert[]>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const fetchAlerts = useServerFn(listRankAlerts);
  const markRead = useServerFn(markRankAlertRead);
  const markAll = useServerFn(markAllRankAlertsRead);

  const unread = alerts.filter((a) => !a.readAt).length;

  async function refresh() {
    try {
      const rows = await fetchAlerts({ data: { limit: 30 } });
      setAlerts(rows);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function handleMarkOne(id: string) {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, readAt: new Date().toISOString() } : a)));
    try {
      await markRead({ data: { id } });
    } catch {
      refresh();
    }
  }

  async function handleMarkAll() {
    const now = new Date().toISOString();
    setAlerts((prev) => prev.map((a) => (a.readAt ? a : { ...a, readAt: now })));
    try {
      await markAll();
    } catch {
      refresh();
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold">Alerts</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No alerts yet. You'll be notified when a competitor overtakes
                you for a tracked keyword.
              </div>
            ) : (
              alerts.map((a) => {
                const isUnread = !a.readAt;
                return (
                  <div
                    key={a.id}
                    className={`flex items-start gap-3 border-b border-border px-3 py-3 last:border-b-0 ${
                      isUnread ? "bg-accent/40" : ""
                    }`}
                  >
                    <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-destructive" style={{ opacity: isUnread ? 1 : 0 }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm">
                        <span className="font-medium">{a.competitorName}</span>{" "}
                        overtook you for{" "}
                        <span className="font-medium">"{a.keyword}"</span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Now #{a.competitorRank} · you at #{a.userRank} ·{" "}
                        {timeAgo(a.createdAt)}
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <Link
                          to="/gmb-analytics"
                          onClick={() => setOpen(false)}
                          className="text-xs text-primary hover:underline"
                        >
                          View rankings
                        </Link>
                        {isUnread && (
                          <button
                            type="button"
                            onClick={() => handleMarkOne(a.id)}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <Check className="h-3 w-3" /> Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
