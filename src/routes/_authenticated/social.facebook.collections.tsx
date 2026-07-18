import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FolderPlus, Loader2, Trash2, Pencil, ImageIcon, X, Check, LayoutGrid } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SignedImage } from "@/components/SignedImage";

export const Route = createFileRoute("/_authenticated/social/facebook/collections")({
  component: CollectionsPage,
});

type Collection = {
  id: string;
  name: string;
  description: string | null;
  thumb_image_id: string | null;
  image_ids: string[];
  updated_at: string;
};

type Img = { id: string; storage_path: string; name: string | null };

function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [images, setImages] = useState<Img[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<Collection | null>(null);

  async function load() {
    setLoading(true);
    const [c, i] = await Promise.all([
      supabase.from("image_collections").select("*").order("updated_at", { ascending: false }),
      supabase.from("images").select("id, storage_path, name").is("deleted_at", null).order("created_at", { ascending: false }).limit(500),
    ]);
    if (c.error) toast.error(c.error.message);
    if (i.error) toast.error(i.error.message);
    setCollections((c.data ?? []) as Collection[]);
    setImages((i.data ?? []) as Img[]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function createCollection() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setCreating(false); return; }
    const { error } = await supabase.from("image_collections").insert({
      owner_id: u.user.id,
      name,
      image_ids: [],
    });
    setCreating(false);
    if (error) { toast.error(error.message); return; }
    setNewName("");
    toast.success("Collection created");
    void load();
  }

  async function removeCollection(id: string) {
    if (!confirm("Delete this collection? Images are not affected.")) return;
    const { error } = await supabase.from("image_collections").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    void load();
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
      <header className="mb-6">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Facebook / Collections
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Image Collections</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Group images into reusable sets — e.g. "Kitchen ads", "AC promo assets".
        </p>
      </header>

      <section className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createCollection()}
          placeholder="New collection name…"
          className="min-w-[240px] flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={createCollection}
          disabled={creating || !newName.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
          Create
        </button>
      </section>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : collections.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border bg-muted/20 p-10 text-center">
          <ImageIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No collections yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((c) => {
            const thumbImg = images.find((i) => i.id === c.thumb_image_id) ?? images.find((i) => c.image_ids.includes(i.id));
            return (
              <div key={c.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <div className="aspect-video bg-muted">
                  {thumbImg ? (
                    <SignedImage bucket="frames" path={thumbImg.storage_path} alt={c.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground"><ImageIcon className="h-6 w-6" /></div>
                  )}
                </div>
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.image_ids.length} images</div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setEditing(c)} className="rounded-md border border-border p-1.5 hover:bg-accent" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => removeCollection(c.id)} className="rounded-md border border-border p-1.5 text-destructive hover:bg-destructive/10" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <EditCollectionDialog
          collection={editing}
          images={images}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
    </div>
  );
}

function EditCollectionDialog({
  collection, images, onClose, onSaved,
}: {
  collection: Collection;
  images: Img[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(collection.name);
  const [description, setDescription] = useState(collection.description ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set(collection.image_ids));
  const [thumb, setThumb] = useState<string | null>(collection.thumb_image_id);
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("image_collections").update({
      name: name.trim() || collection.name,
      description: description.trim() || null,
      image_ids: [...selected],
      thumb_image_id: thumb && selected.has(thumb) ? thumb : ([...selected][0] ?? null),
    }).eq("id", collection.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    onSaved();
  }

  const visible = useMemo(() => images, [images]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold">Edit collection</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 border-b border-border p-4">
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="Name" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="Description (optional)" />
          <div className="text-xs text-muted-foreground">{selected.size} selected · click an image to toggle · double-click to set as cover</div>
        </div>
        <div className="grid grid-cols-3 gap-2 overflow-y-auto p-4 sm:grid-cols-4 md:grid-cols-6">
          {visible.map((img) => {
            const on = selected.has(img.id);
            const isThumb = thumb === img.id;
            return (
              <button
                key={img.id}
                onClick={() => toggle(img.id)}
                onDoubleClick={() => { if (on) setThumb(img.id); }}
                className={`group relative aspect-square overflow-hidden rounded-md border-2 transition ${on ? "border-primary" : "border-transparent hover:border-border"}`}
              >
                <SignedImage bucket="frames" path={img.storage_path} alt={img.name ?? ""} className="h-full w-full object-cover" />
                {on && (
                  <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3 w-3" />
                  </span>
                )}
                {isThumb && (
                  <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">Cover</span>
                )}
              </button>
            );
          })}
          {visible.length === 0 && (
            <div className="col-span-full py-8 text-center text-sm text-muted-foreground">No images available yet.</div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent">Cancel</button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}
