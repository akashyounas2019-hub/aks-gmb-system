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
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  LayoutGrid,
  List as ListIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  listSocialPosts,
  retrySocialPost,
} from "@/lib/post-generator.functions";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: () => <CalendarPage title="GMB Calendar" platform="gmb" />,
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

type Bucket = "published" | "scheduled" | "draft" | "failed" | "sending";

const BUCKET_META: Record<
  Bucket,
  { label: string; dot: string; chip: string; ring: string; text: string }
> = {
  published: {
    label: "Published",
    dot: "bg-emerald-500",
    chip: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    ring: "ring-emerald-500/40",
    text: "text-emerald-500",
  },
  scheduled: {
    label: "Scheduled",
    dot: "bg-amber-500",
    chip: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    ring: "ring-amber-500/40",
    text: "text-amber-500",
  },
  draft: {
    label: "Not scheduled",
    dot: "bg-muted-foreground/70",
    chip: "bg-muted text-muted-foreground border-border",
    ring: "ring-muted-foreground/30",
    text: "text-muted-foreground",
  },
  failed: {
    label: "Failed",
    dot: "bg-red-500",
    chip: "bg-red-500/15 text-red-500 border-red-500/30",
    ring: "ring-red-500/40",
    text: "text-red-500",
  },
  sending: {
    label: "Sending",
    dot: "bg-blue-500",
    chip: "bg-blue-500/15 text-blue-500 border-blue-500/30",
    ring: "ring-blue-500/40",
    text: "text-blue-500",
  },
};

function bucketOf(p: Post): Bucket {
  if (p.status === "sent") return "published";
  if (p.status === "failed") return "failed";
  if (p.status === "sending") return "sending";
  if (p.status === "queued" && p.scheduled_at) return "scheduled";
  return "draft";
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function CalendarPage({
  title,
  platform,
  onDayClick,
}: {
  title?: string;
  platform?: "gmb" | "facebook" | "instagram" | "linkedin";
  onDayClick?: (dateISO: string) => void;
} = {}) {
  const list = useServerFn(listSocialPosts);
  const retry = useServerFn(retrySocialPost);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [view, setView] = useState<"month" | "list">("month");
  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string>(() => dateKey(new Date()));
  const [statusFilters, setStatusFilters] = useState<Set<Bucket>>(
    () => new Set(["published", "scheduled", "draft", "failed", "sending"] as Bucket[]),
  );

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

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = {
      published: 0,
      scheduled: 0,
      draft: 0,
      failed: 0,
      sending: 0,
    };
    for (const p of posts) c[bucketOf(p)]++;
    return c;
  }, [posts]);

  // Bucket posts into date keys for the month grid
  const byDay = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const p of posts) {
      const b = bucketOf(p);
      if (!statusFilters.has(b)) continue;
      const when = p.scheduled_at ?? p.created_at;
      const key = dateKey(new Date(when));
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    // sort each day's posts by time
    for (const arr of map.values()) {
      arr.sort(
        (a, b) =>
          new Date(a.scheduled_at ?? a.created_at).getTime() -
          new Date(b.scheduled_at ?? b.created_at).getTime(),
      );
    }
    return map;
  }, [posts, statusFilters]);

  const monthDays = useMemo(() => buildMonthGrid(cursor), [cursor]);
  const monthLabel = cursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const selectedPosts = byDay.get(selectedDay) ?? [];

  function toggleStatus(b: Bucket) {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      // never leave empty — reset to all
      if (next.size === 0) return new Set(["published", "scheduled", "draft", "failed", "sending"] as Bucket[]);
      return next;
    });
  }

  return (
    <div className="w-full py-6 pl-6 md:py-10 md:pl-10" style={{ paddingRight: 50 }}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">{title ?? "Content Calendar"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track every prompt from draft to publish at a glance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-border">
            <button
              onClick={() => setView("month")}
              aria-pressed={view === "month"}
              className={`inline-flex items-center gap-1 px-3 py-2 text-xs ${
                view === "month" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Month
            </button>
            <button
              onClick={() => setView("list")}
              aria-pressed={view === "list"}
              className={`inline-flex items-center gap-1 px-3 py-2 text-xs ${
                view === "list" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              }`}
            >
              <ListIcon className="h-3.5 w-3.5" /> List
            </button>
          </div>
          <Link
            to="/post-generator"
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90"
          >
            <Send className="h-4 w-4" /> New post
          </Link>
        </div>
      </div>

      {/* Summary stats */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Published"
          value={counts.published}
          tone="good"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          label="Scheduled"
          value={counts.scheduled}
          tone="warn"
          icon={<Clock className="h-4 w-4" />}
        />
        <StatCard
          label="Not scheduled"
          value={counts.draft}
          icon={<CircleDashed className="h-4 w-4" />}
        />
        <StatCard
          label="Failed"
          value={counts.failed}
          tone="bad"
          icon={<AlertCircle className="h-4 w-4" />}
        />
        <StatCard
          label="Total"
          value={posts.length}
          icon={<CalendarIcon className="h-4 w-4" />}
        />
      </div>

      {/* Filter legend */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {(["published", "scheduled", "draft", "failed", "sending"] as Bucket[]).map((b) => {
          const active = statusFilters.has(b);
          const meta = BUCKET_META[b];
          return (
            <button
              key={b}
              onClick={() => toggleStatus(b)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
                active
                  ? "border-primary/40 bg-primary/5"
                  : "border-border text-muted-foreground opacity-60"
              }`}
              aria-pressed={active}
            >
              <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
              {meta.label}
              <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] font-semibold">
                {counts[b]}
              </span>
            </button>
          );
        })}
        <button
          onClick={reload}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      {view === "month" ? (
        <MonthView
          cursor={cursor}
          setCursor={setCursor}
          monthLabel={monthLabel}
          monthDays={monthDays}
          byDay={byDay}
          selectedDay={selectedDay}
          setSelectedDay={setSelectedDay}
          onDayClick={onDayClick}
          selectedPosts={selectedPosts}
          onRetry={handleRetry}
          retrying={retrying}
          loading={loading}
        />
      ) : (
        <ListView
          posts={posts.filter((p) => statusFilters.has(bucketOf(p)))}
          loading={loading}
          onRetry={handleRetry}
          retrying={retrying}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Month grid                                                                 */
/* -------------------------------------------------------------------------- */

function buildMonthGrid(cursor: Date): Date[] {
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const first = new Date(y, m, 1);
  const startWeekday = first.getDay(); // 0 = Sun
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: Date[] = [];
  // leading padding
  for (let i = startWeekday; i > 0; i--) {
    cells.push(new Date(y, m, 1 - i));
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(y, m, d));
  }
  // pad to full weeks (multiple of 7)
  while (cells.length % 7 !== 0) {
    cells.push(new Date(y, m, daysInMonth + (cells.length - startWeekday - daysInMonth) + 1));
  }
  // ensure at least 6 rows for visual consistency
  while (cells.length < 42) {
    const last = cells[cells.length - 1];
    cells.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
  }
  return cells;
}

function MonthView({
  cursor,
  setCursor,
  monthLabel,
  monthDays,
  byDay,
  selectedDay,
  setSelectedDay,
  selectedPosts,
  onRetry,
  retrying,
  loading,
  onDayClick,
}: {
  cursor: Date;
  setCursor: (d: Date) => void;
  monthLabel: string;
  monthDays: Date[];
  byDay: Map<string, Post[]>;
  selectedDay: string;
  setSelectedDay: (k: string) => void;
  selectedPosts: Post[];
  onRetry: (id: string) => void;
  retrying: string | null;
  loading: boolean;
  onDayClick?: (dateISO: string) => void;
}) {
  const currentMonth = cursor.getMonth();
  const todayKey = dateKey(new Date());

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="rounded-2xl border border-border bg-card">
        {/* Month nav */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              className="rounded-md border border-border p-1.5 hover:bg-accent"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              className="rounded-md border border-border p-1.5 hover:bg-accent"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                const t = new Date();
                setCursor(new Date(t.getFullYear(), t.getMonth(), 1));
                setSelectedDay(dateKey(t));
              }}
              className="ml-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent"
            >
              Today
            </button>
          </div>
          <div className="font-display text-lg">{monthLabel}</div>
          <div className="text-xs text-muted-foreground">
            {loading ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading
              </span>
            ) : (
              " "
            )}
          </div>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 border-b border-border text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7">
          {monthDays.map((d, i) => {
            const key = dateKey(d);
            const inMonth = d.getMonth() === currentMonth;
            const isToday = key === todayKey;
            const isSelected = key === selectedDay;
            const posts = byDay.get(key) ?? [];

            // aggregate bucket counts for the day
            const dayCounts: Partial<Record<Bucket, number>> = {};
            for (const p of posts) {
              const b = bucketOf(p);
              dayCounts[b] = (dayCounts[b] ?? 0) + 1;
            }
            const bucketOrder: Bucket[] = ["published", "scheduled", "sending", "draft", "failed"];

            return (
              <button
                key={i}
                onClick={() => {
                  setSelectedDay(key);
                  if (onDayClick) onDayClick(key);
                }}
                className={`group relative flex min-h-[104px] flex-col border-b border-r border-border p-2 text-left transition ${
                  inMonth ? "bg-card hover:bg-accent/30" : "bg-muted/20 text-muted-foreground/60"
                } ${isSelected ? "ring-2 ring-inset ring-primary" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                      isToday
                        ? "bg-primary text-primary-foreground"
                        : inMonth
                          ? ""
                          : "text-muted-foreground/60"
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  {posts.length > 0 && (
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {posts.length}
                    </span>
                  )}
                </div>

                {/* status ribbons (up to 3) */}
                <div className="mt-1 space-y-1">
                  {posts.slice(0, 3).map((p) => {
                    const meta = BUCKET_META[bucketOf(p)];
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center gap-1 rounded-sm border px-1 py-0.5 text-[10px] ${meta.chip}`}
                        title={p.caption}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
                        <span className="truncate">
                          {new Date(p.scheduled_at ?? p.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          · {p.caption.slice(0, 24) || "Untitled"}
                        </span>
                      </div>
                    );
                  })}
                  {posts.length > 3 && (
                    <div className="text-[10px] text-muted-foreground">
                      +{posts.length - 3} more
                    </div>
                  )}
                </div>

                {/* dot summary (bottom) — shows even when ribbons hidden on tight cells */}
                {posts.length > 0 && (
                  <div className="mt-auto flex flex-wrap gap-1 pt-1">
                    {bucketOrder.map((b) =>
                      dayCounts[b] ? (
                        <span
                          key={b}
                          className={`inline-flex items-center gap-0.5 rounded-full px-1 py-0.5 text-[9px] font-medium ${BUCKET_META[b].chip}`}
                        >
                          <span className={`h-1 w-1 rounded-full ${BUCKET_META[b].dot}`} />
                          {dayCounts[b]}
                        </span>
                      ) : null,
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Day detail */}
      <aside className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              Day detail
            </div>
            <div className="font-display text-lg">
              {new Date(selectedDay).toLocaleDateString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </div>
          </div>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
            {selectedPosts.length}
          </span>
        </div>

        {selectedPosts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            No prompts on this day.
          </div>
        ) : (
          <div className="space-y-2">
            {selectedPosts.map((p) => (
              <PostRow
                key={p.id}
                post={p}
                onRetry={() => onRetry(p.id)}
                retrying={retrying === p.id}
                compact
              />
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* List view (legacy)                                                         */
/* -------------------------------------------------------------------------- */

function ListView({
  posts,
  loading,
  onRetry,
  retrying,
}: {
  posts: Post[];
  loading: boolean;
  onRetry: (id: string) => void;
  retrying: string | null;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const p of posts) {
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
  }, [posts]);

  if (loading) {
    return (
      <div className="mt-6 rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
        Loading…
      </div>
    );
  }
  if (grouped.length === 0) {
    return (
      <div className="mt-6 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        No posts yet. Head to Post Generator to create your first one.
      </div>
    );
  }
  return (
    <div className="mt-6 space-y-6">
      {grouped.map(([day, items]) => (
        <div key={day}>
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {day}
          </div>
          <div className="space-y-2">
            {items.map((p) => (
              <PostRow
                key={p.id}
                post={p}
                onRetry={() => onRetry(p.id)}
                retrying={retrying === p.id}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Post row                                                                   */
/* -------------------------------------------------------------------------- */

function PostRow({
  post,
  onRetry,
  retrying,
  compact,
}: {
  post: Post;
  onRetry: () => void;
  retrying: boolean;
  compact?: boolean;
}) {
  const canRetry = post.status === "failed" || post.status === "queued";
  const when = post.scheduled_at ?? post.created_at;
  const bucket = bucketOf(post);
  const meta = BUCKET_META[bucket];
  return (
    <div
      className={`rounded-xl border border-border bg-background p-3 ${compact ? "" : "md:p-4"}`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${meta.chip}`}>
              {meta.label}
            </span>
            <span>
              {new Date(when).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {post.location_label && <span>· {post.location_label}</span>}
            {post.image_ids?.length ? <span>· {post.image_ids.length} image(s)</span> : null}
          </div>
          <p className={`mt-1.5 whitespace-pre-wrap text-sm ${compact ? "line-clamp-2" : "line-clamp-3"}`}>
            {post.caption}
          </p>
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

/* -------------------------------------------------------------------------- */
/* Stat card                                                                  */
/* -------------------------------------------------------------------------- */

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tone?: "good" | "bad" | "warn";
}) {
  const toneCls =
    tone === "good"
      ? "text-emerald-500"
      : tone === "bad"
        ? "text-red-500"
        : tone === "warn"
          ? "text-amber-500"
          : "";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${toneCls}`}>{value}</div>
    </div>
  );
}
