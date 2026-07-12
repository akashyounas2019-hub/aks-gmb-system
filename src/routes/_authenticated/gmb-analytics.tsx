import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/_authenticated/gmb-analytics")({
  component: GmbAnalyticsPage,
});

// ---------- MOCK DATA ----------
// Replace with a server function calling Local Falcon / SerpApi / BrightLocal.
// See notes at the bottom of this file for the integration outline.
type KeywordRow = {
  keyword: string;
  current: number;
  previous: number;
  volume: number;
  city: string;
};

const MOCK_KEYWORDS: KeywordRow[] = [
  { keyword: "plumber near me", current: 3, previous: 7, volume: 2400, city: "Dubai Marina" },
  { keyword: "emergency plumber dubai", current: 5, previous: 4, volume: 880, city: "JLT" },
  { keyword: "gas leak repair", current: 12, previous: 18, volume: 320, city: "Business Bay" },
  { keyword: "water heater installation", current: 8, previous: 8, volume: 590, city: "Downtown" },
  { keyword: "24 hour plumber", current: 2, previous: 6, volume: 1300, city: "Marina" },
  { keyword: "blocked drain service", current: 14, previous: 11, volume: 720, city: "Deira" },
  { keyword: "leak detection dubai", current: 4, previous: 9, volume: 480, city: "Al Barsha" },
];

// 7x7 mock heat grid — value = rank (1 = best, 20 = worst).
const GRID_SIZE = 7;
const MOCK_GRID: number[][] = Array.from({ length: GRID_SIZE }, (_, r) =>
  Array.from({ length: GRID_SIZE }, (_, c) => {
    // center = better rank, edges = worse
    const dx = c - (GRID_SIZE - 1) / 2;
    const dy = r - (GRID_SIZE - 1) / 2;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return Math.max(1, Math.min(20, Math.round(dist * 2.5 + Math.random() * 3)));
  }),
);

function rankColor(rank: number): string {
  // 1-3 green, 4-10 amber, 11+ red
  if (rank <= 3) return "hsl(142 71% 45%)";
  if (rank <= 10) return "hsl(38 92% 50%)";
  return "hsl(0 72% 51%)";
}

function TrendCell({ current, previous }: { current: number; previous: number }) {
  const delta = previous - current; // positive = moved up
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

function GmbAnalyticsPage() {
  const [keyword, setKeyword] = useState(MOCK_KEYWORDS[0].keyword);

  const summary = useMemo(() => {
    const improved = MOCK_KEYWORDS.filter((k) => k.previous > k.current).length;
    const declined = MOCK_KEYWORDS.filter((k) => k.previous < k.current).length;
    const top3 = MOCK_KEYWORDS.filter((k) => k.current <= 3).length;
    const avg =
      MOCK_KEYWORDS.reduce((s, k) => s + k.current, 0) / MOCK_KEYWORDS.length;
    return { improved, declined, top3, avg: avg.toFixed(1) };
  }, []);

  return (
    <div className="p-6 md:p-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">GMB Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track Google Business rankings across your service area and visualize
            local visibility on a geo-grid heat map.
          </p>
        </div>
        <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs uppercase tracking-widest text-primary">
          Preview · mock data
        </span>
      </div>

      {/* Summary cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tracked keywords" value={MOCK_KEYWORDS.length} />
        <StatCard label="Average rank" value={summary.avg} />
        <StatCard label="In top 3" value={summary.top3} tone="good" />
        <StatCard
          label="Improved / Declined"
          value={`${summary.improved} / ${summary.declined}`}
        />
      </div>

      {/* Keyword table */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Keyword rank tracking</h2>
        <div className="mt-4 overflow-hidden rounded-xl border border-border">
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
              {MOCK_KEYWORDS.map((k) => (
                <tr key={k.keyword} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{k.keyword}</td>
                  <td className="px-4 py-3 text-muted-foreground">{k.city}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {k.volume.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs"
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

      {/* Heat map */}
      <section className="mt-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Local visibility heat map</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Geo-grid ranks for <span className="text-foreground">"{keyword}"</span>{" "}
              across a 7×7 grid centered on your business.
            </p>
          </div>
          <div className="flex gap-3 text-xs">
            <LegendSwatch color={rankColor(1)} label="1–3" />
            <LegendSwatch color={rankColor(5)} label="4–10" />
            <LegendSwatch color={rankColor(15)} label="11+" />
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-card p-6">
          <div
            className="mx-auto grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
              maxWidth: 520,
            }}
          >
            {MOCK_GRID.flat().map((rank, i) => (
              <div
                key={i}
                className="flex aspect-square items-center justify-center rounded-md text-sm font-semibold text-white shadow-sm"
                style={{ backgroundColor: rankColor(rank) }}
                title={`Rank #${rank}`}
              >
                {rank}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-card/50 p-4 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            Data shown is mock. To pull real ranks, connect a data source (see the
            integration notes in <code className="text-foreground">gmb-analytics.tsx</code>).
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "good";
}) {
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

/*
=================================================================
HEAT MAP INTEGRATION NOTES
=================================================================

Two layers to plug in:

1) RANK DATA SOURCE (pick one)
   - Local Falcon        https://www.localfalcon.com/api  (geo-grid native, cheapest for GBP)
   - SerpApi             https://serpapi.com/google-local-api  (per-point search)
   - BrightLocal         https://www.brightlocal.com/api/  (bundled GBP audit)
   - DataForSEO          https://dataforseo.com/apis  (SERP + local pack)

   Add the API key with the add_secret tool (e.g. LOCAL_FALCON_API_KEY),
   then wrap the call in a server function under
   src/lib/gmb.functions.ts using createServerFn + requireSupabaseAuth.
   Persist results in a `keyword_ranks` table (keyword, lat, lng, rank,
   checked_at) so history / trends are queryable.

2) MAP RENDERING (upgrade from the SVG grid above)
   Simplest → advanced:
   a) Keep the CSS grid — works for a fixed 5x5/7x7 audit.
   b) Leaflet + react-leaflet + leaflet.heat  → true street map with
      colored circle markers per grid point.
      bun add leaflet react-leaflet leaflet.heat
   c) Mapbox GL JS heat layer → smoother interpolation, needs a token.
      bun add mapbox-gl react-map-gl

   For (b), each grid point becomes a CircleMarker with radius/color
   derived from `rankColor(rank)`, centered on business lat/lng with
   an offset of ±(step * i) degrees.

3) SCHEDULING
   Use pg_cron + pg_net to hit a /api/public/hooks/refresh-ranks route
   daily; that route calls the chosen API and upserts new rows into
   keyword_ranks. Trend arrows come from comparing today's row with
   the previous run.
*/
