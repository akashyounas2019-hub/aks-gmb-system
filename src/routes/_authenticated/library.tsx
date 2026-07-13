import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  MapPin,
  Pencil,
  Tag as TagIcon,
  Trash2,
  CheckSquare,
  Square,
  X,
  Loader2,
  Sparkles,
  Film,
  Play,
  HardDrive,
  Images as ImagesIcon,
  CheckCircle2,
  UploadCloud,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Download,
  Folder as FolderIcon,
  FolderPlus,
} from "lucide-react";
import { readGps, embedGps } from "@/lib/exif-geotag";

import { supabase } from "@/integrations/supabase/client";
import { SignedImage } from "@/components/SignedImage";
import { GeoTaggedBadge } from "@/components/GeoTaggedBadge";
import { LocationPicker, type PickedLocation } from "@/components/LocationPicker";
import { autoTagImages } from "@/lib/image-tagging.functions";
import { UploadPanel } from "@/components/UploadPanel";

export const Route = createFileRoute("/_authenticated/library")({
  component: LibraryPage,
});

type LibraryTab = "upload" | "raw" | "published" | "geotagged" | "videos";


async function fetchLibrary() {
  const { data: images, error } = await supabase
    .from("images")
    .select("id, name, storage_path, sharpness_score, venue_id, lat, lng, title, description, folder_id, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const { data: venues } = await supabase.from("venues").select("id, name");
  const { data: tagRows } = await supabase
    .from("image_tags")
    .select("image_id, tag_id, tags(slug,label)");
  const { data: folders } = await supabase
    .from("image_folders")
    .select("id, name, created_at")
    .order("name", { ascending: true });

  const venueMap = new Map(venues?.map((v) => [v.id, v.name]) ?? []);
  const tagMap = new Map<string, { slug: string; label: string }[]>();
  for (const row of tagRows ?? []) {
    const t = (row as { tags?: { slug: string; label: string } }).tags;
    if (!t) continue;
    const arr = tagMap.get(row.image_id) ?? [];
    arr.push(t);
    tagMap.set(row.image_id, arr);
  }
  return { images: images ?? [], venueMap, tagMap, folders: folders ?? [] };
}


async function fetchKeywords() {
  const { data, error } = await supabase
    .from("keywords")
    .select("id, phrase, volume, cluster")
    .order("volume", { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) throw error;
  return data ?? [];
}

function LibraryPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["library"], queryFn: fetchLibrary });
  const [filter, setFilter] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPanel, setBulkPanel] = useState<null | "keywords" | "geotag">(null);
  const [autoTagging, setAutoTagging] = useState(false);
  const [tab, setTab] = useState<LibraryTab>("raw");
  const [editingId, setEditingId] = useState<string | null>(null);
  // null = "All raw" (folder chip); "__uncategorized" = images with no folder
  const [rawFolderId, setRawFolderId] = useState<string | null>(null);
  const autoTag = useServerFn(autoTagImages);


  async function runAutoTag() {
    if (selected.size === 0) return;
    setAutoTagging(true);
    try {
      const res = await autoTag({
        data: { imageIds: Array.from(selected), overwrite: false },
      });
      toast.success(
        `Auto-tagged ${res.tagged} image(s). Skipped ${res.skipped}, failed ${res.failed}.`,
      );
      qc.invalidateQueries({ queryKey: ["library"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Auto-tag failed");
    } finally {
      setAutoTagging(false);
    }
  }



  async function deleteImage(id: string, path: string) {
    if (!window.confirm("Delete this image? This cannot be undone.")) return;
    await supabase.storage.from("frames").remove([path]);
    const { error } = await supabase.from("images").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["library"] });
    }
  }

  async function downloadImage(img: {
    name: string;
    storage_path: string;
    lat: number | null;
    lng: number | null;
    title: string | null;
  }) {
    try {
      const { data: signed, error } = await supabase.storage
        .from("frames")
        .createSignedUrl(img.storage_path, 60 * 5);
      if (error || !signed?.signedUrl) throw new Error(error?.message ?? "Signed URL failed");
      const res = await fetch(signed.signedUrl);
      const blob = await res.blob();

      // Map MIME type -> canonical image extension. Falls back to sniffing the
      // storage path only if it already carries a real image extension.
      const mimeToExt: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
        "image/avif": "avif",
        "image/heic": "heic",
        "image/heif": "heif",
        "image/tiff": "tiff",
        "image/bmp": "bmp",
        "image/svg+xml": "svg",
      };
      const validExts = new Set(Object.values(mimeToExt));
      const pathExt = (img.storage_path.split(".").pop() || "").toLowerCase();
      const mime = (blob.type || "").toLowerCase();
      const inferredExt =
        mimeToExt[mime] ||
        (validExts.has(pathExt) ? pathExt : "jpg");
      const inferredMime =
        mime.startsWith("image/") ? mime : `image/${inferredExt === "jpg" ? "jpeg" : inferredExt}`;

      const source = new File(
        [blob],
        (img.name && /\.[a-z0-9]+$/i.test(img.name) ? img.name : `image.${inferredExt}`),
        { type: inferredMime },
      );
      const output =
        img.lat != null && img.lng != null
          ? await embedGps(source, Number(img.lat), Number(img.lng))
          : source;

      const rawBase = (img.title?.trim() || (img.name || "image").replace(/\.[^.]+$/, ""));
      const base =
        rawBase.replace(/[^\p{L}\p{N}\s._-]/gu, "").trim().replace(/\s+/g, "-") || "image";
      const outExtRaw = (output.name.split(".").pop() || "").toLowerCase();
      const outExt = validExts.has(outExtRaw) ? outExtRaw : inferredExt;
      const url = URL.createObjectURL(output);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${base}.${outExt}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed.");
    }
  }


  function imageBucket(img: { id: string; lat: number | null; lng: number | null }): "raw" | "published" | "geotagged" {
    // Published wins over geotagged so a geo-tagged image that gets published
    // shows up under "Published" (with its GPS still intact) instead of
    // silently staying in the geo-tagged tab.
    const tags = data?.tagMap.get(img.id) ?? [];
    if (tags.some((t) => t.slug === "published" || t.slug === "posted")) return "published";
    if (img.lat != null && img.lng != null) return "geotagged";
    return "raw";
  }



  const counts = useMemo(() => {
    const c: Record<"raw" | "published" | "geotagged", number> = { raw: 0, published: 0, geotagged: 0 };
    for (const i of data?.images ?? []) {
      c[imageBucket(i)]++;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);


  const filtered = useMemo(() => {
    if (!data || tab === "videos") return [];
    const q = filter.toLowerCase();
    return data.images.filter((i) => {
      if (imageBucket(i) !== tab) return false;
      // Folder scoping only applies to the Raw Images tab.
      if (tab === "raw") {
        if (rawFolderId === "__uncategorized" && i.folder_id != null) return false;
        if (rawFolderId && rawFolderId !== "__uncategorized" && i.folder_id !== rawFolderId) return false;
      }
      if (!q) return true;
      if (i.name.toLowerCase().includes(q)) return true;
      const venue = i.venue_id ? data.venueMap.get(i.venue_id) : undefined;
      if (venue?.toLowerCase().includes(q)) return true;
      const tags = data.tagMap.get(i.id);
      if (tags?.some((t) => t.slug.includes(q) || t.label.toLowerCase().includes(q)))
        return true;
      return false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filter, tab, rawFolderId]);

  // Folder CRUD -----------------------------------------------------------------
  async function createFolder() {
    const name = window.prompt("Folder name")?.trim();
    if (!name) return;
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return toast.error("Not signed in.");
    const { data: row, error } = await supabase
      .from("image_folders")
      .insert({ owner_id: userId, name } as never)
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    toast.success(`Created folder “${name}”.`);
    qc.invalidateQueries({ queryKey: ["library"] });
    if (row) setRawFolderId((row as { id: string }).id);
  }

  async function renameFolder(id: string, current: string) {
    const name = window.prompt("Rename folder", current)?.trim();
    if (!name || name === current) return;
    const { error } = await supabase
      .from("image_folders")
      .update({ name } as never)
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Folder renamed.");
    qc.invalidateQueries({ queryKey: ["library"] });
  }

  async function deleteFolder(id: string, name: string) {
    if (!window.confirm(`Delete folder “${name}”? Images inside stay in Raw Images.`)) return;
    const { error } = await supabase.from("image_folders").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Folder deleted.");
    if (rawFolderId === id) setRawFolderId(null);
    qc.invalidateQueries({ queryKey: ["library"] });
  }

  async function moveImagesToFolder(imageIds: string[], folderId: string | null) {
    if (imageIds.length === 0) return;
    const { error } = await supabase
      .from("images")
      .update({ folder_id: folderId } as never)
      .in("id", imageIds);
    if (error) return toast.error(error.message);
    toast.success(
      folderId
        ? `Moved ${imageIds.length} image${imageIds.length === 1 ? "" : "s"} to folder.`
        : `Removed ${imageIds.length} image${imageIds.length === 1 ? "" : "s"} from folder.`,
    );
    qc.invalidateQueries({ queryKey: ["library"] });
  }





  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(filtered.map((i) => i.id)));
  }
  function clearSelection() {
    setSelected(new Set());
  }

  const tabs: { id: LibraryTab; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }[] = [
    { id: "upload", label: "Upload", icon: UploadCloud },
    { id: "raw", label: "Raw Images", icon: ImagesIcon, count: counts.raw },
    { id: "published", label: "Published Images", icon: CheckCircle2, count: counts.published },
    { id: "geotagged", label: "Geo-Tagged Images", icon: MapPin, count: counts.geotagged },
    { id: "videos", label: "Videos", icon: Film },
  ];

  return (
    <div className="p-6 md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl">Image Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data?.images.length ?? 0} extracted frames
          </p>
        </div>

        {tab !== "videos" && tab !== "upload" && (
          <div className="flex items-center gap-2">
            <input
              type="search"
              placeholder="Search name, tag, or venue"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-64 rounded-md border border-input bg-background/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={() => {
                setSelectMode((s) => !s);
                clearSelection();
              }}
              className={`rounded-md border px-3 py-2 text-sm ${
                selectMode ? "border-primary bg-primary/10 text-primary" : "border-border"
              }`}
            >
              {selectMode ? "Done" : "Select"}
            </button>
          </div>
        )}
      </div>

      {/* Horizontal tabs */}
      <div className="mt-6 border-b border-border">
        <nav role="tablist" aria-label="Library sections" className="-mb-px flex flex-wrap gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setTab(t.id);
                  clearSelection();
                  setSelectMode(false);
                }}
                className={`inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
                {t.count !== undefined && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>


      {tab !== "videos" && tab !== "upload" && selectMode && (

        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
          <span className="text-sm">
            <strong>{selected.size}</strong> selected
          </span>
          <button
            onClick={selectAll}
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
          >
            Select all ({filtered.length})
          </button>
          <button
            onClick={clearSelection}
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
          >
            Clear
          </button>
          <div className="ml-auto flex gap-2">
            <button
              disabled={selected.size === 0}
              onClick={() => setBulkPanel("keywords")}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              Assign keywords
            </button>
            <button
              disabled={selected.size === 0}
              onClick={() => setBulkPanel("geotag")}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              Geotag
            </button>
            <button
              disabled={selected.size === 0 || autoTagging}
              onClick={runAutoTag}
              className="inline-flex items-center gap-1 rounded-md border border-primary/50 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
            >
              {autoTagging ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Auto-tag with AI
            </button>
          </div>
        </div>
      )}

      {tab === "raw" && !isLoading && (
        <div className="mt-6 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-medium">Folders</div>
            <button
              onClick={createFolder}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent"
            >
              <FolderPlus className="h-3.5 w-3.5 text-primary" /> New folder
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <FolderChip
              active={rawFolderId === null}
              label="All raw"
              count={data?.images.filter((i) => imageBucket(i) === "raw").length ?? 0}
              onClick={() => setRawFolderId(null)}
            />
            <FolderChip
              active={rawFolderId === "__uncategorized"}
              label="Unfiled"
              count={
                data?.images.filter((i) => imageBucket(i) === "raw" && i.folder_id == null).length ?? 0
              }
              onClick={() => setRawFolderId("__uncategorized")}
            />
            {data?.folders.map((f) => {
              const count = data.images.filter(
                (i) => imageBucket(i) === "raw" && i.folder_id === f.id,
              ).length;
              const active = rawFolderId === f.id;
              return (
                <div
                  key={f.id}
                  className={`group inline-flex items-center gap-1 rounded-full border px-1 pl-3 text-xs transition ${
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background hover:border-primary/40"
                  }`}
                >
                  <button
                    onClick={() => setRawFolderId(f.id)}
                    className="inline-flex items-center gap-1.5 py-1 font-medium"
                  >
                    <FolderIcon className="h-3.5 w-3.5" />
                    {f.name}
                    <span className="text-muted-foreground">{count}</span>
                  </button>
                  <button
                    onClick={() => renameFolder(f.id, f.name)}
                    aria-label="Rename"
                    title="Rename"
                    className="rounded-full p-1 opacity-0 transition group-hover:opacity-100 hover:bg-accent"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => deleteFolder(f.id, f.name)}
                    aria-label="Delete folder"
                    title="Delete folder"
                    className="rounded-full p-1 text-destructive opacity-0 transition group-hover:opacity-100 hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>

          {selectMode && selected.size > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-2 text-xs">
              <span className="font-medium">
                Move {selected.size} selected to:
              </span>
              {data?.folders.map((f) => (
                <button
                  key={f.id}
                  onClick={async () => {
                    await moveImagesToFolder(Array.from(selected), f.id);
                    clearSelection();
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 hover:border-primary hover:bg-primary/10"
                >
                  <FolderIcon className="h-3 w-3" /> {f.name}
                </button>
              ))}
              <button
                onClick={async () => {
                  await moveImagesToFolder(Array.from(selected), null);
                  clearSelection();
                }}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 hover:border-primary hover:bg-primary/10"
              >
                Remove from folder
              </button>
              {data?.folders.length === 0 && (
                <span className="text-muted-foreground">
                  Create a folder first, then move.
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "upload" ? (
        <div className="mt-6">
          <UploadPanel
            showHeader={false}
            onImageSaved={() => {
              qc.invalidateQueries({ queryKey: ["library"] });
            }}
            onComplete={() => {
              qc.invalidateQueries({ queryKey: ["library"] });
              qc.invalidateQueries({ queryKey: ["videos"] });
              setTab("raw");
            }}
          />
        </div>
      ) : tab === "videos" ? (
        <VideosPanel />
      ) : isLoading ? (

        <div className="mt-10 text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="mt-16 rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="text-muted-foreground">No frames yet.</p>
          <button
            onClick={() => setTab("upload")}
            className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Upload a video
          </button>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((img) => {
            const tags = data!.tagMap.get(img.id) ?? [];
            const venue = img.venue_id ? data!.venueMap.get(img.venue_id) : null;
            const isSelected = selected.has(img.id);
            const CardTag: any = selectMode ? "div" : Link;
            const linkProps = selectMode
              ? {}
              : { to: "/library/$imageId", params: { imageId: img.id } };
            const isGeo = img.lat != null && img.lng != null;
            const hoverTitle = [img.title, img.description].filter(Boolean).join(" — ");
            return (
              <CardTag
                key={img.id}
                {...linkProps}
                onClick={selectMode ? () => toggleSelect(img.id) : undefined}
                title={hoverTitle || img.name}
                className={`group relative overflow-hidden rounded-xl border bg-card transition ${
                  isSelected
                    ? "border-primary ring-2 ring-primary"
                    : "border-border hover:border-primary/50"
                } ${selectMode ? "cursor-pointer" : ""}`}
              >
                <div className="relative aspect-video overflow-hidden">
                  <SignedImage
                    bucket="frames"
                    path={img.storage_path}
                    alt={img.name}
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                  {isGeo && !selectMode && (
                    <div className="absolute left-2 top-2 z-10">
                      <GeoTaggedBadge lat={Number(img.lat)} lng={Number(img.lng)} />
                    </div>
                  )}
                  {selectMode && (
                    <div className="absolute left-2 top-2 rounded-md bg-background/90 p-1 text-primary shadow">
                      {isSelected ? (
                        <CheckSquare className="h-4 w-4" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </div>
                  )}
                  {!selectMode && (
                    <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                      {isGeo && (
                        <GeoStatusButton
                          bucket="frames"
                          path={img.storage_path}
                          lat={Number(img.lat)}
                          lng={Number(img.lng)}
                        />
                      )}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditingId(img.id);
                        }}
                        aria-label="Edit"
                        className="rounded-md bg-background/90 p-1.5 text-foreground shadow hover:bg-background"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          downloadImage({
                            name: img.name,
                            storage_path: img.storage_path,
                            lat: img.lat as number | null,
                            lng: img.lng as number | null,
                            title: (img as { title: string | null }).title,
                          });
                        }}
                        aria-label="Download"
                        title={`Download${img.title ? ` as “${img.title}”` : ""}`}
                        className="rounded-md bg-background/90 p-1.5 text-foreground shadow hover:bg-background"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          deleteImage(img.id, img.storage_path);
                        }}
                        aria-label="Delete"
                        className="rounded-md bg-background/90 p-1.5 text-destructive shadow hover:bg-destructive hover:text-destructive-foreground"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {(img.title || img.description) && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/85 via-black/70 to-transparent p-3 text-[11px] text-white opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                      {img.title && (
                        <div className="truncate text-xs font-semibold">{img.title}</div>
                      )}
                      {img.description && (
                        <div className="mt-0.5 line-clamp-2 text-[11px] text-white/85">
                          {img.description}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="p-3">
                  <div className="truncate text-sm font-medium">{img.title || img.name}</div>
                  {img.description && (
                    <div className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                      {img.description}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1 text-xs text-muted-foreground">
                    {venue && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                        <MapPin className="h-3 w-3" /> {venue}
                      </span>
                    )}
                    {(isGeo && !venue) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                        <MapPin className="h-3 w-3" /> Geotagged
                      </span>
                    )}
                    {tags.slice(0, 3).map((t) => (
                      <span
                        key={t.slug}
                        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"
                      >
                        <TagIcon className="h-3 w-3" />
                        {t.label}
                      </span>
                    ))}
                  </div>
                </div>
              </CardTag>
            );
          })}
        </div>
      )}

      {bulkPanel && (
        <BulkPanel
          mode={bulkPanel}
          imageIds={Array.from(selected)}
          onClose={() => setBulkPanel(null)}
          onDone={() => {
            setBulkPanel(null);
            clearSelection();
            setSelectMode(false);
            qc.invalidateQueries({ queryKey: ["library"] });
          }}
        />
      )}

      {editingId && (
        <ImageEditModal
          imageId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["library"] });
          }}
        />
      )}
    </div>
  );
}

function BulkPanel({
  mode,
  imageIds,
  onClose,
  onDone,
}: {
  mode: "keywords" | "geotag";
  imageIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { data: keywords } = useQuery({
    queryKey: ["keywords-picker"],
    queryFn: fetchKeywords,
    enabled: mode === "keywords",
  });
  const [kwFilter, setKwFilter] = useState("");
  const [pickedKw, setPickedKw] = useState<Set<string>>(new Set());
  const [primaryKw, setPrimaryKw] = useState<string | null>(null);
  const [loc, setLoc] = useState<PickedLocation | null>(null);
  const [saving, setSaving] = useState(false);

  const filteredKw = useMemo(() => {
    if (!keywords) return [];
    const q = kwFilter.toLowerCase();
    if (!q) return keywords;
    return keywords.filter(
      (k) =>
        k.phrase.toLowerCase().includes(q) ||
        (k.cluster ?? "").toLowerCase().includes(q),
    );
  }, [keywords, kwFilter]);

  async function saveKeywords() {
    if (pickedKw.size === 0) {
      toast.error("Pick at least one keyword");
      return;
    }
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      setSaving(false);
      toast.error("Not signed in");
      return;
    }
    const rows = imageIds.flatMap((imageId) =>
      Array.from(pickedKw).map((keywordId) => ({
        owner_id: uid,
        image_id: imageId,
        keyword_id: keywordId,
        is_primary: keywordId === primaryKw,
      })),
    );
    const { error } = await supabase
      .from("image_keywords")
      .upsert(rows, { onConflict: "image_id,keyword_id" });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success(`Assigned ${pickedKw.size} keyword(s) to ${imageIds.length} image(s)`);
      onDone();
    }
  }

  async function saveGeotag() {
    if (!loc) {
      toast.error("Pick a location");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("images")
      .update({ lat: loc.lat, lng: loc.lng, location_label: loc.label } as any)
      .in("id", imageIds);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success(`Geotagged ${imageIds.length} image(s)`);
      onDone();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 md:items-center">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-lg font-medium">
            {mode === "keywords" ? "Assign keywords" : "Geotag"} ·{" "}
            <span className="text-muted-foreground">{imageIds.length} images</span>
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-3 overflow-auto p-5">
          {mode === "keywords" ? (
            <>
              <input
                type="search"
                placeholder="Filter keywords…"
                value={kwFilter}
                onChange={(e) => setKwFilter(e.target.value)}
                className="w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
              {(!keywords || keywords.length === 0) ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No keywords yet.{" "}
                  <Link to="/keywords" className="text-primary underline">
                    Import from Semrush
                  </Link>
                </div>
              ) : (
                <div className="max-h-80 space-y-1 overflow-auto">
                  {filteredKw.map((k) => {
                    const picked = pickedKw.has(k.id);
                    return (
                      <label
                        key={k.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                          picked ? "border-primary bg-primary/5" : "border-border"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={picked}
                          onChange={() => {
                            setPickedKw((prev) => {
                              const next = new Set(prev);
                              if (next.has(k.id)) {
                                next.delete(k.id);
                                if (primaryKw === k.id) setPrimaryKw(null);
                              } else next.add(k.id);
                              return next;
                            });
                          }}
                          className="h-4 w-4"
                        />
                        <span className="flex-1 truncate">{k.phrase}</span>
                        {k.volume != null && (
                          <span className="text-xs text-muted-foreground">
                            {k.volume}/mo
                          </span>
                        )}
                        {picked && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setPrimaryKw(primaryKw === k.id ? null : k.id);
                            }}
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              primaryKw === k.id
                                ? "bg-primary text-primary-foreground"
                                : "border border-border text-muted-foreground"
                            }`}
                          >
                            Primary
                          </button>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Pick a location to attach lat/lng to all selected frames.
              </p>
              <LocationPicker value={loc} onChange={setLoc} />
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={mode === "keywords" ? saveKeywords : saveGeotag}
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Image edit modal — centralized editor                                      */
/* -------------------------------------------------------------------------- */

type ImageRow = {
  id: string;
  name: string;
  storage_path: string;
  lat: number | null;
  lng: number | null;
  title: string | null;
  description: string | null;
  folder_id: string | null;
};
type TagRow = { id: string; slug: string; label: string };
type FolderRow = { id: string; name: string };

async function fetchImageEdit(imageId: string) {
  const [
    { data: img, error: e1 },
    { data: allTags, error: e2 },
    { data: it, error: e3 },
    { data: folders, error: e4 },
  ] = await Promise.all([
    supabase
      .from("images")
      .select("id,name,storage_path,lat,lng,title,description,folder_id")
      .eq("id", imageId)
      .single(),
    supabase.from("tags").select("id,slug,label").order("label"),
    supabase.from("image_tags").select("tag_id").eq("image_id", imageId),
    supabase.from("image_folders").select("id,name").order("name", { ascending: true }),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;
  if (e4) throw e4;
  return {
    image: img as ImageRow,
    tags: (allTags ?? []) as TagRow[],
    assignedIds: new Set((it ?? []).map((r) => r.tag_id as string)),
    folders: (folders ?? []) as FolderRow[],
  };
}

function ImageEditModal({
  imageId,
  onClose,
  onSaved,
}: {
  imageId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["image-edit", imageId],
    queryFn: () => fetchImageEdit(imageId),
  });

  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [newTag, setNewTag] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [bucket, setBucket] = useState<"raw" | "published" | "geotagged">("raw");
  const [loc, setLoc] = useState<PickedLocation | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!data) return;
    setName(data.image.name);
    setTitle(data.image.title ?? "");
    setDescription(data.image.description ?? "");
    setAssigned(new Set(data.assignedIds));
    const publishedTagIds = new Set(
      data.tags.filter((t) => t.slug === "published" || t.slug === "posted").map((t) => t.id),
    );
    const hasPublished = Array.from(data.assignedIds).some((id) => publishedTagIds.has(id));
    if (data.image.lat != null && data.image.lng != null) {
      setBucket("geotagged");
      setLoc({
        lat: Number(data.image.lat),
        lng: Number(data.image.lng),
        label: "",
      });
    } else if (hasPublished) {
      setBucket("published");
      setLoc(null);
    } else {
      setBucket("raw");
      setLoc(null);
    }

    // Auto-detect embedded GPS from the file itself when the DB row has no
    // coordinates. If found, pre-populate the location picker so moving to
    // Geo-tagged / Published works without manually re-entering coords.
    if (data.image.lat == null || data.image.lng == null) {
      let cancelled = false;
      (async () => {
        try {
          const { data: signed } = await supabase.storage
            .from("frames")
            .createSignedUrl(data.image.storage_path, 60);
          if (!signed?.signedUrl || cancelled) return;
          const res = await fetch(signed.signedUrl);
          const blob = await res.blob();
          const gps = await readGps(
            new File([blob], "image.jpg", { type: blob.type || "image/jpeg" }),
          );
          if (cancelled || !gps.hasGps || gps.lat == null || gps.lng == null) return;
          setLoc({
            lat: gps.lat,
            lng: gps.lng,
            label: `EXIF ${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`,
          });
        } catch {
          /* ignore — user can still pick manually */
        }
      })();
      return () => {
        cancelled = true;
      };
    }
  }, [data]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filteredTags = useMemo(() => {
    const list = data?.tags ?? [];
    const q = tagFilter.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (t) => t.label.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q),
    );
  }, [data, tagFilter]);

  function toggleTag(id: string) {
    setAssigned((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addCustomTag() {
    const label = newTag.trim();
    if (!label) return;
    const slug = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!slug) return;
    // reuse if exists
    const existing = data?.tags.find((t) => t.slug === slug);
    if (existing) {
      toggleTag(existing.id);
      setNewTag("");
      return;
    }
    const { data: inserted, error } = await supabase
      .from("tags")
      .insert({ slug, label, category: "custom" })
      .select("id,slug,label")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    if (inserted) {
      setAssigned((prev) => new Set(prev).add(inserted.id));
      setNewTag("");
      refetch();
    }
  }

  async function saveAll() {
    if (!data) return;
    setSaving(true);
    try {
      // 1. Name, title, description
      const nameChanged = name.trim() && name.trim() !== data.image.name;
      const titleChanged = (title || null) !== (data.image.title ?? null);
      const descChanged = (description || null) !== (data.image.description ?? null);
      if (nameChanged || titleChanged || descChanged) {
        const meta: Record<string, string | null> = {};
        if (nameChanged) meta.name = name.trim();
        if (titleChanged) meta.title = title.trim() || null;
        if (descChanged) meta.description = description.trim() || null;
        const { error } = await supabase
          .from("images")
          .update(meta as never)
          .eq("id", imageId);
        if (error) throw error;
      }

      // 2. Move-to bucket
      //    - "geotagged": require a location, apply lat/lng, remove published tag
      //    - "published": ADD published tag, PRESERVE existing lat/lng (never null them)
      //    - "raw":       remove published tag, PRESERVE existing lat/lng
      //    This fixes two bugs: unpublishing a geo-tagged image no longer wipes
      //    its coordinates, and publishing a geo-tagged image keeps all metadata.
      const publishedTag = data.tags.find((t) => t.slug === "published");
      const nextAssigned = new Set(assigned);
      const patch: { lat?: number | null; lng?: number | null } = {};
      if (bucket === "geotagged") {
        if (!loc) {
          toast.error(
            "No coordinates available. Pick a location or upload an image with embedded GPS.",
          );
          setSaving(false);
          return;
        }
        patch.lat = loc.lat;
        patch.lng = loc.lng;
      } else if (
        bucket === "published" &&
        loc &&
        (data.image.lat == null || data.image.lng == null)
      ) {
        // Publishing a raw image that has EXIF-embedded coords — persist them
        // to the DB so the published image keeps its geo-tag automatically,
        // without a separate manual coordinate entry step.
        patch.lat = loc.lat;
        patch.lng = loc.lng;
      }
      if (bucket === "published" && publishedTag) {
        nextAssigned.add(publishedTag.id);
      } else if (publishedTag) {
        nextAssigned.delete(publishedTag.id);
      }
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase
          .from("images")
          .update(patch as never)
          .eq("id", imageId);
        if (error) throw error;
      }


      // 3. Tags — diff and apply
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      const toAdd = Array.from(nextAssigned).filter((id) => !data.assignedIds.has(id));
      const toRemove = Array.from(data.assignedIds).filter((id) => !nextAssigned.has(id));
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from("image_tags")
          .delete()
          .eq("image_id", imageId)
          .in("tag_id", toRemove);
        if (error) throw error;
      }
      if (toAdd.length > 0 && uid) {
        const rows = toAdd.map((tag_id) => ({ image_id: imageId, tag_id, owner_id: uid }));
        const { error } = await supabase
          .from("image_tags")
          .insert(rows as never);
        if (error) throw error;
      }

      toast.success("Saved");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!data) return;
    setSaving(true);
    try {
      await supabase.storage.from("frames").remove([data.image.storage_path]);
      const { error } = await supabase.from("images").delete().eq("id", imageId);
      if (error) throw error;
      toast.success("Deleted");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-lg font-medium">Edit image</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isLoading || !data ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="grid max-h-[75vh] gap-5 overflow-auto p-5 md:grid-cols-[280px_1fr]">
            <div>
              <div className="overflow-hidden rounded-lg border border-border bg-muted">
                <SignedImage
                  bucket="frames"
                  path={data.image.storage_path}
                  alt={data.image.name}
                  className="aspect-square w-full object-cover"
                />
              </div>
              <label className="mt-4 block text-xs font-medium text-muted-foreground">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
              <label className="mt-3 block text-xs font-medium text-muted-foreground">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Short headline shown on hover"
                className="mt-1 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
              <label className="mt-3 block text-xs font-medium text-muted-foreground">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Extra context surfaced on hover and in previews"
                className="mt-1 w-full resize-none rounded-md border border-input bg-background/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="space-y-5">
              {/* Move-to */}
              <div>
                <div className="text-xs font-medium text-muted-foreground">Move to</div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: "raw", label: "Raw", icon: ImagesIcon },
                      { id: "published", label: "Published", icon: CheckCircle2 },
                      { id: "geotagged", label: "Geo-tagged", icon: MapPin },
                    ] as const
                  ).map((opt) => {
                    const active = bucket === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setBucket(opt.id)}
                        className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium ${
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        <opt.icon className="h-3.5 w-3.5" />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {bucket === "geotagged" && (
                  <div className="mt-3 rounded-lg border border-border p-3">
                    <LocationPicker value={loc} onChange={setLoc} />
                  </div>
                )}
              </div>

              {/* Tags */}
              <div>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-muted-foreground">
                    Tags ({assigned.size})
                  </div>
                  <input
                    type="search"
                    placeholder="Filter…"
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                    className="w-40 rounded-md border border-input bg-background/50 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-auto rounded-md border border-border p-2">
                  {filteredTags.length === 0 ? (
                    <span className="text-xs text-muted-foreground">No matches</span>
                  ) : (
                    filteredTags.map((t) => {
                      const on = assigned.has(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleTag(t.id)}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition ${
                            on
                              ? "border-primary bg-primary/15 text-primary"
                              : "border-border text-muted-foreground hover:bg-accent"
                          }`}
                        >
                          <TagIcon className="h-3 w-3" />
                          {t.label}
                        </button>
                      );
                    })
                  )}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomTag();
                      }
                    }}
                    placeholder="Add custom tag…"
                    className="flex-1 rounded-md border border-input bg-background/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={addCustomTag}
                    className="rounded-md border border-border px-3 py-2 text-xs hover:bg-accent"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          <div>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Are you sure?</span>
                <button
                  onClick={doDelete}
                  disabled={saving}
                  className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground disabled:opacity-50"
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-xs text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete image
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={saveAll}
              disabled={saving || isLoading}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



/* -------------------------------------------------------------------------- */
/* Videos panel (integrated video library)                                    */
/* -------------------------------------------------------------------------- */

type VideoRow = {
  id: string;
  original_name: string;
  duration_seconds: number | null;
  size_bytes: number | null;
  frame_count: number;
  created_at: string;
  status: string;
  storage_path: string;
};

async function fetchVideos(): Promise<VideoRow[]> {
  const { data, error } = await supabase
    .from("videos")
    .select(
      "id, original_name, duration_seconds, size_bytes, frame_count, created_at, status, storage_path",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

function formatBytes(n: number | null | undefined) {
  if (!n) return "—";
  const mb = n / (1024 * 1024);
  if (mb < 1000) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

const STORAGE_QUOTA_BYTES = 1 * 1024 * 1024 * 1024;

function VideosPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["videos"], queryFn: fetchVideos });
  const [preview, setPreview] = useState<VideoRow | null>(null);

  const totalBytes = (data ?? []).reduce((s, v) => s + (v.size_bytes ?? 0), 0);
  const usedPct = Math.min(100, (totalBytes / STORAGE_QUOTA_BYTES) * 100);

  const deleteMut = useMutation({
    mutationFn: async (v: VideoRow) => {
      const { error: storageErr } = await supabase.storage.from("videos").remove([v.storage_path]);
      if (storageErr) throw storageErr;
      const { error } = await supabase.from("videos").delete().eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Video deleted");
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });

  return (
    <div className="mt-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {data?.length ?? 0} video{(data?.length ?? 0) === 1 ? "" : "s"} uploaded
        </p>
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-sm">
            <HardDrive className="h-4 w-4 text-primary" />
            <span className="font-medium">Storage</span>
            <span className="ml-auto text-muted-foreground">
              {formatBytes(totalBytes)} / {formatBytes(STORAGE_QUOTA_BYTES)}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${usedPct}%` }} />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (data?.length ?? 0) === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <Film className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-muted-foreground">No videos yet.</p>
          <Link
            to="/upload"
            className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Upload one
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data!.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              onPreview={() => setPreview(v)}
              onDelete={() => {
                if (confirm(`Delete "${v.original_name}"? This can't be undone.`)) {
                  deleteMut.mutate(v);
                }
              }}
            />
          ))}
        </div>
      )}

      {preview && <VideoPreviewModal video={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function useVideoUrl(path: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.storage
      .from("videos")
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (!cancelled && data?.signedUrl) setUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return url;
}

function VideoCard({
  video,
  onPreview,
  onDelete,
}: {
  video: VideoRow;
  onPreview: () => void;
  onDelete: () => void;
}) {
  const url = useVideoUrl(video.storage_path);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <button onClick={onPreview} className="group relative block aspect-video w-full bg-muted">
        {url ? (
          <video src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
        ) : (
          <div className="h-full w-full animate-pulse bg-muted" />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
          <Play className="h-10 w-10 text-white" />
        </div>
      </button>
      <div className="p-4">
        <div className="truncate font-medium">{video.original_name}</div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            {video.duration_seconds ? `${Number(video.duration_seconds).toFixed(0)}s` : "—"}
          </span>
          <span>{formatBytes(video.size_bytes)}</span>
          <span className="rounded-full bg-primary/15 px-1.5 text-primary">
            {video.frame_count} frames
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {new Date(video.created_at).toLocaleDateString()}
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={onPreview}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-border py-1.5 text-xs hover:bg-accent"
          >
            <Play className="h-3.5 w-3.5" /> Preview
          </button>
          <button
            onClick={onDelete}
            className="inline-flex items-center justify-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function VideoPreviewModal({ video, onClose }: { video: VideoRow; onClose: () => void }) {
  const url = useVideoUrl(video.storage_path);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl rounded-xl border border-border bg-card p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute right-2 top-2 rounded-md p-1 hover:bg-accent">
          <X className="h-4 w-4" />
        </button>
        <div className="truncate pr-8 font-medium">{video.original_name}</div>
        <div className="mt-3 overflow-hidden rounded-lg bg-black">
          {url ? (
            <video src={url} controls autoPlay className="w-full" />
          ) : (
            <div className="aspect-video animate-pulse bg-muted" />
          )}
        </div>
      </div>
    </div>
  );
}


function GeoStatusButton({
  bucket,
  path,
  lat,
  lng,
}: {
  bucket: string;
  path: string;
  lat: number;
  lng: number;
}) {
  const [state, setState] = useState<"idle" | "checking" | "ok" | "mismatch" | "missing">("idle");
  const [detail, setDetail] = useState<string>("");

  async function verify(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setState("checking");
    try {
      const { data: signed, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 60);
      if (error || !signed?.signedUrl) throw error ?? new Error("Could not read image");
      const res = await fetch(signed.signedUrl);
      const blob = await res.blob();
      const file = new File([blob], "image.jpg", { type: blob.type || "image/jpeg" });
      const gps = await readGps(file);
      if (!gps.hasGps || gps.lat == null || gps.lng == null) {
        setState("missing");
        setDetail(gps.reason ?? "No GPS EXIF in file");
        toast.warning("No GPS EXIF found in this image file.");
        return;
      }
      const dLat = Math.abs(gps.lat - lat);
      const dLng = Math.abs(gps.lng - lng);
      // Tolerance ~5e-4° (~55m) — piexif rounds GPS seconds to 1/10000 and
      // reverse-geocoded pins can drift a few meters; anything closer than
      // this is treated as a match to avoid spurious mismatch errors.
      if (dLat < 5e-4 && dLng < 5e-4) {
        setState("ok");
        setDetail(`Verified ${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}`);
        toast.success("Geo-tag verified — EXIF matches the database.");
      } else {
        setState("mismatch");
        setDetail(
          `EXIF ${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)} vs DB ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
        );
        toast.warning("EXIF coordinates don't match the stored geo-tag.");
      }
    } catch (err) {
      setState("missing");
      setDetail(err instanceof Error ? err.message : "Check failed");
      toast.error("Verification failed.");
    }
  }

  const Icon =
    state === "ok"
      ? ShieldCheck
      : state === "mismatch" || state === "missing"
        ? ShieldAlert
        : ShieldQuestion;

  const tone =
    state === "ok"
      ? "text-emerald-500"
      : state === "mismatch" || state === "missing"
        ? "text-amber-500"
        : "text-primary";

  const label =
    state === "checking"
      ? "Verifying…"
      : state === "ok"
        ? "Verified"
        : state === "mismatch"
          ? "EXIF mismatch"
          : state === "missing"
            ? "No EXIF GPS"
            : "Verify geo-tag";

  return (
    <button
      onClick={verify}
      disabled={state === "checking"}
      title={detail || label}
      aria-label={label}
      className={`rounded-md bg-background/90 p-1.5 shadow hover:bg-background ${tone}`}
    >
      {state === "checking" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Icon className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function FolderChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background hover:border-primary/40"
      }`}
    >
      {label}
      <span className="text-muted-foreground">{count}</span>
    </button>
  );
}
