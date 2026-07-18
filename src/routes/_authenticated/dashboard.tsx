import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  Film,
  Images,
  KeyRound,
  LayoutDashboard,
  PenSquare,
  Target,
  Upload,
  Workflow,
  ArrowUpRight,
  Zap,
  Bell,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardCompetitorMap } from "@/components/DashboardCompetitorMap";
import { HeartbeatStatusCard } from "@/components/HeartbeatStatusCard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

type Counts = {
  keywords: number;
  competitors: number;
  images: number;
  videos: number;
  posts: number;
  folders: number;
  unreadAlerts: number;
  scheduled: number;
};

function DashboardPage() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setDisplayName(
          (user.user_metadata?.full_name as string) ||
            (user.email?.split("@")[0] ?? ""),
        );
      }
      const head = (t: string, extra?: (q: unknown) => unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = supabase.from(t as any).select("*", { count: "exact", head: true });
        if (extra) q = extra(q);
        return q;
      };
      const [kw, comp, imgs, vids, posts, folders, alerts, sched] = await Promise.all([
        head("keywords"),
        head("competitors"),
        head("images"),
        head("videos"),
        head("social_posts"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        head("keyword_folders" as any),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        head("rank_alerts", (q: any) => q.eq("read", false)),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        head("social_posts", (q: any) => q.eq("status", "scheduled")),
      ]);
      setCounts({
        keywords: kw.count ?? 0,
        competitors: comp.count ?? 0,
        images: imgs.count ?? 0,
        videos: vids.count ?? 0,
        posts: posts.count ?? 0,
        folders: folders.count ?? 0,
        unreadAlerts: alerts.count ?? 0,
        scheduled: sched.count ?? 0,
      });
      setLoading(false);
    })();
  }, []);

  const kpis = [
    {
      label: "Tracked keywords",
      value: counts?.keywords,
      icon: KeyRound,
      hint: `${counts?.folders ?? 0} folders`,
      to: "/keywords",
    },
    {
      label: "Competitors",
      value: counts?.competitors,
      icon: Target,
      hint: "Rank & threat monitoring",
      to: "/competitors",
    },
    {
      label: "Media assets",
      value: (counts?.images ?? 0) + (counts?.videos ?? 0),
      icon: Images,
      hint: `${counts?.images ?? 0} images · ${counts?.videos ?? 0} videos`,
      to: "/library",
    },
    {
      label: "Unread alerts",
      value: counts?.unreadAlerts,
      icon: Bell,
      hint: `${counts?.scheduled ?? 0} scheduled posts`,
      to: "/competitors",
      tone: (counts?.unreadAlerts ?? 0) > 0 ? "warn" : "muted",
    },
  ] as const;

  const modules = [
    {
      to: "/wizard",
      icon: Workflow,
      title: "Pipeline",
      description: "End-to-end workflow to plan, produce, and publish rank-boosting posts.",
      accent: "from-indigo-500/20 to-transparent",
    },
    {
      to: "/upload",
      icon: Upload,
      title: "Upload",
      description: "Batch-upload photos and clips, extract frames, and tag for reuse.",
      accent: "from-sky-500/20 to-transparent",
    },
    {
      to: "/library",
      icon: Images,
      title: "Library",
      description: "All approved media in one searchable, taggable, reusable place.",
      accent: "from-emerald-500/20 to-transparent",
    },
    {
      to: "/videos",
      icon: Film,
      title: "Videos",
      description: "Long-form and short-form clips ready for GBP and social channels.",
      accent: "from-fuchsia-500/20 to-transparent",
    },
    {
      to: "/keywords",
      icon: KeyRound,
      title: "Keywords",
      description: "Folder-based keyword library with imports, filters, and clustering.",
      accent: "from-amber-500/20 to-transparent",
    },
    {
      to: "/gmb-analytics",
      icon: BarChart3,
      title: "GMB Analytics",
      description: "Live views, calls, direction requests, and category-level rank movement.",
      accent: "from-cyan-500/20 to-transparent",
    },
    {
      to: "/competitors",
      icon: Target,
      title: "Competitors",
      description: "Head-to-head rank tracking, threat alerts, and actionable insights.",
      accent: "from-rose-500/20 to-transparent",
    },
    {
      to: "/post-generator",
      icon: PenSquare,
      title: "GMB Post Generator",
      description: "AI-crafted GBP posts aligned to your keywords and brand voice.",
      accent: "from-violet-500/20 to-transparent",
    },
    {
      to: "/calendar",
      icon: CalendarDays,
      title: "Calendar",
      description: "Weekly and monthly publishing schedule across every profile.",
      accent: "from-teal-500/20 to-transparent",
    },
  ] as const;

  return (
    <div className="w-full py-6 pl-6 md:py-10 md:pl-10" style={{ paddingRight: 50 }}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-primary" />
            <h1 className="text-3xl">
              {displayName ? `Welcome back, ${displayName}` : "Dashboard"}
            </h1>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            A single command center for local SEO — rank tracking, media production,
            keyword research, competitor intelligence, and publishing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/wizard"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Zap className="h-4 w-4" /> Start pipeline
          </Link>
          <Link
            to="/post-generator"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm hover:border-primary/50"
          >
            <PenSquare className="h-4 w-4" /> Generate a post
          </Link>
        </div>
      </div>

      {/* Integration status */}
      <div className="mt-6">
        <HeartbeatStatusCard />
      </div>

      {/* KPI strip */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Link
            key={k.label}
            to={k.to}
            className="group rounded-xl border border-border bg-card p-4 transition hover:border-primary/50"
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <k.icon className="h-4 w-4" />
                {k.label}
              </span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <div
                className={`text-3xl font-semibold ${
                  "tone" in k && k.tone === "warn" ? "text-amber-500" : ""
                }`}
              >
                {loading ? "…" : (k.value ?? 0).toLocaleString()}
              </div>
              {"tone" in k && k.tone === "warn" && (
                <TrendingUp className="h-4 w-4 text-amber-500" />
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{k.hint}</p>
          </Link>
        ))}
      </div>

      {/* Competitive map */}
      <div className="mt-8">
        <DashboardCompetitorMap />
      </div>

      {/* Modules grid */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Modules
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <Link
              key={m.to}
              to={m.to}
              className={`group relative overflow-hidden rounded-xl border border-border bg-card p-4 transition hover:border-primary/50 hover:shadow-md`}
            >
              <div
                className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${m.accent} opacity-60`}
              />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background/60">
                    <m.icon className="h-4 w-4 text-primary" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                </div>
                <h3 className="mt-3 text-base font-semibold">{m.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{m.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
