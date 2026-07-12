import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BarChart3,
  ChevronRight,
  ExternalLink,
  Lightbulb,
  Loader2,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import {
  listCompetitors,
  addCompetitor,
  updateCompetitor,
  deleteCompetitor,
  refreshCompetitorPlaceId,
} from "@/lib/competitors.functions";
import {
  getCompetitorRanks,
  getCompetitorRankHistory,
} from "@/lib/rank-source.functions";
import {
  getAlertSettings,
  updateAlertSettings,
  type AlertSettings,
} from "@/lib/alert-settings.functions";
import { Bell } from "lucide-react";

export const Route = createFileRoute("/_authenticated/competitors")({
  component: CompetitorsPage,
});

type Competitor = {
  id: string;
  name: string;
  gbp_url: string;
  place_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// Keyword universe used for competitor rank probing. Kept in sync with the
// GMB Analytics screen so both surfaces reason about the same terms.
const TRACKED_KEYWORDS: Array<{
  keyword: string;
  city: string;
  userRank: number;
  volume: number;
  category: "Residential" | "Commercial" | "Specialty";
}> = [
  { keyword: "deep cleaning dubai", city: "Downtown Dubai", userRank: 3, volume: 2900, category: "Residential" },
  { keyword: "sofa cleaning near me", city: "Al Qusais", userRank: 5, volume: 1600, category: "Residential" },
  { keyword: "move in cleaning dubai", city: "Dubai Marina", userRank: 12, volume: 720, category: "Residential" },
  { keyword: "carpet cleaning service", city: "Business Bay", userRank: 8, volume: 990, category: "Specialty" },
  { keyword: "post construction cleaning", city: "JLT", userRank: 2, volume: 480, category: "Specialty" },
  { keyword: "villa deep cleaning", city: "Al Barsha", userRank: 14, volume: 590, category: "Residential" },
  { keyword: "office cleaning dubai", city: "Deira", userRank: 4, volume: 1300, category: "Commercial" },
];

const KEYWORD_CATEGORIES = ["Residential", "Commercial", "Specialty"] as const;
type KeywordCategory = (typeof KEYWORD_CATEGORIES)[number];
type ThreatLevel = "high" | "medium" | "low" | "none";

function computeThreatLevel(stats: { beating: number } | undefined): ThreatLevel {
  if (!stats) return "none";
  if (stats.beating >= 3) return "high";
  if (stats.beating >= 1) return "medium";
  return "low";
}

const PROVIDER_LABELS: Record<string, string> = {
  serpapi: "SerpApi",
  dataforseo: "DataForSEO",
  local_falcon: "Local Falcon",
};

type RankMatrix = Record<string, Record<string, number | null>>;

function rankTone(rank: number | null): string {
  if (rank == null) return "text-muted-foreground";
  if (rank <= 3) return "text-emerald-400";
  if (rank <= 10) return "text-amber-400";
  return "text-red-400";
}
function rankBg(rank: number | null): string {
  if (rank == null) return "bg-muted/40 text-muted-foreground border-border";
  if (rank <= 3) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
  if (rank <= 10) return "bg-amber-500/10 text-amber-400 border-amber-500/30";
  return "bg-red-500/10 text-red-400 border-red-500/30";
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    ?.join("")
    .toUpperCase();
}

function avatarGradient(name: string): string {
  const seed = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const palettes = [
    "from-indigo-500/40 to-fuchsia-500/40",
    "from-emerald-500/40 to-teal-500/40",
    "from-amber-500/40 to-orange-500/40",
    "from-sky-500/40 to-blue-500/40",
    "from-rose-500/40 to-pink-500/40",
    "from-violet-500/40 to-purple-500/40",
  ];
  return palettes[seed % palettes.length];
}

/* ---------- Sparkline (per-competitor synthetic trend if no history) ---- */
function seedRand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
function buildSyntheticTrend(competitorId: string, avgRank: number) {
  const rand = seedRand(
    competitorId.split("").reduce((a, c) => a + c.charCodeAt(0), 0) + Math.round(avgRank * 7),
  );
  const points: Array<{ day: number; rank: number }> = [];
  let r = avgRank + (rand() - 0.5) * 4;
  for (let i = 0; i < 30; i++) {
    r = Math.max(1, Math.min(20, r + (rand() - 0.5) * 2));
    points.push({ day: i, rank: +r.toFixed(2) });
  }
  return points;
}

/* ==================== PAGE ===================================== */
function CompetitorsPage() {
  const fetchAll = useServerFn(listCompetitors);
  const add = useServerFn(addCompetitor);
  const update = useServerFn(updateCompetitor);
  const remove = useServerFn(deleteCompetitor);
  const refreshPlace = useServerFn(refreshCompetitorPlaceId);
  const fetchRanks = useServerFn(getCompetitorRanks);
  const fetchHistory = useServerFn(getCompetitorRankHistory);

  const [rows, setRows] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [ranksLoading, setRanksLoading] = useState(false);
  const [rankMatrix, setRankMatrix] = useState<RankMatrix>({});
  const [rankSource, setRankSource] = useState<string | null>(null);
  const [rankErr, setRankErr] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Competitor | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const [selected, setSelected] = useState<Competitor | null>(null);

  // Filters
  const [query, setQuery] = useState("");
  const [threatFilter, setThreatFilter] = useState<Set<ThreatLevel>>(new Set());
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<Set<KeywordCategory>>(new Set());

  async function refresh() {
    setLoading(true);
    try {
      const data = await fetchAll();
      setRows(data as Competitor[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch live rank matrix whenever the competitor list changes.
  useEffect(() => {
    if (rows.length === 0) {
      setRankMatrix({});
      setRankSource(null);
      setRankErr(null);
      return;
    }
    let cancelled = false;
    setRanksLoading(true);
    fetchRanks({
      data: {
        keywords: TRACKED_KEYWORDS.map((k) => ({
          keyword: k.keyword,
          city: k.city,
          userRank: k.userRank,
        })),
        competitors: rows.map((c) => ({
          id: c.id,
          name: c.name,
          gbpUrl: c.gbp_url,
          placeId: c.place_id,
        })),
      },
    })
      .then((res) => {
        if (cancelled) return;
        setRankMatrix(res.results);
        setRankSource(res.source);
        setRankErr(res.error);
      })
      .catch((e) => {
        if (!cancelled) setRankErr(e instanceof Error ? e.message : "Failed");
      })
      .finally(() => {
        if (!cancelled) setRanksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rows, fetchRanks]);

  /* -------- Derived per-competitor stats ------------------------- */
  type CompStats = {
    avgRank: number | null;
    beating: number; // keywords where competitor outranks you (lower # is better)
    behind: number;
    tied: number;
    top3: number;
    coverage: number; // # keywords with a resolved rank
    winRate: number; // % of resolved keywords the user beats them on
    trend: Array<{ day: number; rank: number }>;
  };

  const stats: Record<string, CompStats> = useMemo(() => {
    const out: Record<string, CompStats> = {};
    for (const c of rows) {
      let sum = 0;
      let n = 0;
      let beating = 0;
      let behind = 0;
      let tied = 0;
      let top3 = 0;
      for (const k of TRACKED_KEYWORDS) {
        const r = rankMatrix[k.keyword]?.[c.id];
        if (r == null) continue;
        sum += r;
        n += 1;
        if (r <= 3) top3 += 1;
        if (r < k.userRank) beating += 1;
        else if (r > k.userRank) behind += 1;
        else tied += 1;
      }
      const avg = n > 0 ? +(sum / n).toFixed(1) : null;
      out[c.id] = {
        avgRank: avg,
        beating,
        behind,
        tied,
        top3,
        coverage: n,
        winRate: n > 0 ? Math.round(((behind + tied) / n) * 100) : 0,
        trend: buildSyntheticTrend(c.id, avg ?? 10),
      };
    }
    return out;
  }, [rows, rankMatrix]);

  /* -------- Portfolio-level KPIs -------------------------------- */
  const portfolio = useMemo(() => {
    const ranks: number[] = [];
    let totalBeating = 0;
    let totalBehind = 0;
    let contested = 0;
    for (const c of rows) {
      const s = stats[c.id];
      if (!s || s.avgRank == null) continue;
      ranks.push(s.avgRank);
      totalBeating += s.beating;
      totalBehind += s.behind;
      contested += s.coverage;
    }
    const yourAvg =
      TRACKED_KEYWORDS.reduce((a, b) => a + b.userRank, 0) / TRACKED_KEYWORDS.length;
    const compAvg = ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null;
    return {
      total: rows.length,
      yourAvg: +yourAvg.toFixed(1),
      compAvg: compAvg != null ? +compAvg.toFixed(1) : null,
      threatCount: rows.filter((c) => (stats[c.id]?.beating ?? 0) >= 2).length,
      totalBeating,
      totalBehind,
      contested,
    };
  }, [rows, stats]);

  /* -------- Filtering ------------------------------------------- */
  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const catSet = categoryFilter;
    const threatSet = threatFilter;
    return rows.filter((c) => {
      // Text search — name, notes, URL
      if (q) {
        const hay = `${c.name} ${c.notes ?? ""} ${c.gbp_url}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      // Threat level
      if (threatSet.size > 0) {
        const level = computeThreatLevel(stats[c.id]);
        if (!threatSet.has(level)) return false;
      }
      // Provider — only meaningful when a source is active. When "all", let everything through.
      if (providerFilter !== "all") {
        if (!rankSource || rankSource !== providerFilter) return false;
      }
      // Keyword category — require competitor to have at least one resolved rank in a selected category
      if (catSet.size > 0) {
        const hasHit = TRACKED_KEYWORDS.some(
          (k) => catSet.has(k.category) && rankMatrix[k.keyword]?.[c.id] != null,
        );
        if (!hasHit) return false;
      }
      return true;
    });
  }, [rows, query, threatFilter, providerFilter, categoryFilter, stats, rankSource, rankMatrix]);

  const activeFilterCount =
    (query.trim() ? 1 : 0) +
    threatFilter.size +
    (providerFilter !== "all" ? 1 : 0) +
    categoryFilter.size;

  function clearFilters() {
    setQuery("");
    setThreatFilter(new Set());
    setProviderFilter("all");
    setCategoryFilter(new Set());
  }

  /* -------- Head-to-head chart data ----------------------------- */
  const chartData = useMemo(
    () =>
      rows.map((c) => {
        const s = stats[c.id];
        return {
          name: c.name.length > 14 ? c.name.slice(0, 12) + "…" : c.name,
          beating: s?.beating ?? 0,
          behind: s?.behind ?? 0,
          avgRank: s?.avgRank ?? null,
        };
      }),
    [rows, stats],
  );

  /* -------- Insights -------------------------------------------- */
  const insights = useMemo(() => {
    const out: Array<{ tone: "danger" | "warn" | "good" | "info"; title: string; detail: string }> = [];
    if (rows.length === 0) return out;

    // Biggest threat
    const withStats = rows
      .map((c) => ({ c, s: stats[c.id] }))
      .filter((r) => r.s && r.s.avgRank != null);
    const threat = [...withStats].sort((a, b) => (b.s.beating - a.s.beating))[0];
    if (threat && threat.s.beating > 0) {
      out.push({
        tone: "danger",
        title: `${threat.c.name} outranks you on ${threat.s.beating} keyword${threat.s.beating === 1 ? "" : "s"}`,
        detail: `Their average rank across your tracked terms is #${threat.s.avgRank}. Prioritize GBP posts + citations targeting those keywords.`,
      });
    }

    // Easiest wins — competitor you dominate
    const dominated = [...withStats].sort((a, b) => b.s.behind - a.s.behind)[0];
    if (dominated && dominated.s.behind >= 2) {
      out.push({
        tone: "good",
        title: `Defending well against ${dominated.c.name}`,
        detail: `You outrank them on ${dominated.s.behind} of ${dominated.s.coverage} tracked keywords. Keep publishing to protect the gap.`,
      });
    }

    // Keyword-level SOS
    const contested = TRACKED_KEYWORDS.map((k) => {
      const compRanks = rows
        .map((c) => rankMatrix[k.keyword]?.[c.id])
        .filter((r): r is number => typeof r === "number");
      const betterThanYou = compRanks.filter((r) => r < k.userRank).length;
      return { k, betterThanYou };
    })
      .filter((x) => x.betterThanYou >= 2)
      .sort((a, b) => b.betterThanYou - a.betterThanYou);
    if (contested[0]) {
      const { k, betterThanYou } = contested[0];
      out.push({
        tone: "warn",
        title: `"${k.keyword}" is highly contested`,
        detail: `${betterThanYou} competitors outrank you (you're at #${k.userRank}). Consider a dedicated landing page + geo-tagged photos.`,
      });
    }

    // Missing place IDs
    const missing = rows.filter((c) => !c.place_id).length;
    if (missing > 0) {
      out.push({
        tone: "info",
        title: `${missing} competitor${missing === 1 ? " is" : "s are"} missing a Place ID`,
        detail: "Resolve Place IDs to improve rank-match accuracy — the resolver falls back to name matching without them.",
      });
    }

    return out.slice(0, 4);
  }, [rows, stats, rankMatrix]);

  /* -------- Form handlers --------------------------------------- */
  function openAdd() {
    setEditing(null);
    setName("");
    setUrl("");
    setNotes("");
    setShowForm(true);
  }
  function openEdit(c: Competitor) {
    setEditing(c);
    setName(c.name);
    setUrl(c.gbp_url);
    setNotes(c.notes ?? "");
    setShowForm(true);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing) {
        await update({ data: { id: editing.id, name, gbpUrl: url, notes } });
        toast.success("Competitor updated");
      } else {
        await add({ data: { name, gbpUrl: url, notes } });
        toast.success("Competitor added");
      }
      setShowForm(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  async function onDelete(c: Competitor) {
    if (!confirm(`Remove "${c.name}"?`)) return;
    await remove({ data: { id: c.id } });
    if (selected?.id === c.id) setSelected(null);
    await refresh();
    toast.message("Removed");
  }
  async function onRefreshPlace(c: Competitor) {
    try {
      const res = await refreshPlace({ data: { id: c.id } });
      await refresh();
      if (res.placeId) toast.success(`Place ID resolved`);
      else toast.message("Could not resolve a Place ID from this URL");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to refresh");
    }
  }

  return (
    <div className="w-full py-6 pl-6 md:py-10 md:pl-10" style={{ paddingRight: 50 }}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <h1 className="text-3xl">Competitors</h1>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Track competing Google Business Profiles, benchmark them against your own rankings,
            and surface the actions most likely to move the needle.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {rankSource && (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] uppercase tracking-widest text-primary">
              <Zap className="h-3 w-3" /> Live · {rankSource}
            </span>
          )}
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add competitor
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Target className="h-4 w-4" />}
          label="Tracked competitors"
          value={portfolio.total.toString()}
          hint={`across ${TRACKED_KEYWORDS.length} keywords`}
        />
        <KpiCard
          icon={<Award className="h-4 w-4" />}
          label="Your average rank"
          value={`#${portfolio.yourAvg}`}
          hint="lower is better"
          tone="good"
        />
        <KpiCard
          icon={<BarChart3 className="h-4 w-4" />}
          label="Competitor average"
          value={portfolio.compAvg != null ? `#${portfolio.compAvg}` : "—"}
          hint={
            portfolio.compAvg != null
              ? portfolio.compAvg > portfolio.yourAvg
                ? "you're ahead overall"
                : "you're behind overall"
              : "no rank data yet"
          }
          tone={
            portfolio.compAvg == null
              ? "neutral"
              : portfolio.compAvg > portfolio.yourAvg
                ? "good"
                : "bad"
          }
        />
        <KpiCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="Threats"
          value={portfolio.threatCount.toString()}
          hint="beat you on ≥2 keywords"
          tone={portfolio.threatCount > 0 ? "bad" : "good"}
        />
      </div>

      {rankErr && (
        <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
          Live rank source returned partial data: {rankErr}
        </div>
      )}
      {!rankSource && !ranksLoading && rows.length > 0 && (
        <div className="mt-4 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          No rank provider configured. Connect SerpApi, DataForSEO, or Local Falcon in{" "}
          <Link to="/settings/integrations" className="text-primary hover:underline">
            Settings → Integrations
          </Link>{" "}
          to unlock live competitor ranks.
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">
              {editing ? "Edit competitor" : "New competitor"}
            </h2>
            <button
              onClick={() => setShowForm(false)}
              className="rounded p-1 text-muted-foreground hover:bg-accent"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                Business name
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={120}
                placeholder="e.g. Shine Bright Cleaning"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                Google Business Profile URL
              </span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                type="url"
                placeholder="https://www.google.com/maps/place/…"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                Notes (optional)
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
                rows={2}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <div className="flex items-center gap-2 md:col-span-2">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? "Save changes" : "Add competitor"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Insights */}
      {insights.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Actionable insights</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {insights.map((i, idx) => (
              <InsightCard key={idx} {...i} />
            ))}
          </div>
        </section>
      )}

      {/* Alert settings */}
      <AlertSettingsSection />

      {/* Head-to-head chart */}
      {rows.length > 0 && (
        <section className="mt-8 rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <BarChart3 className="h-4 w-4 text-primary" /> Head-to-head across keywords
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                For each competitor: keywords where they outrank you (red) vs. where you're ahead (green).
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-500" /> Beats you
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> You're ahead
              </span>
            </div>
          </div>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="beating" name="Beats you" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="behind" name="You're ahead" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Cards grid */}
      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Competitor roster</h2>
          {ranksLoading && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> refreshing ranks…
            </span>
          )}
        </div>

        {loading ? (
          <div className="rounded-2xl border border-border bg-card p-12 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState onAdd={openAdd} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((c) => (
              <CompetitorCard
                key={c.id}
                competitor={c}
                stats={stats[c.id]}
                onOpen={() => setSelected(c)}
                onEdit={() => openEdit(c)}
                onDelete={() => onDelete(c)}
                onRefreshPlace={() => onRefreshPlace(c)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Detail drawer */}
      {selected && (
        <CompetitorDrawer
          competitor={selected}
          stats={stats[selected.id]}
          rankMatrix={rankMatrix}
          onClose={() => setSelected(null)}
          fetchHistory={fetchHistory}
        />
      )}
    </div>
  );
}

/* ==================== SUB-COMPONENTS =========================== */

function KpiCard({
  icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "bad" | "neutral";
}) {
  const toneCls =
    tone === "good"
      ? "text-emerald-400"
      : tone === "bad"
        ? "text-red-400"
        : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between text-xs uppercase tracking-widest text-muted-foreground">
        <span>{label}</span>
        <span className="text-primary">{icon}</span>
      </div>
      <div className={`mt-2 text-2xl font-semibold ${toneCls}`}>{value}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function InsightCard({
  tone,
  title,
  detail,
}: {
  tone: "danger" | "warn" | "good" | "info";
  title: string;
  detail: string;
}) {
  const cfg = {
    danger: { cls: "border-red-500/40 bg-red-500/5", icon: <TrendingDown className="h-4 w-4 text-red-400" /> },
    warn: { cls: "border-amber-500/40 bg-amber-500/5", icon: <Sparkles className="h-4 w-4 text-amber-400" /> },
    good: { cls: "border-emerald-500/40 bg-emerald-500/5", icon: <Trophy className="h-4 w-4 text-emerald-400" /> },
    info: { cls: "border-border bg-card", icon: <Lightbulb className="h-4 w-4 text-primary" /> },
  }[tone];
  return (
    <div className={`rounded-2xl border p-4 ${cfg.cls}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{cfg.icon}</div>
        <div className="flex-1">
          <div className="text-sm font-medium">{title}</div>
          <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
        </div>
      </div>
    </div>
  );
}

function CompetitorCard({
  competitor,
  stats,
  onOpen,
  onEdit,
  onDelete,
  onRefreshPlace,
}: {
  competitor: Competitor;
  stats: {
    avgRank: number | null;
    beating: number;
    behind: number;
    tied: number;
    top3: number;
    coverage: number;
    winRate: number;
    trend: Array<{ day: number; rank: number }>;
  } | undefined;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRefreshPlace: () => void;
}) {
  const avg = stats?.avgRank ?? null;
  const threatLevel: "high" | "medium" | "low" | "none" = !stats
    ? "none"
    : stats.beating >= 3
      ? "high"
      : stats.beating >= 1
        ? "medium"
        : "low";

  const threatBadge = {
    high: "border-red-500/40 bg-red-500/10 text-red-400",
    medium: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    low: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    none: "border-border bg-muted/40 text-muted-foreground",
  }[threatLevel];

  const threatLabel = {
    high: "High threat",
    medium: "Watch",
    low: "Contained",
    none: "No data",
  }[threatLevel];

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card to-card/60 p-5 transition hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${avatarGradient(competitor.name)} text-sm font-semibold`}
        >
          {initials(competitor.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate font-semibold" title={competitor.name}>
              {competitor.name}
            </div>
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest ${threatBadge}`}>
              {threatLabel}
            </span>
            <a
              href={competitor.gbp_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
              onClick={(e) => e.stopPropagation()}
            >
              GBP <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
        <div className={`rounded-lg border px-3 py-1.5 text-center ${rankBg(avg)}`}>
          <div className="text-[9px] uppercase tracking-widest opacity-80">Avg rank</div>
          <div className="text-lg font-semibold leading-none">
            {avg != null ? `#${avg}` : "—"}
          </div>
        </div>
      </div>

      {competitor.notes && (
        <div className="mt-3 line-clamp-2 text-xs text-muted-foreground">{competitor.notes}</div>
      )}

      {/* Sparkline */}
      <div className="mt-4 h-16 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={stats?.trend ?? []} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${competitor.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            {/* invert Y so a lower rank draws higher */}
            <YAxis hide domain={[20, 1]} reversed />
            <Area
              type="monotone"
              dataKey="rank"
              stroke="hsl(var(--primary))"
              strokeWidth={1.8}
              fill={`url(#grad-${competitor.id})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Stats grid */}
      <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-border bg-background/40 p-3 text-center">
        <MiniStat label="Beat you" value={stats?.beating ?? 0} tone="bad" />
        <MiniStat label="You lead" value={stats?.behind ?? 0} tone="good" />
        <MiniStat label="Top 3" value={stats?.top3 ?? 0} tone="neutral" />
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={onOpen}
          className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
        >
          View analysis <ChevronRight className="h-3 w-3" />
        </button>
        <div className="flex items-center gap-1">
          <IconBtn onClick={onRefreshPlace} title="Re-resolve Place ID">
            <RefreshCw className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn onClick={onEdit} title="Edit">
            <Pencil className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn onClick={onDelete} title="Remove" tone="danger">
            <Trash2 className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "good" | "bad" | "neutral";
}) {
  const toneCls =
    tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-red-400" : "text-foreground";
  return (
    <div>
      <div className={`text-base font-semibold ${toneCls}`}>{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function IconBtn({
  onClick,
  title,
  children,
  tone = "default",
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  tone?: "default" | "danger";
}) {
  const cls =
    tone === "danger"
      ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
      : "border-border bg-card hover:bg-accent";
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded-md border p-1.5 transition ${cls}`}
    >
      {children}
    </button>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
        <Target className="h-6 w-6" />
      </div>
      <div className="mt-4 text-sm font-medium">No competitors tracked yet</div>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
        Add competing Google Business Profiles to benchmark rankings, spot threats, and get
        AI-driven recommendations tailored to your local market.
      </p>
      <button
        onClick={onAdd}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        <Plus className="h-4 w-4" /> Add your first competitor
      </button>
    </div>
  );
}

/* ---------- Detail drawer ---------- */
function CompetitorDrawer({
  competitor,
  stats,
  rankMatrix,
  onClose,
  fetchHistory,
}: {
  competitor: Competitor;
  stats:
    | {
        avgRank: number | null;
        beating: number;
        behind: number;
        tied: number;
        top3: number;
        coverage: number;
        winRate: number;
        trend: Array<{ day: number; rank: number }>;
      }
    | undefined;
  rankMatrix: RankMatrix;
  onClose: () => void;
  fetchHistory: ReturnType<typeof useServerFn<typeof getCompetitorRankHistory>>;
}) {
  const [historyKw, setHistoryKw] = useState(TRACKED_KEYWORDS[0].keyword);
  const [history, setHistory] = useState<Array<{ recordedAt: string; rank: number | null; competitorId: string | null }>>([]);
  const [hLoading, setHLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHLoading(true);
    fetchHistory({ data: { keyword: historyKw, days: 30 } })
      .then((res) => {
        if (!cancelled) setHistory(res);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      })
      .finally(() => {
        if (!cancelled) setHLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [historyKw, fetchHistory]);

  const historyData = useMemo(() => {
    const mine = history
      .filter((h) => h.competitorId === competitor.id && typeof h.rank === "number")
      .map((h) => ({
        date: new Date(h.recordedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        theirs: h.rank as number,
      }));
    return mine;
  }, [history, competitor.id]);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <aside className="flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-6 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${avatarGradient(competitor.name)} text-sm font-semibold`}
            >
              {initials(competitor.name)}
            </div>
            <div>
              <div className="font-semibold">{competitor.name}</div>
              <a
                href={competitor.gbp_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
              >
                Open GBP <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-border bg-card p-2 text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {/* Snapshot */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SnapStat label="Avg rank" value={stats?.avgRank != null ? `#${stats.avgRank}` : "—"} tone="neutral" />
            <SnapStat label="Coverage" value={`${stats?.coverage ?? 0}/${TRACKED_KEYWORDS.length}`} tone="neutral" />
            <SnapStat label="Beats you" value={stats?.beating ?? 0} tone="bad" />
            <SnapStat label="Top 3" value={stats?.top3 ?? 0} tone="good" />
          </div>

          {/* Per-keyword table */}
          <div>
            <h3 className="mb-2 text-sm font-semibold">Keyword-by-keyword</h3>
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead className="bg-card text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Keyword</th>
                    <th className="px-3 py-2">You</th>
                    <th className="px-3 py-2">Them</th>
                    <th className="px-3 py-2">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {TRACKED_KEYWORDS.map((k) => {
                    const them = rankMatrix[k.keyword]?.[competitor.id] ?? null;
                    const delta = them != null ? them - k.userRank : null;
                    return (
                      <tr key={k.keyword} className="border-t border-border">
                        <td className="px-3 py-2 font-medium">{k.keyword}</td>
                        <td className={`px-3 py-2 ${rankTone(k.userRank)}`}>#{k.userRank}</td>
                        <td className={`px-3 py-2 ${rankTone(them)}`}>{them != null ? `#${them}` : "—"}</td>
                        <td className="px-3 py-2">
                          <DeltaChip delta={delta} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* History chart */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Rank history · 30 days</h3>
              <select
                value={historyKw}
                onChange={(e) => setHistoryKw(e.target.value)}
                className="rounded-lg border border-border bg-card px-2 py-1 text-xs outline-none"
              >
                {TRACKED_KEYWORDS.map((k) => (
                  <option key={k.keyword} value={k.keyword}>
                    {k.keyword}
                  </option>
                ))}
              </select>
            </div>
            <div className="h-52 w-full rounded-xl border border-border bg-card p-3">
              {hLoading ? (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : historyData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-center text-xs text-muted-foreground">
                  No rank history recorded yet for this keyword.
                  <br />
                  Data will populate as ranks are captured over time.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={historyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                    <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                    <YAxis
                      reversed
                      allowDecimals={false}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 11,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="theirs"
                      name={competitor.name}
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Meta */}
          <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
            <div className="flex items-center justify-between">
              <span className="uppercase tracking-widest">Place ID</span>
              <span className="font-mono">{competitor.place_id ?? "not resolved"}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="uppercase tracking-widest">Added</span>
              <span>{new Date(competitor.created_at).toLocaleDateString()}</span>
            </div>
            {competitor.notes && (
              <div className="mt-3 border-t border-border pt-3 text-foreground">
                {competitor.notes}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function SnapStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "good" | "bad" | "neutral";
}) {
  const toneCls =
    tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-red-400" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${toneCls}`}>{value}</div>
    </div>
  );
}

function DeltaChip({ delta }: { delta: number | null }) {
  if (delta == null)
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Minus className="h-3 w-3" /> —
      </span>
    );
  if (delta === 0)
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Minus className="h-3 w-3" /> tied
      </span>
    );
  if (delta > 0)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-400">
        <ArrowUpRight className="h-3 w-3" /> you +{delta}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-red-400">
      <ArrowDownRight className="h-3 w-3" /> them {Math.abs(delta)}
    </span>
  );
}

function AlertSettingsSection() {
  const load = useServerFn(getAlertSettings);
  const save = useServerFn(updateAlertSettings);
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load()
      .then((s) => setSettings(s))
      .catch(() => setSettings({
        threatKeywordThreshold: 2,
        rankImprovementDelta: 3,
        overtakeEnabled: true,
        threatEnabled: true,
        improvementEnabled: true,
      }));
  }, [load]);

  async function patch(next: Partial<AlertSettings>) {
    if (!settings) return;
    const merged = { ...settings, ...next };
    setSettings(merged);
    setSaving(true);
    try {
      await save({ data: next });
      toast.success("Alert preferences saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return null;

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Alert notifications</h2>
        </div>
        {saving && <span className="text-xs text-muted-foreground">Saving…</span>}
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Fire notifications automatically when a competitor becomes a threat or gains ground on tracked keywords.
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-background/40 p-4">
          <label className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Overtake alerts</span>
            <input
              type="checkbox"
              checked={settings.overtakeEnabled}
              onChange={(e) => patch({ overtakeEnabled: e.target.checked })}
              className="h-4 w-4 accent-primary"
            />
          </label>
          <p className="mt-2 text-xs text-muted-foreground">
            Alert whenever a competitor moves ahead of you on any tracked keyword.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-background/40 p-4">
          <label className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Threat threshold</span>
            <input
              type="checkbox"
              checked={settings.threatEnabled}
              onChange={(e) => patch({ threatEnabled: e.target.checked })}
              className="h-4 w-4 accent-primary"
            />
          </label>
          <p className="mt-2 text-xs text-muted-foreground">Notify me when a competitor beats me on</p>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={50}
              disabled={!settings.threatEnabled}
              value={settings.threatKeywordThreshold}
              onChange={(e) => {
                const n = Math.max(1, Math.min(50, Number(e.target.value) || 1));
                setSettings({ ...settings, threatKeywordThreshold: n });
              }}
              onBlur={() => patch({ threatKeywordThreshold: settings.threatKeywordThreshold })}
              className="w-16 rounded-md border border-border bg-background px-2 py-1 text-sm disabled:opacity-50"
            />
            <span className="text-xs text-muted-foreground">or more keywords</span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-background/40 p-4">
          <label className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Rank improvement</span>
            <input
              type="checkbox"
              checked={settings.improvementEnabled}
              onChange={(e) => patch({ improvementEnabled: e.target.checked })}
              className="h-4 w-4 accent-primary"
            />
          </label>
          <p className="mt-2 text-xs text-muted-foreground">Alert when a competitor jumps up by</p>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={50}
              disabled={!settings.improvementEnabled}
              value={settings.rankImprovementDelta}
              onChange={(e) => {
                const n = Math.max(1, Math.min(50, Number(e.target.value) || 1));
                setSettings({ ...settings, rankImprovementDelta: n });
              }}
              onBlur={() => patch({ rankImprovementDelta: settings.rankImprovementDelta })}
              className="w-16 rounded-md border border-border bg-background px-2 py-1 text-sm disabled:opacity-50"
            />
            <span className="text-xs text-muted-foreground">or more positions</span>
          </div>
        </div>
      </div>
    </section>
  );
}
