import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Eye,
  Info,
  Lightbulb,
  Loader2,
  MapPin,
  Minus,
  Phone,
  Plug,
  Search,
  Sparkles,
  Star,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { toast } from "sonner";

import { generateChangeSuggestions } from "@/lib/insights.functions";
import { listCompetitors } from "@/lib/competitors.functions";
import { getCompetitorRanks, getCompetitorRankHistory } from "@/lib/rank-source.functions";
import { getGmbMetrics, getGmbConnectionStatus } from "@/lib/gmb-oauth.functions";
import { readGmbConnection, writeGmbConnection } from "./settings.integrations";

export const Route = createFileRoute("/_authenticated/gmb-analytics")({
  component: GmbAnalyticsPage,
});

/* ---------- MOCK DATA ----------------------------------------------- */
type KeywordRow = {
  keyword: string;
  current: number;
  previous: number;
  volume: number;
  city: string;
};

const MOCK_KEYWORDS: KeywordRow[] = [
  { keyword: "deep cleaning dubai", current: 3, previous: 7, volume: 2900, city: "Downtown Dubai" },
  { keyword: "sofa cleaning near me", current: 5, previous: 4, volume: 1600, city: "Al Qusais" },
  { keyword: "move in cleaning dubai", current: 12, previous: 18, volume: 720, city: "Dubai Marina" },
  { keyword: "carpet cleaning service", current: 8, previous: 8, volume: 990, city: "Business Bay" },
  { keyword: "post construction cleaning", current: 2, previous: 6, volume: 480, city: "JLT" },
  { keyword: "villa deep cleaning", current: 14, previous: 11, volume: 590, city: "Al Barsha" },
  { keyword: "office cleaning dubai", current: 4, previous: 9, volume: 1300, city: "Deira" },
];

// Business center = Dubai Downtown-ish
const BUSINESS = { lat: 25.2048, lng: 55.2708, name: "Pearl Home Cleaning" };
const GRID_SIZE = 7;
const GRID_STEP_DEG = 0.012; // ~1.3 km per cell

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function buildGrid(
  keyword: string,
  weekOffset = 0,
): { lat: number; lng: number; rank: number }[] {
  const seed =
    keyword.split("").reduce((a, c) => a + c.charCodeAt(0), 0) +
    weekOffset * 137;
  const rand = seededRandom(seed);
  const drift = weekOffset === 0 ? 0 : -0.6; // this week trends slightly better than last
  const cells: { lat: number; lng: number; rank: number }[] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const dx = c - (GRID_SIZE - 1) / 2;
      const dy = r - (GRID_SIZE - 1) / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const rank = Math.max(
        1,
        Math.min(20, Math.round(dist * 2.4 + rand() * 4 + drift)),
      );
      cells.push({
        lat: BUSINESS.lat + dy * GRID_STEP_DEG,
        lng: BUSINESS.lng + dx * GRID_STEP_DEG,
        rank,
      });
    }
  }
  return cells;
}

function rankColor(rank: number): string {
  if (rank <= 3) return "#22c55e";
  if (rank <= 10) return "#f59e0b";
  return "#ef4444";
}

function TrendCell({ current, previous }: { current: number; previous: number }) {
  const delta = previous - current;
  if (delta === 0)
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Minus className="h-3.5 w-3.5" /> 0
      </span>
    );
  if (delta > 0)
    return (
      <span className="inline-flex items-center gap-1 text-emerald-500">
        <ArrowUpRight className="h-3.5 w-3.5" /> +{delta}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-red-500">
      <ArrowDownRight className="h-3.5 w-3.5" /> {delta}
    </span>
  );
}

/* ---------- Google Maps loader (shared with LocationPicker) --------- */
const MAPS_KEY = import.meta.env
  .VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;

let mapsPromise: Promise<void> | null = null;
function loadMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).google?.maps?.importLibrary) return Promise.resolve();
  if (mapsPromise) return mapsPromise;
  if (!MAPS_KEY) return Promise.reject(new Error("Google Maps key missing"));
  mapsPromise = new Promise<void>((resolve, reject) => {
    (window as any).__initMapsGmb = () => resolve();
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&v=weekly&callback=__initMapsGmb&loading=async`;
    s.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(s);
  });
  return mapsPromise;
}

/* ---------- HEAT MAP -------------------------------------------------- */
function HeatMap({ keyword }: { keyword: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grid = useMemo(() => buildGrid(keyword), [keyword]);

  useEffect(() => {
    let cancelled = false;
    loadMaps()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const g = (window as any).google;
        mapRef.current = new g.maps.Map(containerRef.current, {
          center: BUSINESS,
          zoom: 12,
          disableDefaultUI: true,
          zoomControl: true,
          styles: DARK_MAP_STYLE,
          backgroundColor: "#0b1220",
        });
        setReady(true);
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const g = (window as any).google;
    // clear old markers
    overlaysRef.current.forEach((m) => m.setMap(null));
    overlaysRef.current = [];
    for (const cell of grid) {
      const color = rankColor(cell.rank);
      const circle = new g.maps.Circle({
        strokeColor: color,
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: color,
        fillOpacity: 0.35,
        map: mapRef.current,
        center: { lat: cell.lat, lng: cell.lng },
        radius: 550,
      });
      overlaysRef.current.push(circle);

      const label = new g.maps.Marker({
        position: { lat: cell.lat, lng: cell.lng },
        map: mapRef.current,
        label: {
          text: String(cell.rank),
          color: "#ffffff",
          fontWeight: "700",
          fontSize: "12px",
        },
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 0,
        },
      });
      overlaysRef.current.push(label);
    }
    // Business marker
    const biz = new g.maps.Marker({
      position: BUSINESS,
      map: mapRef.current,
      title: BUSINESS.name,
      icon: {
        path: g.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: "#3b82f6",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2,
      },
    });
    overlaysRef.current.push(biz);
  }, [ready, grid]);

  return (
    <div className="relative h-[520px] w-full overflow-hidden rounded-2xl border border-border">
      <div ref={containerRef} className="absolute inset-0" />
      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-card/80 text-sm text-muted-foreground">
          Loading map…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-card/90 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}

const DARK_MAP_STYLE: any[] = [
  { elementType: "geometry", stylers: [{ color: "#0b1220" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0b1220" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d1d5db" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#1f2937" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6b7280" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0f2540" }],
  },
  {
    featureType: "poi",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
];

/* ---------- PAGE ---------------------------------------------------- */
function GmbAnalyticsPage() {
  const [keyword, setKeyword] = useState(MOCK_KEYWORDS[0].keyword);
  const [search, setSearch] = useState("");
  const [gmb, setGmb] = useState(() => readGmbConnection());
  const [connectBusy, setConnectBusy] = useState(false);
  const [competitors, setCompetitors] = useState<Array<{ id: string; name: string; gbp_url: string; place_id: string | null }>>([]);
  const fetchCompetitors = useServerFn(listCompetitors);
  const fetchCompetitorRanks = useServerFn(getCompetitorRanks);
  const fetchMetrics = useServerFn(getGmbMetrics);
  const fetchGmbStatus = useServerFn(getGmbConnectionStatus);

  type Metrics = Awaited<ReturnType<typeof getGmbMetrics>>;
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [metricsErr, setMetricsErr] = useState<string | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  // Live competitor rank lookup state.
  const [rankSource, setRankSource] = useState<"serpapi" | "dataforseo" | "local_falcon" | null>(null);
  const [rankData, setRankData] = useState<Record<string, Record<string, number | null>>>({});
  const [rankErr, setRankErr] = useState<string | null>(null);
  const [rankLoading, setRankLoading] = useState(false);

  useEffect(() => {
    fetchCompetitors()
      .then((rows) => setCompetitors(rows as Array<{ id: string; name: string; gbp_url: string; place_id: string | null }>))
      .catch(() => setCompetitors([]));
  }, [fetchCompetitors]);

  useEffect(() => {
    if (competitors.length === 0) {
      setRankData({});
      setRankErr(null);
      setRankSource(null);
      return;
    }
    setRankLoading(true);
    setRankErr(null);
    fetchCompetitorRanks({
      data: {
        keywords: MOCK_KEYWORDS.map((k) => ({
          keyword: k.keyword,
          city: k.city,
          userRank: k.current,
        })),
        competitors: competitors.map((c) => ({
          id: c.id,
          name: c.name,
          gbpUrl: c.gbp_url,
          placeId: c.place_id,
        })),
      },
    })
      .then((res) => {
        setRankSource(res.source);
        setRankData(res.results);
        setRankErr(res.error);
      })
      .catch((e) => setRankErr(e instanceof Error ? e.message : "Failed"))
      .finally(() => setRankLoading(false));
  }, [competitors, fetchCompetitorRanks]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const s = await fetchGmbStatus();
        if (!s.connected || !s.locationName) {
          if (!cancelled) {
            setMetrics(null);
            setMetricsErr(null);
          }
          return;
        }
        setLoadingMetrics(true);
        setMetricsErr(null);
        const m = await fetchMetrics();
        if (!cancelled) setMetrics(m);
      } catch (e) {
        if (!cancelled) setMetricsErr(e instanceof Error ? e.message : "Failed to load GMB metrics");
      } finally {
        if (!cancelled) setLoadingMetrics(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [fetchGmbStatus, fetchMetrics, gmb.connected]);

  useEffect(() => {
    const sync = () => setGmb(readGmbConnection());
    sync();
    window.addEventListener("gmb-connection-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("gmb-connection-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  async function handleConnect() {
    setConnectBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 600));
      writeGmbConnection({
        connected: true,
        accountName: "Pearl Home Cleaning",
        locationName: "Downtown Dubai",
        connectedAt: new Date().toISOString(),
      });
      toast.success(gmb.connected ? "Reconnected" : "Connected");
    } finally {
      setConnectBusy(false);
    }
  }
  function handleDisconnect() {
    writeGmbConnection({ connected: false });
    toast.message("Disconnected");
  }

  const summary = useMemo(() => {
    const improved = MOCK_KEYWORDS.filter((k) => k.previous > k.current).length;
    const declined = MOCK_KEYWORDS.filter((k) => k.previous < k.current).length;
    const top3 = MOCK_KEYWORDS.filter((k) => k.current <= 3).length;
    const avg =
      MOCK_KEYWORDS.reduce((s, k) => s + k.current, 0) / MOCK_KEYWORDS.length;
    return { improved, declined, top3, avg: avg.toFixed(1) };
  }, []);

  const activeGrid = useMemo(() => buildGrid(keyword, 0), [keyword]);
  const previousGrid = useMemo(() => buildGrid(keyword, 1), [keyword]);
  const gridStats = useMemo(() => {
    const ranks = activeGrid.map((c) => c.rank);
    const prevRanks = previousGrid.map((c) => c.rank);
    const top3 = ranks.filter((r) => r <= 3).length;
    const prevTop3 = prevRanks.filter((r) => r <= 3).length;
    const avg = ranks.reduce((a, b) => a + b, 0) / ranks.length;
    const prevAvg = prevRanks.reduce((a, b) => a + b, 0) / prevRanks.length;
    const share = Math.round((top3 / ranks.length) * 100);
    return {
      top3,
      avg: avg.toFixed(1),
      share,
      top3Delta: top3 - prevTop3,
      avgDelta: +(prevAvg - avg).toFixed(1), // positive = improved (lower avg rank)
    };
  }, [activeGrid, previousGrid]);

  // AI change suggestions
  const suggest = useServerFn(generateChangeSuggestions);
  type Suggestion = {
    title: string;
    priority: "high" | "medium" | "low";
    why: string;
    how: string;
    targetKeyword: string | null;
  };
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [loadingSug, setLoadingSug] = useState(false);
  async function runSuggestions() {
    setLoadingSug(true);
    try {
      const res = await suggest({
        data: {
          businessName: BUSINESS.name,
          rankings: MOCK_KEYWORDS.map((k) => ({
            keyword: k.keyword,
            current: k.current,
            previous: k.previous,
            volume: k.volume,
            city: k.city,
          })),
        },
      });
      setSuggestions(res.suggestions ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoadingSug(false);
    }
  }

  const filteredKw = search.trim()
    ? MOCK_KEYWORDS.filter((k) =>
        k.keyword.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : MOCK_KEYWORDS;

  return (
    <div
      className="w-full py-6 pl-6 md:py-10 md:pl-10"
      style={{ paddingRight: 50 }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">GMB Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live rank tracking + geo-grid visibility for your Google Business
            Profile.
          </p>
        </div>
        {gmb.connected ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs uppercase tracking-widest text-emerald-500">
            <CheckCircle2 className="h-3 w-3" /> Live · connected
          </span>
        ) : (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs uppercase tracking-widest text-amber-500">
            Preview · sample data
          </span>
        )}
      </div>

      {/* GMB Connector */}
      <div className="mt-6 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${gmb.connected ? "bg-emerald-500/15 text-emerald-500" : "bg-primary/15 text-primary"}`}>
            {gmb.connected ? <CheckCircle2 className="h-6 w-6" /> : <Plug className="h-6 w-6" />}
          </div>
          <div className="flex-1 min-w-[220px]">
            <div className="flex items-center gap-2">
              <div className="font-semibold">Google Business Profile</div>
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
            <div className="mt-1 text-sm text-muted-foreground">
              {gmb.connected
                ? `${gmb.accountName} · ${gmb.locationName}${gmb.connectedAt ? ` · since ${new Date(gmb.connectedAt).toLocaleDateString()}` : ""}`
                : "Connect your GMB account to pull live views, calls, reviews, and rankings."}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/settings/integrations"
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
            >
              Manage
            </Link>
            {gmb.connected ? (
              <>
                <button
                  onClick={handleConnect}
                  disabled={connectBusy}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
                >
                  {connectBusy ? "Reconnecting…" : "Reconnect"}
                </button>
                <button
                  onClick={handleDisconnect}
                  className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive hover:bg-destructive/20"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={handleConnect}
                disabled={connectBusy}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <Plug className="h-4 w-4" />
                {connectBusy ? "Connecting…" : "Connect GMB"}
              </button>
            )}
          </div>
        </div>
        {!gmb.connected && (
          <div className="mt-3 text-xs text-muted-foreground">
            Metrics below are sample data until GMB is connected. Live insights
            require a Google Cloud OAuth client with the Business Profile API enabled.
          </div>
        )}
      </div>



      {/* Business card */}
      <div className="mt-6 rounded-2xl border border-border bg-gradient-to-br from-card to-card/50 p-5">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <MapPin className="h-7 w-7" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="text-sm text-muted-foreground">
              {metrics ? "Live · Business Profile Performance API" : "Connected profile (sample)"}
            </div>
            <div className="text-lg font-semibold">
              {metrics?.locationTitle ?? BUSINESS.name}
            </div>
            <div className="text-xs text-muted-foreground">
              {metrics
                ? `Last 30 days · ${metrics.range.start} → ${metrics.range.end}`
                : "Dubai, UAE · Cleaning services"}
            </div>
          </div>
          {loadingMetrics ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading live metrics…
            </div>
          ) : metrics ? (
            <>
              <MiniStat
                icon={<Eye className="h-4 w-4" />}
                label="Impressions (30d)"
                value={metrics.totals.impressions.toLocaleString()}
                tone={metrics.deltas.impressions >= 0 ? "good" : "bad"}
              />
              <MiniStat
                icon={<Phone className="h-4 w-4" />}
                label="Calls (30d)"
                value={metrics.totals.callClicks.toLocaleString()}
                tone={metrics.deltas.callClicks >= 0 ? "good" : "bad"}
              />
              <MiniStat
                icon={<TrendingUp className="h-4 w-4" />}
                label="Website clicks"
                value={metrics.totals.websiteClicks.toLocaleString()}
                tone={metrics.deltas.websiteClicks >= 0 ? "good" : "bad"}
              />
              <MiniStat
                icon={<MapPin className="h-4 w-4" />}
                label="Direction requests"
                value={metrics.totals.directionRequests.toLocaleString()}
                tone={metrics.deltas.directionRequests >= 0 ? "good" : "bad"}
              />
            </>
          ) : (
            <>
              <MiniStat icon={<Star className="h-4 w-4" />} label="Rating" value="4.9" tone="good" />
              <MiniStat icon={<Eye className="h-4 w-4" />} label="Views (30d)" value="12,480" />
              <MiniStat icon={<Phone className="h-4 w-4" />} label="Calls (30d)" value="386" />
              <MiniStat icon={<TrendingUp className="h-4 w-4" />} label="Trend" value="+18%" tone="good" />
            </>
          )}
        </div>
        {metricsErr && (
          <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Live metrics unavailable: {metricsErr}
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tracked keywords" value={MOCK_KEYWORDS.length} />
        <StatCard label="Average rank" value={summary.avg} />
        <StatCard label="In top 3" value={summary.top3} tone="good" />
        <StatCard
          label="Improved / Declined"
          value={`${summary.improved} / ${summary.declined}`}
        />
      </div>

      {/* Heat map + keyword filter */}
      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Local visibility heat map</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Geo-grid ranks across a 7×7 grid centered on your business.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none"
            >
              {MOCK_KEYWORDS.map((k) => (
                <option key={k.keyword} value={k.keyword}>
                  {k.keyword}
                </option>
              ))}
            </select>
            <div className="flex gap-3 text-xs">
              <LegendSwatch color={rankColor(1)} label="1–3" />
              <LegendSwatch color={rankColor(5)} label="4–10" />
              <LegendSwatch color={rankColor(15)} label="11+" />
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          <HeatMap keyword={keyword} />
          <div className="space-y-3">
            <StatCard
              label="Cells in top 3"
              value={`${gridStats.top3}/49`}
              tone="good"
              delta={gridStats.top3Delta}
              deltaLabel="vs last week"
            />
            <StatCard
              label="Avg. rank in grid"
              value={gridStats.avg}
              delta={gridStats.avgDelta}
              deltaLabel="vs last week"
              deltaInvert
            />
            <StatCard label="Local visibility share" value={`${gridStats.share}%`} />
            <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
              <div className="mb-1 flex items-center gap-1 font-medium text-foreground">
                <Info className="h-3.5 w-3.5 text-primary" /> How to read this
              </div>
              Each circle is a ranking probe at that lat/lng for the selected
              keyword. Green = top 3, amber = 4–10, red = off page 1. The blue
              dot is your business location. Deltas compare this week's grid to
              last week's snapshot.
            </div>
          </div>
        </div>
      </section>

      {/* AI Change Suggestions */}
      <section className="mt-10 rounded-2xl border border-border bg-gradient-to-br from-primary/5 to-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Lightbulb className="h-5 w-5 text-primary" /> AI Change
              Suggestions
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Prioritized actions based on your rankings and recent post
              activity.
            </p>
          </div>
          <button
            onClick={runSuggestions}
            disabled={loadingSug}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loadingSug ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {suggestions ? "Regenerate" : "Generate suggestions"}
          </button>
        </div>
        {suggestions && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {suggestions.length === 0 ? (
              <div className="col-span-full rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No suggestions returned. Try again.
              </div>
            ) : (
              suggestions.map((s, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium">{s.title}</div>
                    <PriorityBadge priority={s.priority} />
                  </div>
                  {s.targetKeyword && (
                    <div className="mt-1 text-[11px] uppercase tracking-widest text-primary">
                      → {s.targetKeyword}
                    </div>
                  )}
                  <div className="mt-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Why:</span>{" "}
                    {s.why}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">How:</span>{" "}
                    {s.how}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      {/* Keyword table */}
      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Keyword rank tracking</h2>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter keywords"
              className="w-56 bg-transparent text-sm outline-none"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-card text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Keyword</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Volume</th>
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Trend</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filteredKw.map((k) => (
                <tr
                  key={k.keyword}
                  className={`border-t border-border transition ${
                    k.keyword === keyword ? "bg-primary/5" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-medium">{k.keyword}</td>
                  <td className="px-4 py-3 text-muted-foreground">{k.city}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {k.volume.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={{
                        backgroundColor: `${rankColor(k.current)}22`,
                        color: rankColor(k.current),
                      }}
                    >
                      #{k.current}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <TrendCell current={k.current} previous={k.previous} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setKeyword(k.keyword)}
                      className="text-xs text-primary hover:underline"
                    >
                      View heat map →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Competitor rank comparison */}
      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Competitor rank comparison</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your rank vs. tracked competitor GBPs per keyword.
            </p>
          </div>
          <Link
            to="/competitors"
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
          >
            Manage competitors
          </Link>
        </div>

        {competitors.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No competitors tracked yet.{" "}
            <Link to="/competitors" className="text-primary hover:underline">
              Add competitor GBP URLs →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-card text-left text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Keyword</th>
                  <th className="px-4 py-3">You</th>
                  {competitors.map((c) => (
                    <th key={c.id} className="px-4 py-3">
                      <div className="max-w-[140px] truncate" title={c.name}>{c.name}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MOCK_KEYWORDS.map((k) => (
                  <tr key={k.keyword} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{k.keyword}</td>
                    <td className="px-4 py-3">
                      <RankPill rank={k.current} />
                    </td>
                    {competitors.map((c) => {
                      const r = rankData[k.keyword]?.[c.id] ?? null;
                      const delta = r != null ? r - k.current : null;
                      return (
                        <td key={c.id} className="px-4 py-3">
                          {r == null ? (
                            <span className="text-xs text-muted-foreground">
                              {rankLoading ? "…" : "—"}
                            </span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <RankPill rank={r} />
                              <span
                                className={`text-[11px] ${
                                  (delta ?? 0) > 0
                                    ? "text-emerald-500"
                                    : (delta ?? 0) < 0
                                      ? "text-destructive"
                                      : "text-muted-foreground"
                                }`}
                              >
                                {delta! > 0
                                  ? `+${delta}`
                                  : delta === 0
                                    ? "="
                                    : delta}
                              </span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-border bg-card/40 px-4 py-2 text-[11px] text-muted-foreground">
              {rankSource ? (
                <>
                  Live ranks via{" "}
                  <span className="font-medium text-foreground">
                    {rankSource === "serpapi"
                      ? "SerpApi"
                      : rankSource === "dataforseo"
                        ? "DataForSEO"
                        : "Local Falcon"}
                  </span>
                  . Positive delta means the competitor ranks worse than you.
                  {rankErr && (
                    <span className="ml-2 text-destructive">• {rankErr}</span>
                  )}
                </>
              ) : (
                <>
                  {rankErr ??
                    "Connect a rank source in Settings → Integrations to enable live competitor ranks."}
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Competitor rank history chart */}
      {competitors.length > 0 && (
        <CompetitorRankHistory
          keywords={MOCK_KEYWORDS.map((k) => ({ keyword: k.keyword, current: k.current }))}
          competitors={competitors}
          rankSource={rankSource}
        />
      )}



      <div className="mt-6 flex items-start gap-2 rounded-lg border border-border bg-card/50 p-4 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div>
          Rank data shown is sample. Connect Google Business Profile + a rank
          source (Local Falcon, DataForSEO, or SerpApi) to stream live grid
          rankings, review velocity, and profile insights into this dashboard.
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  delta,
  deltaLabel,
  deltaInvert,
}: {
  label: string;
  value: string | number;
  tone?: "good";
  delta?: number;
  deltaLabel?: string;
  deltaInvert?: boolean;
}) {
  const showDelta = typeof delta === "number" && delta !== 0;
  const positive = deltaInvert ? (delta ?? 0) > 0 : (delta ?? 0) > 0;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-2 text-2xl font-semibold ${tone === "good" ? "text-emerald-500" : ""}`}
      >
        {value}
      </div>
      {showDelta && (
        <div
          className={`mt-1 inline-flex items-center gap-1 text-xs ${
            positive ? "text-emerald-500" : "text-red-500"
          }`}
        >
          {positive ? (
            <ArrowUpRight className="h-3 w-3" />
          ) : (
            <ArrowDownRight className="h-3 w-3" />
          )}
          {delta! > 0 ? "+" : ""}
          {delta}
          {deltaLabel ? ` ${deltaLabel}` : ""}
        </div>
      )}
    </div>
  );
}

function PriorityBadge({
  priority,
}: {
  priority: "high" | "medium" | "low";
}) {
  const map = {
    high: "bg-red-500/15 text-red-500 border-red-500/30",
    medium: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    low: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  } as const;
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${map[priority] ?? map.low}`}
    >
      {priority}
    </span>
  );
}

function MiniStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="min-w-[110px] rounded-lg border border-border bg-background/40 px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={`mt-0.5 text-lg font-semibold ${
          tone === "good" ? "text-emerald-500" : tone === "bad" ? "text-destructive" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-3 rounded-sm"
        style={{ backgroundColor: color }}
      />
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}


function RankPill({ rank }: { rank: number }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: `${rankColor(rank)}22`, color: rankColor(rank) }}
    >
      #{rank}
    </span>
  );
}


type CompetitorLite = { id: string; name: string; gbp_url: string; place_id: string | null };

const HISTORY_COLORS = ["#3b82f6", "#f97316", "#a855f7", "#ec4899", "#14b8a6", "#eab308", "#f43f5e"];

function CompetitorRankHistory({
  keywords,
  competitors,
  rankSource,
}: {
  keywords: Array<{ keyword: string; current: number }>;
  competitors: CompetitorLite[];
  rankSource: "serpapi" | "dataforseo" | "local_falcon" | null;
}) {
  const [selected, setSelected] = useState<string>(keywords[0]?.keyword ?? "");
  const [rows, setRows] = useState<
    Array<{ competitorId: string | null; rank: number | null; recordedAt: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fetchHistory = useServerFn(getCompetitorRankHistory);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setErr(null);
    fetchHistory({ data: { keyword: selected, days: 30 } })
      .then((r) => setRows(r))
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, [selected, fetchHistory, competitors.length, rankSource]);

  const currentUserRank = keywords.find((k) => k.keyword === selected)?.current ?? null;

  // Group rows into buckets keyed by day (YYYY-MM-DD), value per series.
  const chartData = useMemo(() => {
    const byDay = new Map<string, Record<string, number | null>>();
    for (const r of rows) {
      const day = r.recordedAt.slice(0, 10);
      const bucket = byDay.get(day) ?? {};
      const key = r.competitorId ?? "you";
      // last value of the day wins
      bucket[key] = r.rank;
      byDay.set(day, bucket);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, vals]) => ({ day, ...vals }));
  }, [rows]);

  // Latest resolved values (from history) for delta summary.
  const latestByCompetitor = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const r of rows) {
      if (r.rank == null) continue;
      const key = r.competitorId ?? "you";
      out[key] = r.rank;
    }
    return out;
  }, [rows]);

  const hasData = chartData.length > 0;

  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Rank history</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your rank vs. tracked competitors over the last 30 days
            {rankSource ? (
              <>
                {" "}
                • source:{" "}
                <span className="font-medium text-foreground">
                  {rankSource === "serpapi"
                    ? "SerpApi"
                    : rankSource === "dataforseo"
                      ? "DataForSEO"
                      : "Local Falcon"}
                </span>
              </>
            ) : null}
            .
          </p>
        </div>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
        >
          {keywords.map((k) => (
            <option key={k.keyword} value={k.keyword}>
              {k.keyword}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        {loading ? (
          <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading history…
          </div>
        ) : err ? (
          <div className="flex h-72 items-center justify-center text-sm text-destructive">
            {err}
          </div>
        ) : !hasData ? (
          <div className="flex h-72 items-center justify-center text-center text-sm text-muted-foreground">
            No history yet. Once a rank source is connected, snapshots are
            recorded each time the dashboard loads competitor ranks.
          </div>
        ) : (
          <RankHistoryChart
            data={chartData}
            competitors={competitors}
          />
        )}

        {hasData && (
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: "#22c55e" }}
              />
              <span className="text-muted-foreground">You</span>
              {currentUserRank != null && (
                <span className="font-medium text-foreground">#{currentUserRank}</span>
              )}
            </span>
            {competitors.map((c, i) => {
              const latest = latestByCompetitor[c.id] ?? null;
              const delta =
                latest != null && currentUserRank != null ? latest - currentUserRank : null;
              return (
                <span key={c.id} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: HISTORY_COLORS[i % HISTORY_COLORS.length] }}
                  />
                  <span className="max-w-[140px] truncate text-muted-foreground" title={c.name}>
                    {c.name}
                  </span>
                  {latest != null && (
                    <span className="font-medium text-foreground">#{latest}</span>
                  )}
                  {delta != null && (
                    <span
                      className={
                        delta > 0
                          ? "text-emerald-500"
                          : delta < 0
                            ? "text-destructive"
                            : "text-muted-foreground"
                      }
                    >
                      {delta > 0 ? `+${delta}` : delta === 0 ? "=" : delta}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function RankHistoryChart({
  data,
  competitors,
}: {
  data: Array<Record<string, string | number | null>>;
  competitors: CompetitorLite[];
}) {
  // Lazy import so recharts doesn't bloat the initial route bundle unnecessarily.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
  } = require("recharts");
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} />
          <YAxis
            reversed
            allowDecimals={false}
            domain={[1, "auto"]}
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            label={{
              value: "Rank",
              angle: -90,
              position: "insideLeft",
              style: { fill: "hsl(var(--muted-foreground))", fontSize: 11 },
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Line
            type="monotone"
            dataKey="you"
            name="You"
            stroke="#22c55e"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
          {competitors.map((c, i) => (
            <Line
              key={c.id}
              type="monotone"
              dataKey={c.id}
              name={c.name}
              stroke={HISTORY_COLORS[i % HISTORY_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

