import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  Calendar as CalendarIcon,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Send,
} from "lucide-react";
import { toast } from "sonner";

import {
  listSocialPosts,
  retrySocialPost,
} from "@/lib/post-generator.functions";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: CalendarPage,
});

type Post = {
  id: string;
  caption: string;
  status: string;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
  error: string | null;
  image_ids: string[];
  location_label: string | null;
  ghl_location_id: string | null;
};

function CalendarPage() {
  const list = useServerFn(listSocialPosts);
  const retry = useServerFn(retrySocialPost);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "queued" | "sent" | "failed">("all");

  async function reload() {
    setLoading(true);
    try {
      const res = await list();
      setPosts(res.posts as Post[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRetry(id: string) {
    setRetrying(id);
    try {
      await retry({ data: { postId: id } });
      toast.success("Resent successfully");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setRetrying(null);
    }
  }

  const filtered = useMemo(() => {
    if (filter === "all") return posts;
    return posts.filter((p) => p.status === filter);
  }, [posts, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const p of filtered) {
      const when = p.scheduled_at ?? p.created_at;
      const day = new Date(when).toLocaleDateString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      const arr = map.get(day) ?? [];
      arr.push(p);
      map.set(day, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const counts = useMemo(() => {
    const c = { queued: 0, sent: 0, failed: 0, sending: 0 };
    for (const p of posts) {
      if (p.status in c) (c as Record<string, number>)[p.status]++;
    }
    return c;
  }, [posts]);

  return (
    <div className="w-full py-6 pl-6 md:py-10 md:pl-10" style={{ paddingRight: 50 }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">Content Calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every GMB / social post you have queued, sent, or failed.
          </p>
        </div>
        <Link
          to="/post-generator"
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90"
        >
          <Send className="h-4 w-4" /> New post
        </Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <StatCard label="Queued" value={counts.queued} icon={<Clock className="h-4 w-4" />} />
        <StatCard label="Sent" value={counts.sent} tone="good" icon={<CheckCircle2 className="h-4 w-4" />} />
        <StatCard label="Failed" value={counts.failed} tone="bad" icon={<AlertCircle className="h-4 w-4" />} />
        <StatCard label="Total" value={posts.length} icon={<CalendarIcon className="h-4 w-4" />} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {(["all", "queued", "sent", "failed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs capitalize transition ${
              filter === f
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:border-primary/40"
            }`}
          >
            {f}
          </button>
        ))}
        <button
          onClick={reload}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      <div className="mt-6 space-y-6">
        {loading ? (
          <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
            Loading…
          </div>
        ) : grouped.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No posts yet. Head to Post Generator to create your first one.
          </div>
        ) : (
          grouped.map(([day, items]) => (
            <div key={day}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {day}
              </div>
              <div className="space-y-2">
                {items.map((p) => (
                  <PostRow
                    key={p.id}
                    post={p}
                    onRetry={() => handleRetry(p.id)}
                    retrying={retrying === p.id}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PostRow({
  post,
  onRetry,
  retrying,
}: {
  post: Post;
  onRetry: () => void;
  retrying: boolean;
}) {
  const canRetry = post.status === "failed" || post.status === "queued";
  const when = post.scheduled_at ?? post.created_at;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <StatusBadge status={post.status} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{new Date(when).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            {post.location_label && <span>· {post.location_label}</span>}
            {post.image_ids?.length ? <span>· {post.image_ids.length} image(s)</span> : null}
          </div>
          <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-sm">{post.caption}</p>
          {post.error && (
            <div className="mt-2 flex items-start gap-1.5 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="break-words">{post.error}</span>
            </div>
          )}
        </div>
        {canRetry && (
          <button
            onClick={onRetry}
            disabled={retrying}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:border-primary/50 disabled:opacity-40"
          >
            {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            {post.status === "failed" ? "Retry" : "Re-queue"}
          </button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { c: string; label: string }> = {
    sent: { c: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30", label: "Sent" },
    queued: { c: "bg-amber-500/15 text-amber-500 border-amber-500/30", label: "Queued" },
    sending: { c: "bg-blue-500/15 text-blue-500 border-blue-500/30", label: "Sending" },
    failed: { c: "bg-red-500/15 text-red-500 border-red-500/30", label: "Failed" },
  };
  const v = map[status] ?? { c: "bg-muted text-muted-foreground border-border", label: status };
  return (
    <span className={`inline-block shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${v.c}`}>
      {v.label}
    </span>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={`mt-2 text-2xl font-semibold ${
          tone === "good" ? "text-emerald-500" : tone === "bad" ? "text-red-500" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
