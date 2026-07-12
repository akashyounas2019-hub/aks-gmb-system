import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Loader2, Pencil, Plus, Target, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  listCompetitors,
  addCompetitor,
  updateCompetitor,
  deleteCompetitor,
} from "@/lib/competitors.functions";

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

function CompetitorsPage() {
  const fetchAll = useServerFn(listCompetitors);
  const add = useServerFn(addCompetitor);
  const update = useServerFn(updateCompetitor);
  const remove = useServerFn(deleteCompetitor);

  const [rows, setRows] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Competitor | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

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
    await refresh();
    toast.message("Removed");
  }

  return (
    <div className="w-full py-6 pl-6 md:py-10 md:pl-10" style={{ paddingRight: 50 }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <h1 className="text-3xl">Competitors</h1>
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add competitor
        </button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Track competing Google Business Profiles. Their ranks appear next to
        yours in GMB Analytics and feed the change-suggestions engine.
      </p>

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
          <form onSubmit={submit} className="space-y-3">
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
              <span className="mt-1 block text-[11px] text-muted-foreground">
                Paste from Google Maps → Share → Copy link, or the profile's
                short link.
              </span>
            </label>
            <label className="block">
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
            <div className="flex items-center gap-2">
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

      <div className="mt-6 overflow-hidden rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-card text-left text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">GBP URL</th>
              <th className="px-4 py-3">Place ID</th>
              <th className="px-4 py-3">Added</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  No competitors yet. Add one to compare rankings.
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="font-medium">{c.name}</div>
                    {c.notes && (
                      <div className="text-xs text-muted-foreground">{c.notes}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={c.gbp_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex max-w-[280px] items-center gap-1 truncate text-primary hover:underline"
                    >
                      <span className="truncate">{c.gbp_url}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {c.place_id ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openEdit(c)}
                      className="mr-1 inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-accent"
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                    <button
                      onClick={() => onDelete(c)}
                      className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive hover:bg-destructive/20"
                    >
                      <Trash2 className="h-3 w-3" /> Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
