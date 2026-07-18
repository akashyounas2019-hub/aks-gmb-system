import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, Save, Trash2, Layers, Download, Maximize2, Grid3x3, Shuffle, Film } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SignedImage } from "@/components/SignedImage";

export const Route = createFileRoute("/_authenticated/social/facebook/collage/$id")({
  component: CollageCanvasPage,
});

type LayoutItem = { id: string; imageId: string; x: number; y: number; w: number; h: number; z: number };
type Layout = { w: number; h: number; bg: string; items: LayoutItem[] };
type Img = { id: string; storage_path: string; name: string | null };
type Collection = {
  id: string;
  name: string;
  image_ids: string[];
  layout: Layout | null;
};

const DEFAULT_LAYOUT: Layout = { w: 1080, h: 1080, bg: "#ffffff", items: [] };
const CANVAS_PRESETS: Array<{ label: string; w: number; h: number }> = [
  { label: "Square 1:1", w: 1080, h: 1080 },
  { label: "Portrait 4:5", w: 1080, h: 1350 },
  { label: "Story 9:16", w: 1080, h: 1920 },
  { label: "Landscape 16:9", w: 1920, h: 1080 },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function CollageCanvasPage() {
  const { id } = Route.useParams();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [images, setImages] = useState<Img[]>([]);
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: col, error } = await supabase
      .from("image_collections")
      .select("id, name, image_ids, layout")
      .eq("id", id)
      .maybeSingle();
    if (error || !col) {
      toast.error(error?.message ?? "Collection not found");
      setLoading(false);
      return;
    }
    const c = col as Collection;
    setCollection(c);
    setLayout({ ...DEFAULT_LAYOUT, ...(c.layout ?? {}) });
    if (c.image_ids.length) {
      const { data: imgs } = await supabase
        .from("images")
        .select("id, storage_path, name")
        .in("id", c.image_ids);
      setImages((imgs ?? []) as Img[]);
    } else {
      setImages([]);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  // Fit canvas to viewport
  useEffect(() => {
    function fit() {
      const el = canvasRef.current?.parentElement;
      if (!el) return;
      const pad = 40;
      const availW = el.clientWidth - pad;
      const availH = window.innerHeight - 260;
      setScale(Math.min(1, availW / layout.w, availH / layout.h));
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [layout.w, layout.h]);

  const imageMap = useMemo(() => {
    const m = new Map<string, Img>();
    images.forEach((i) => m.set(i.id, i));
    return m;
  }, [images]);

  const availableToAdd = useMemo(() => {
    const placed = new Set(layout.items.map((it) => it.imageId));
    return images.filter((i) => !placed.has(i.id));
  }, [images, layout.items]);

  function updateLayout(next: Layout | ((prev: Layout) => Layout)) {
    setLayout((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      setDirty(true);
      return value;
    });
  }

  function addImage(imageId: string) {
    const count = layout.items.length;
    const w = Math.round(layout.w * 0.4);
    const h = Math.round(layout.h * 0.4);
    const x = Math.round((layout.w - w) / 2 + (count % 5) * 24);
    const y = Math.round((layout.h - h) / 2 + (count % 5) * 24);
    const maxZ = layout.items.reduce((m, it) => Math.max(m, it.z), 0);
    const item: LayoutItem = { id: uid(), imageId, x, y, w, h, z: maxZ + 1 };
    updateLayout((prev) => ({ ...prev, items: [...prev.items, item] }));
    setSelectedItem(item.id);
  }

  function removeItem(itemId: string) {
    updateLayout((prev) => ({ ...prev, items: prev.items.filter((it) => it.id !== itemId) }));
    if (selectedItem === itemId) setSelectedItem(null);
  }

  function bringToFront(itemId: string) {
    updateLayout((prev) => {
      const maxZ = prev.items.reduce((m, it) => Math.max(m, it.z), 0);
      return { ...prev, items: prev.items.map((it) => (it.id === itemId ? { ...it, z: maxZ + 1 } : it)) };
    });
  }

  function updateItem(itemId: string, patch: Partial<LayoutItem>) {
    updateLayout((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
    }));
  }

  const startDrag = useCallback(
    (e: React.PointerEvent, itemId: string, mode: "move" | "nw" | "ne" | "sw" | "se") => {
      e.stopPropagation();
      e.preventDefault();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startY = e.clientY;
      const startItem = layout.items.find((it) => it.id === itemId);
      if (!startItem) return;
      const orig = { ...startItem };
      bringToFront(itemId);
      setSelectedItem(itemId);

      function onMove(ev: PointerEvent) {
        const dx = (ev.clientX - startX) / scale;
        const dy = (ev.clientY - startY) / scale;
        if (mode === "move") {
          updateItem(itemId, {
            x: Math.round(Math.max(-orig.w / 2, Math.min(layout.w - orig.w / 2, orig.x + dx))),
            y: Math.round(Math.max(-orig.h / 2, Math.min(layout.h - orig.h / 2, orig.y + dy))),
          });
          return;
        }
        let nx = orig.x, ny = orig.y, nw = orig.w, nh = orig.h;
        if (mode === "se") { nw = orig.w + dx; nh = orig.h + dy; }
        if (mode === "sw") { nx = orig.x + dx; nw = orig.w - dx; nh = orig.h + dy; }
        if (mode === "ne") { ny = orig.y + dy; nw = orig.w + dx; nh = orig.h - dy; }
        if (mode === "nw") { nx = orig.x + dx; ny = orig.y + dy; nw = orig.w - dx; nh = orig.h - dy; }
        const minSize = 40;
        if (nw < minSize) { if (mode.endsWith("w")) nx = orig.x + orig.w - minSize; nw = minSize; }
        if (nh < minSize) { if (mode.startsWith("n")) ny = orig.y + orig.h - minSize; nh = minSize; }
        updateItem(itemId, {
          x: Math.round(nx),
          y: Math.round(ny),
          w: Math.round(nw),
          h: Math.round(nh),
        });
      }
      function onUp() {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [layout, scale],
  );

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("image_collections")
      .update({ layout: layout as unknown as never })
      .eq("id", id);
    setSaving(false);
    if (error) return toast.error(error.message);
    setDirty(false);
    toast.success("Collage saved");
  }

  async function exportPng() {
    const canvas = document.createElement("canvas");
    canvas.width = layout.w;
    canvas.height = layout.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = layout.bg;
    ctx.fillRect(0, 0, layout.w, layout.h);
    const sorted = [...layout.items].sort((a, b) => a.z - b.z);
    for (const it of sorted) {
      const img = imageMap.get(it.imageId);
      if (!img) continue;
      const { data } = await supabase.storage.from("frames").createSignedUrl(img.storage_path, 300);
      if (!data?.signedUrl) continue;
      await new Promise<void>((resolve) => {
        const el = new Image();
        el.crossOrigin = "anonymous";
        el.onload = () => {
          ctx.save();
          // cover-fit
          const iw = el.naturalWidth, ih = el.naturalHeight;
          const ratio = Math.max(it.w / iw, it.h / ih);
          const dw = iw * ratio, dh = ih * ratio;
          const dx = it.x + (it.w - dw) / 2;
          const dy = it.y + (it.h - dh) / 2;
          ctx.beginPath();
          ctx.rect(it.x, it.y, it.w, it.h);
          ctx.clip();
          ctx.drawImage(el, dx, dy, dw, dh);
          ctx.restore();
          resolve();
        };
        el.onerror = () => resolve();
        el.src = data.signedUrl;
      });
    }
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${collection?.name ?? "collage"}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!collection) {
    return <div className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">Collection not found.</div>;
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <Link to="/social/facebook/collections" className="rounded-md border border-border p-1.5 hover:bg-accent" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Collage canvas</div>
            <h1 className="truncate text-lg font-semibold">{collection.name}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={`${layout.w}x${layout.h}`}
            onChange={(e) => {
              const preset = CANVAS_PRESETS.find((p) => `${p.w}x${p.h}` === e.target.value);
              if (preset) updateLayout((p) => ({ ...p, w: preset.w, h: preset.h }));
            }}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            {CANVAS_PRESETS.map((p) => (
              <option key={p.label} value={`${p.w}x${p.h}`}>{p.label}</option>
            ))}
            {!CANVAS_PRESETS.some((p) => p.w === layout.w && p.h === layout.h) && (
              <option value={`${layout.w}x${layout.h}`}>{layout.w}×{layout.h}</option>
            )}
          </select>
          <label className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-sm">
            <span className="text-xs text-muted-foreground">BG</span>
            <input
              type="color"
              value={layout.bg}
              onChange={(e) => updateLayout((p) => ({ ...p, bg: e.target.value }))}
              className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
            />
          </label>
          <button
            onClick={exportPng}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent"
          >
            <Download className="h-4 w-4" /> Export PNG
          </button>
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {dirty ? "Save" : "Saved"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-border bg-muted/20 p-3 md:block">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Images in set</div>
          {images.length === 0 ? (
            <p className="text-xs text-muted-foreground">Add images to this collection first.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {images.map((img) => {
                const placed = layout.items.some((it) => it.imageId === img.id);
                return (
                  <button
                    key={img.id}
                    onClick={() => addImage(img.id)}
                    className="group relative aspect-square overflow-hidden rounded-md border border-border bg-background transition hover:border-primary"
                    title={placed ? "Add another copy" : "Add to canvas"}
                  >
                    <SignedImage bucket="frames" path={img.storage_path} alt={img.name ?? ""} className="h-full w-full object-cover" />
                    <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/60 py-1 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100">
                      <Plus className="h-3 w-3" /> Add
                    </span>
                    {placed && (
                      <span className="absolute right-1 top-1 rounded bg-primary px-1 text-[9px] font-semibold text-primary-foreground">on canvas</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {availableToAdd.length === 0 && images.length > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">All images placed. Tap one to add another copy.</p>
          )}
        </aside>

        <main className="flex flex-1 items-center justify-center overflow-auto bg-muted/40 p-6">
          <div
            className="relative shadow-2xl"
            style={{ width: layout.w * scale, height: layout.h * scale }}
            onPointerDown={() => setSelectedItem(null)}
          >
            <div
              ref={canvasRef}
              className="absolute left-0 top-0 origin-top-left"
              style={{
                width: layout.w,
                height: layout.h,
                background: layout.bg,
                transform: `scale(${scale})`,
              }}
            >
              {layout.items
                .slice()
                .sort((a, b) => a.z - b.z)
                .map((it) => {
                  const img = imageMap.get(it.imageId);
                  const selected = selectedItem === it.id;
                  return (
                    <div
                      key={it.id}
                      onPointerDown={(e) => startDrag(e, it.id, "move")}
                      className={`absolute cursor-move select-none overflow-hidden ${selected ? "outline outline-2 outline-primary" : "outline outline-1 outline-black/10 hover:outline-primary/60"}`}
                      style={{ left: it.x, top: it.y, width: it.w, height: it.h, zIndex: it.z }}
                    >
                      {img ? (
                        <SignedImage bucket="frames" path={img.storage_path} alt={img.name ?? ""} className="pointer-events-none h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">missing</div>
                      )}
                      {selected && (
                        <>
                          {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                            <div
                              key={corner}
                              onPointerDown={(e) => startDrag(e, it.id, corner)}
                              className="absolute h-4 w-4 rounded-sm border border-primary bg-background shadow"
                              style={{
                                left: corner.endsWith("w") ? -8 : undefined,
                                right: corner.endsWith("e") ? -8 : undefined,
                                top: corner.startsWith("n") ? -8 : undefined,
                                bottom: corner.startsWith("s") ? -8 : undefined,
                                cursor: corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize",
                                transform: `scale(${1 / scale})`,
                                transformOrigin: `${corner.endsWith("w") ? "left" : "right"} ${corner.startsWith("n") ? "top" : "bottom"}`,
                              }}
                            />
                          ))}
                        </>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </main>

        <aside className="hidden w-64 shrink-0 overflow-y-auto border-l border-border bg-muted/20 p-3 lg:block">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <Layers className="h-3.5 w-3.5" /> Layers ({layout.items.length})
          </div>
          {layout.items.length === 0 ? (
            <p className="text-xs text-muted-foreground">Tap an image on the left to place it on the canvas.</p>
          ) : (
            <ul className="space-y-1">
              {layout.items
                .slice()
                .sort((a, b) => b.z - a.z)
                .map((it) => {
                  const img = imageMap.get(it.imageId);
                  const selected = selectedItem === it.id;
                  return (
                    <li key={it.id}>
                      <div
                        className={`flex items-center gap-2 rounded-md border p-1.5 text-xs ${selected ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-accent"}`}
                      >
                        <button
                          onClick={() => { setSelectedItem(it.id); bringToFront(it.id); }}
                          className="flex flex-1 items-center gap-2 truncate text-left"
                        >
                          <div className="h-8 w-8 shrink-0 overflow-hidden rounded border border-border bg-muted">
                            {img && <SignedImage bucket="frames" path={img.storage_path} alt="" className="h-full w-full object-cover" />}
                          </div>
                          <span className="truncate">{img?.name ?? "image"}</span>
                        </button>
                        <button
                          onClick={() => bringToFront(it.id)}
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                          title="Bring to front"
                        >
                          <Maximize2 className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => removeItem(it.id)}
                          className="rounded p-1 text-destructive hover:bg-destructive/10"
                          title="Remove"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </li>
                  );
                })}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
