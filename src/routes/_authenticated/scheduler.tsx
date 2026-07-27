import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Save,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { CalendarPage } from "@/routes/_authenticated/calendar";

export const Route = createFileRoute("/_authenticated/scheduler")({
  component: SchedulerPage,
});

function SchedulerPage() {
  const [tab, setTab] = useState<"schedule" | "calendar">("schedule");

  return (
    <div className="w-full px-6 py-6 md:px-10 md:py-10" style={{ paddingRight: 50 }}>
      <div>
        <h1 className="text-3xl">Scheduler</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review upcoming and past scheduled posts, export a GHL CSV, or browse everything on a
          calendar.
        </p>
      </div>

      {/* Top tabs */}
      <div className="mt-6 border-b border-border">
        <nav role="tablist" aria-label="Scheduler sections" className="-mb-px flex flex-wrap gap-1 overflow-x-auto">
          {[
            { id: "schedule" as const, label: "Post Scheduler", icon: Save },
            { id: "calendar" as const, label: "Calendar", icon: Calendar },
          ].map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {tab === "schedule" ? (
        <div className="mt-6">
          <PostSchedulerPanel />
        </div>
      ) : (
        <CalendarPage title="Calendar" platform="gmb" />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Post Scheduler — upcoming schedule + GHL CSV export                */
/* ------------------------------------------------------------------ */

type ScheduledPost = {
  id: string;
  caption: string;
  status: string;
  scheduled_at: string | null;
  created_at: string;
  location_label: string | null;
  image_ids: string[] | null;
};

function PostSchedulerPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [scope, setScope] = useState<"upcoming" | "all">("upcoming");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    supabase
      .from("social_posts")
      .select(
        "id,caption,status,scheduled_at,created_at,location_label,image_ids",
      )
      .not("scheduled_at", "is", null)
      .order("scheduled_at", { ascending: true })
      .limit(500)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        setPosts((data ?? []) as unknown as ScheduledPost[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    const now = Date.now();
    return scope === "upcoming"
      ? posts.filter(
          (p) => p.scheduled_at && new Date(p.scheduled_at).getTime() >= now,
        )
      : posts;
  }, [posts, scope]);

  function downloadCsv() {
    if (!rows.length) {
      toast.error("Nothing scheduled to export.");
      return;
    }
    const origin = window.location.origin;
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

    const header =
      "postAtSpecificTime (YYYY-MM-DD HH:mm:ss),content,link (OGmetaUrl),imageUrls,gifUrl,videoUrls,thumbnailUrl";
    const lines = rows.map((p) => {
      const when = p.scheduled_at ? new Date(p.scheduled_at) : new Date();
      const urls = (p.image_ids ?? [])
        .map((id) => `${origin}/api/public/img/${id}.jpg`)
        .join(" ");
      return [esc(fmt(when)), esc(p.caption ?? ""), "", esc(urls), "", "", ""].join(",");
    });

    const csv = `${header}\n${lines.join("\n")}\n`;
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ghl-schedule-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast.success(`GHL CSV ready — ${rows.length} ${rows.length === 1 ? "row" : "rows"}.`);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Calendar className="h-4 w-4 text-primary" /> Post scheduler
            </div>
            <div className="text-xs text-muted-foreground">
              Every scheduled post, with a GoHighLevel-ready CSV export.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-border p-0.5">
              {(["upcoming", "all"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`rounded px-2.5 py-1 text-xs font-medium capitalize ${
                    scope === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              onClick={downloadCsv}
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
              title="Download a GoHighLevel Social Planner CSV of this schedule"
            >
              <Save className="h-3.5 w-3.5" /> Download GHL CSV ({rows.length})
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        {loading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading schedule…
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-destructive">{error}</div>
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No scheduled posts yet. Set a schedule time in Post Generator → Compose → Publish.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-widest text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Scheduled</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Images</th>
                  <th className="py-2 font-medium">Content</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-border/60 align-top">
                    <td className="whitespace-nowrap py-2 pr-4 tabular-nums">
                      {p.scheduled_at ? new Date(p.scheduled_at).toLocaleString() : "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
                        {p.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 tabular-nums text-muted-foreground">
                      {p.image_ids?.length ?? 0}
                    </td>
                    <td className="max-w-[520px] py-2 text-muted-foreground">
                      <span className="line-clamp-2 whitespace-pre-wrap">{p.caption}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PostSchedulerCalendar posts={rows} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Post Scheduler — mini calendar view                                */
/* ------------------------------------------------------------------ */

function dateKeyLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function buildCalendarMonthGrid(cursor: Date): Date[] {
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const first = new Date(y, m, 1);
  const startWeekday = first.getDay(); // 0 = Sun
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: Date[] = [];
  for (let i = startWeekday; i > 0; i--) cells.push(new Date(y, m, 1 - i));
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m, d));
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
    cells.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
  }
  while (cells.length < 42) {
    const last = cells[cells.length - 1];
    cells.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
  }
  return cells;
}

function PostSchedulerCalendar({ posts }: { posts: ScheduledPost[] }) {
  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const monthDays = useMemo(() => buildCalendarMonthGrid(cursor), [cursor]);
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const todayKey = dateKeyLocal(new Date());

  const byDay = useMemo(() => {
    const map = new Map<string, ScheduledPost[]>();
    for (const p of posts) {
      if (!p.scheduled_at) continue;
      const key = dateKeyLocal(new Date(p.scheduled_at));
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    for (const arr of map.values()) {
      arr.sort(
        (a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime(),
      );
    }
    return map;
  }, [posts]);

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Calendar className="h-4 w-4 text-primary" /> Calendar view
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="rounded-md border border-border p-1.5 hover:bg-accent"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-[9rem] text-center text-sm font-medium">{monthLabel}</div>
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
            }}
            className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent"
          >
            Today
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-7 border-b border-border bg-muted/30 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {monthDays.map((d, i) => {
            const key = dateKeyLocal(d);
            const inMonth = d.getMonth() === cursor.getMonth();
            const isToday = key === todayKey;
            const dayPosts = byDay.get(key) ?? [];
            return (
              <div
                key={i}
                className={`relative flex min-h-[132px] flex-col gap-1.5 border-b border-r border-border/60 p-2 ${
                  inMonth ? "bg-card" : "bg-muted/20"
                }`}
              >
                <span
                  className={`inline-flex h-6 w-fit min-w-[1.5rem] items-center gap-1 rounded-full px-1.5 text-xs font-semibold ${
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : inMonth
                        ? "text-foreground/80"
                        : "text-muted-foreground/50"
                  }`}
                >
                  {d.getDate()}
                  {d.getDate() === 1 && (
                    <span className="font-normal">
                      {d.toLocaleDateString(undefined, { month: "short" })}
                    </span>
                  )}
                </span>

                <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
                  {dayPosts.map((p) => (
                    <CalendarPostCard key={p.id} post={p} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function CalendarPostCard({ post }: { post: ScheduledPost }) {
  const firstImageId = post.image_ids?.[0] ?? null;
  const time = post.scheduled_at
    ? new Date(post.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";
  const firstLine = (post.caption ?? "").split("\n")[0].trim() || "Untitled post";

  return (
    <div
      title={post.caption}
      className="group flex flex-col gap-1.5 rounded-lg border border-border bg-background p-1.5 shadow-sm transition hover:border-primary/50 hover:shadow-md"
    >
      {post.location_label && (
        <span className="truncate text-[10px] font-medium text-foreground/80">
          {post.location_label}
        </span>
      )}
      {time && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" /> {time}
        </div>
      )}
      {firstImageId && (
        <img
          src={`/api/public/img/${firstImageId}.jpg`}
          alt=""
          loading="lazy"
          className="h-16 w-full rounded-md object-cover"
        />
      )}
      <div className="flex items-start gap-1 text-[11px]">
        <Calendar className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="line-clamp-2">{firstLine}</span>
      </div>
    </div>
  );
}
