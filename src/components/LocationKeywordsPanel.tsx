import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, MapPin, Plus, Search, Trash2 } from "lucide-react";
import {
  addLocationKeywords,
  deleteLocationKeyword,
  listLocationKeywords,
  type LocationKeyword,
} from "@/lib/location-keywords.functions";

/**
 * Keywords → "Location Keywords" tab. A flat list of areas the business
 * serves; the GMB post generator picks a random few of these for every post.
 */
export function LocationKeywordsPanel() {
  const list = useServerFn(listLocationKeywords);
  const add = useServerFn(addLocationKeywords);
  const remove = useServerFn(deleteLocationKeyword);

  const [items, setItems] = useState<LocationKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setItems(await list());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load location keywords");
    } finally {
      setLoading(false);
    }
  }, [list]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function submit() {
    const names = input
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    setAdding(true);
    try {
      const res = await add({ data: { names } });
      setInput("");
      if (res.added === 0) toast.info("Already in your list.");
      else toast.success(`Added ${res.added} location${res.added === 1 ? "" : "s"}.`);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add location");
    } finally {
      setAdding(false);
    }
  }

  async function del(item: LocationKeyword) {
    setDeletingId(item.id);
    try {
      await remove({ data: { id: item.id } });
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete location");
    } finally {
      setDeletingId(null);
    }
  }

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
  }, [items, filter]);

  return (
    <div className="w-full px-6 py-6 md:px-10 md:py-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <MapPin className="h-4 w-4 text-primary" /> Location keywords
            <span className="text-xs text-muted-foreground">({items.length})</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Areas you serve. Every generated GMB post mentions a random few of these.
          </p>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. Dubai Marina, JLT, Al Barsha (comma-separated)"
              aria-label="New location"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={adding || !input.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-sm font-medium">Your locations</div>
            {items.length > 8 && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter…"
                  className="w-48 rounded-md border border-border bg-background py-1.5 pl-7 pr-2 text-xs outline-none focus:border-primary"
                />
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : loadError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              {loadError}
            </div>
          ) : visible.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              {items.length === 0 ? "No locations yet — add your first one above." : "No match."}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {visible.map((item) => (
                <span
                  key={item.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 py-1 pl-3 pr-1 text-sm text-primary"
                >
                  <MapPin className="h-3 w-3" />
                  {item.name}
                  <button
                    type="button"
                    onClick={() => del(item)}
                    disabled={deletingId === item.id}
                    aria-label={`Delete ${item.name}`}
                    title="Delete"
                    className="rounded-full p-1 text-primary/70 hover:bg-destructive/15 hover:text-destructive disabled:opacity-50"
                  >
                    {deletingId === item.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
