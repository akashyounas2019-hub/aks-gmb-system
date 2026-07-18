import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, FileSpreadsheet, Calendar as CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/social/facebook/ghl-export")({
  component: GhlExportPage,
});

type PostRow = {
  id: string;
  caption: string | null;
  scheduled_at: string | null;
  status: string | null;
  image_ids: string[] | null;
  ghl_location_id: string | null;
  created_at: string;
};

type ImageRow = { id: string; storage_path: string };

function csvEscape(v: string): string {
  if (v == null) return "";
  const needs = /[",\n\r]/.test(v);
  const s = v.replace(/"/g, '""');
  return needs ? `"${s}"` : s;
}

function formatDate(iso: string | null, part: "date" | "time"): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  if (part === "date") return d.toISOString().slice(0, 10);
  return d.toISOString().slice(11, 16);
}

function GhlExportPage() {
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [images, setImages] = useState<Record<string, ImageRow>>({});
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [status, setStatus] = useState<"all" | "scheduled" | "draft" | "posted">("scheduled");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    let q = supabase.from("social_posts").select("id, caption, scheduled_at, status, image_ids, ghl_location_id, created_at").order("scheduled_at", { ascending: true, nullsFirst: false });
    if (status !== "all") q = q.eq("status", status);
    if (from) q = q.gte("scheduled_at", new Date(from).toISOString());
    if (to) q = q.lte("scheduled_at", new Date(to + "T23:59:59").toISOString());
    const { data, error } = await q.limit(500);
    if (error) { toast.error(error.message); setLoading(false); return; }
    const rows = (data ?? []) as PostRow[];
    setPosts(rows);
    const ids = [...new Set(rows.flatMap((r) => r.image_ids ?? []))];
    if (ids.length) {
      const { data: imgs } = await supabase.from("images").select("id, storage_path").in("id", ids);
      const map: Record<string, ImageRow> = {};
      for (const im of imgs ?? []) map[im.id] = im as ImageRow;
      setImages(map);
    } else {
      setImages({});
    }
    setLoading(false);
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status, from, to]);

  const toggle = (id: string) => setSelected((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const toggleAll = () => {
    if (selected.size === posts.length) setSelected(new Set());
    else setSelected(new Set(posts.map((p) => p.id)));
  };

  async function signUrlsFor(paths: string[]): Promise<Record<string, string>> {
    if (!paths.length) return {};
    const { data, error } = await supabase.storage.from("frames").createSignedUrls(paths, 60 * 60 * 24 * 7);
    if (error) throw error;
    const map: Record<string, string> = {};
    for (const s of data ?? []) if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
    return map;
  }

  async function exportCsv() {
    const rows = posts.filter((p) => selected.size === 0 || selected.has(p.id));
    if (!rows.length) { toast.error("Nothing to export"); return; }
    setExporting(true);
    try {
      const allPaths = [...new Set(rows.flatMap((r) => (r.image_ids ?? []).map((id) => images[id]?.storage_path).filter(Boolean) as string[]))];
      const signed = await signUrlsFor(allPaths);

      const header = ["date", "time", "caption", "image_url_1", "image_url_2", "image_url_3", "ghl_location_id", "status"];
      const lines = [header.join(",")];
      for (const r of rows) {
        const urls = (r.image_ids ?? []).map((id) => images[id]?.storage_path).map((p) => (p ? signed[p] ?? "" : "")).slice(0, 3);
        while (urls.length < 3) urls.push("");
        lines.push([
          formatDate(r.scheduled_at, "date"),
          formatDate(r.scheduled_at, "time"),
          csvEscape(r.caption ?? ""),
          csvEscape(urls[0]),
          csvEscape(urls[1]),
          csvEscape(urls[2]),
          csvEscape(r.ghl_location_id ?? ""),
          csvEscape(r.status ?? ""),
        ].join(","));
      }
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ghl-facebook-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} post${rows.length === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const summary = useMemo(() => {
    const withImages = posts.filter((p) => (p.image_ids ?? []).length > 0).length;
    const withDate = posts.filter((p) => p.scheduled_at).length;
    return { total: posts.length, withImages, withDate };
  }, [posts]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
      <header className="mb-6">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Facebook / GHL Export</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">GoHighLevel CSV Export</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Export scheduled posts as a CSV with signed image URLs (valid 7 days) for GHL Social Planner bulk upload.
        </p>
      </header>

      <section className="mb-4 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-4">
        <label className="text-sm">
          <div className="mb-1 text-xs font-medium text-muted-foreground">Status</div>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="posted">Posted</option>
          </select>
        </label>
        <label className="text-sm">
          <div className="mb-1 text-xs font-medium text-muted-foreground">From</div>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <div className="mb-1 text-xs font-medium text-muted-foreground">To</div>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
        </label>
        <div className="flex items-end">
          <button
            onClick={exportCsv}
            disabled={exporting || posts.length === 0}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export CSV{selected.size > 0 ? ` (${selected.size})` : ""}
          </button>
        </div>
      </section>

      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><FileSpreadsheet className="h-3.5 w-3.5" /> {summary.total} posts</span>
        <span className="inline-flex items-center gap-1.5"><CalendarIcon className="h-3.5 w-3.5" /> {summary.withDate} scheduled</span>
        <span>· {summary.withImages} with images</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : posts.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
          No posts match these filters.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2"><input type="checkbox" checked={selected.size === posts.length && posts.length > 0} onChange={toggleAll} /></th>
                <th className="px-3 py-2">Scheduled</th>
                <th className="px-3 py-2">Caption</th>
                <th className="px-3 py-2">Images</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id} className="border-t border-border/60 hover:bg-accent/40">
                  <td className="px-3 py-2"><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} /></td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">
                    {p.scheduled_at ? new Date(p.scheduled_at).toLocaleString() : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="max-w-[420px] truncate px-3 py-2">{p.caption ?? <span className="text-muted-foreground">(no caption)</span>}</td>
                  <td className="px-3 py-2 tabular-nums">{p.image_ids?.length ?? 0}</td>
                  <td className="px-3 py-2"><span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase">{p.status ?? "draft"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
