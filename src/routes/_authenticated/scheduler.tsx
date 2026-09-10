import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  Loader2,
  Pencil,
  Save,
  Trash2,
  X,
  Plus,
  ImageIcon,
  MapPin,
  ExternalLink,
  Sparkles,
  Smile,
  CheckCircle2,
  Clock,
  Send,
  Eye,
  Tag,
  Folder,
  Globe,
  Share2,
  Check,
  Search,
  AlertCircle,
  FileText,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { SignedImage } from "@/components/SignedImage";
import { GeoTaggedBadge } from "@/components/GeoTaggedBadge";
import { LocationPicker, type PickedLocation } from "@/components/LocationPicker";
import { CalendarPage } from "@/routes/_authenticated/calendar";

export const Route = createFileRoute("/_authenticated/scheduler")({
  component: SchedulerPage,
});

function SchedulerPage() {
  const [tab, setTab] = useState<"schedule" | "calendar">("schedule");

  return (
    <div className="w-full px-6 py-6 md:px-10 md:py-10" style={{ paddingRight: 50 }}>
      <div>
        <h1 className="text-3xl">Scheduler</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review upcoming and past scheduled posts, export a GHL CSV, or browse everything on a
          calendar.
        </p>
      </div>

      {/* Top tabs */}
      <div className="mt-6 border-b border-border">
        <nav
          role="tablist"
          aria-label="Scheduler sections"
          className="-mb-px flex flex-wrap gap-1 overflow-x-auto"
        >
          {[
            { id: "schedule" as const, label: "Post Scheduler", icon: Save },
            { id: "calendar" as const, label: "Calendar", icon: Calendar },
          ].map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {tab === "schedule" ? (
        <div className="mt-6">
          <PostSchedulerPanel />
        </div>
      ) : (
        <CalendarPage title="Calendar" platform="gmb" />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type ImageItem = {
  id: string;
  name: string;
  title?: string | null;
  description?: string | null;
  storage_path: string;
  lat?: number | null;
  lng?: number | null;
  folder_id?: string | null;
  created_at?: string;
};

export type ScheduledPost = {
  id: string;
  caption: string;
  status: string;
  scheduled_at: string | null;
  created_at: string;
  location_label: string | null;
  image_ids: string[] | null;
  title: string | null;
  tags: string[] | null;
  lat: number | null;
  lng: number | null;
  networks: string[] | null;
  cta_type: string | null;
  cta_url: string | null;
  primary_keyword: string | null;
};

/* ------------------------------------------------------------------ */
/*  Post Scheduler — upcoming schedule + GHL CSV export                */
/* ------------------------------------------------------------------ */

function PostSchedulerPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [imagesMap, setImagesMap] = useState<Map<string, ImageItem>>(new Map());
  const [libraryImages, setLibraryImages] = useState<ImageItem[]>([]);
  const [scope, setScope] = useState<"upcoming" | "all">("upcoming");
  const [editingPost, setEditingPost] = useState<ScheduledPost | null>(null);
  const [deletingPost, setDeletingPost] = useState<ScheduledPost | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const [postsRes, imagesRes] = await Promise.all([
        supabase
          .from("social_posts")
          .select(
            "id,caption,status,scheduled_at,created_at,location_label,image_ids,title,tags,lat,lng,networks,cta_type,cta_url,primary_keyword",
          )
          .not("scheduled_at", "is", null)
          .order("scheduled_at", { ascending: true })
          .limit(500),
        supabase
          .from("images")
          .select("id,name,title,description,storage_path,lat,lng,folder_id,created_at")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(2000),
      ]);

      if (postsRes.error) throw postsRes.error;

      const imgs = (imagesRes.data ?? []) as ImageItem[];
      const map = new Map<string, ImageItem>();
      for (const img of imgs) {
        map.set(img.id, img);
      }

      setImagesMap(map);
      setLibraryImages(imgs);
      setPosts((postsRes.data ?? []) as unknown as ScheduledPost[]);
    } catch (e) {
      console.error("Error loading schedule:", e);
      setError(e instanceof Error ? e.message : "Failed to load schedule");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function confirmDelete() {
    if (!deletingPost) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("social_posts").delete().eq("id", deletingPost.id);
      if (error) throw error;
      toast.success("Scheduled post deleted.");
      setDeletingPost(null);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete post");
    } finally {
      setDeleting(false);
    }
  }

  const rows = useMemo(() => {
    const now = Date.now();
    return scope === "upcoming"
      ? posts.filter((p) => p.scheduled_at && new Date(p.scheduled_at).getTime() >= now)
      : posts;
  }, [posts, scope]);

  function downloadCsv() {
    if (!rows.length) {
      toast.error("Nothing scheduled to export.");
      return;
    }
    const origin = window.location.origin.replace("preview--", "");
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

    const header =
      "postAtSpecificTime (YYYY-MM-DD HH:mm:ss),content,link (OGmetaUrl),imageUrls,gifUrl,videoUrls,thumbnailUrl";
    const lines = rows.map((p) => {
      const when = p.scheduled_at ? new Date(p.scheduled_at) : new Date();
      const ids = p.image_ids ?? [];
      const urls = ids.map((id) => `${origin}/api/public/img/${id}.jpg`).join(" ");
      const tagLine = (p.tags ?? [])
        .filter(Boolean)
        .map((t) => `#${t.trim().replace(/\s+/g, "")}`)
        .join(" ");
      const content = [p.title?.trim(), p.caption?.trim(), tagLine].filter(Boolean).join("\n\n");
      const link = ids[0] ? `${origin}/api/public/img/${ids[0]}.jpg` : "";
      return [esc(fmt(when)), esc(content), esc(link), esc(urls), "", "", ""].join(",");
    });

    const csv = `${header}\n${lines.join("\n")}\n`;
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ghl-schedule-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast.success(`GHL CSV ready — ${rows.length} ${rows.length === 1 ? "row" : "rows"}.`);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Calendar className="h-4 w-4 text-primary" /> Post scheduler
            </div>
            <div className="text-xs text-muted-foreground">
              Every scheduled post, with a GoHighLevel-ready CSV export.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-border p-0.5">
              {(["upcoming", "all"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`rounded px-2.5 py-1 text-xs font-medium capitalize ${
                    scope === s
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              onClick={downloadCsv}
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
              title="Download a GoHighLevel Social Planner CSV of this schedule"
            >
              <Save className="h-3.5 w-3.5" /> Download GHL CSV ({rows.length})
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        {loading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading schedule…
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-destructive">{error}</div>
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No scheduled posts yet. Set a schedule time in Post Generator → Compose → Publish.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-widest text-muted-foreground">
                  <th className="py-2.5 pr-4 font-medium">Scheduled</th>
                  <th className="py-2.5 pr-4 font-medium">Status</th>
                  <th className="py-2.5 pr-4 font-medium">Images</th>
                  <th className="py-2.5 pr-4 font-medium">Content</th>
                  <th className="py-2.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const pImages = (p.image_ids ?? [])
                    .map((id) => imagesMap.get(id))
                    .filter(Boolean) as ImageItem[];

                  return (
                    <tr key={p.id} className="border-b border-border/60 align-top hover:bg-accent/30 transition">
                      <td className="whitespace-nowrap py-3 pr-4 tabular-nums">
                        <div className="font-medium text-foreground text-xs">
                          {p.scheduled_at ? new Date(p.scheduled_at).toLocaleDateString() : "—"}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {p.scheduled_at
                            ? new Date(p.scheduled_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : ""}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${
                            p.status === "scheduled" || p.status === "queued"
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
                              : p.status === "sent" || p.status === "published"
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                                : "border-border text-muted-foreground bg-muted"
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        {pImages.length > 0 ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {pImages.slice(0, 3).map((img) => (
                              <div
                                key={img.id}
                                className="relative h-9 w-9 overflow-hidden rounded-md border border-border shadow-sm shrink-0 bg-muted"
                                title={img.title || img.name}
                              >
                                <SignedImage
                                  bucket="frames"
                                  path={img.storage_path}
                                  alt={img.name}
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            ))}
                            {pImages.length > 3 && (
                              <span className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted text-[10px] font-semibold text-muted-foreground">
                                +{pImages.length - 3}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">No image</span>
                        )}
                      </td>
                      <td className="max-w-[480px] py-3 text-muted-foreground">
                        {p.title && (
                          <div className="font-semibold text-foreground text-xs mb-0.5">
                            {p.title}
                          </div>
                        )}
                        <span className="line-clamp-2 text-xs whitespace-pre-wrap leading-relaxed">
                          {p.caption}
                        </span>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px]">
                          {p.location_label && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                              <MapPin className="h-2.5 w-2.5" /> {p.location_label.split(",")[0]}
                            </span>
                          )}
                          {(p.tags ?? []).slice(0, 5).map((t) => (
                            <span
                              key={t}
                              className="rounded-full border border-border bg-background px-1.5 py-0.5 text-muted-foreground"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingPost(p)}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent hover:text-primary transition"
                            title="Edit scheduled post details & images"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingPost(p)}
                            className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition"
                            title="Delete scheduled post"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editingPost && (
        <EditScheduledPostModal
          post={editingPost}
          imagesMap={imagesMap}
          libraryImages={libraryImages}
          onClose={() => setEditingPost(null)}
          onSaved={() => {
            setEditingPost(null);
            reload();
          }}
        />
      )}

      {deletingPost && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => !deleting && setDeletingPost(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-base font-semibold">Delete scheduled post?</div>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              This removes it from the schedule permanently. This action cannot be undone.
            </p>
            <p className="mt-3 line-clamp-3 rounded-md border border-border bg-background p-2.5 text-xs text-muted-foreground">
              {deletingPost.caption}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingPost(null)}
                disabled={deleting}
                className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Delete Post
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Edit Scheduled Post Modal — Comprehensive & Image-Enabled         */
/* ------------------------------------------------------------------ */

const QUICK_SYMBOLS = ["✨", "📍", "📞", "🌟", "🧹", "🧼", "✅", "🔥", "⭐", "💯", "🏠", "🏢"];

const SOCIAL_NETWORKS: Array<{ id: string; label: string }> = [
  { id: "gmb", label: "Google Business" },
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "twitter", label: "Twitter / X" },
];

const CTA_OPTIONS = [
  { value: "", label: "No CTA Button" },
  { value: "BOOK", label: "Book Appointment" },
  { value: "ORDER", label: "Order Online" },
  { value: "SHOP", label: "Shop Now" },
  { value: "LEARN_MORE", label: "Learn More" },
  { value: "SIGN_UP", label: "Sign Up" },
  { value: "CALL", label: "Call Now" },
];

function formatLocalDatetime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function EditScheduledPostModal({
  post,
  imagesMap,
  libraryImages,
  onClose,
  onSaved,
}: {
  post: ScheduledPost;
  imagesMap: Map<string, ImageItem>;
  libraryImages: ImageItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(post.title ?? "");
  const [caption, setCaption] = useState(post.caption ?? "");
  const [imageIds, setImageIds] = useState<string[]>(post.image_ids ?? []);
  const [scheduledAt, setScheduledAt] = useState(() => {
    if (!post.scheduled_at) return "";
    return formatLocalDatetime(new Date(post.scheduled_at));
  });
  const [tags, setTags] = useState<string[]>(post.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [locationLabel, setLocationLabel] = useState(post.location_label ?? "");
  const [loc, setLoc] = useState<PickedLocation | null>(() => {
    if (post.lat != null && post.lng != null) {
      return {
        lat: Number(post.lat),
        lng: Number(post.lng),
        label: post.location_label ?? "",
      };
    }
    return null;
  });
  const [latInput, setLatInput] = useState(post.lat != null ? String(post.lat) : "");
  const [lngInput, setLngInput] = useState(post.lng != null ? String(post.lng) : "");
  const [networks, setNetworks] = useState<string[]>(post.networks ?? ["gmb"]);
  const [ctaType, setCtaType] = useState(post.cta_type ?? "");
  const [ctaUrl, setCtaUrl] = useState(post.cta_url ?? "");

  const [showImagePicker, setShowImagePicker] = useState(false);
  const [imageSearch, setImageSearch] = useState("");
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  // Synchronize location picker with manual coords
  useEffect(() => {
    if (loc) {
      setLatInput(String(loc.lat));
      setLngInput(String(loc.lng));
      if (loc.label && !locationLabel) {
        setLocationLabel(loc.label);
      }
    }
  }, [loc]);

  function handleManualCoordChange(nLat: string, nLng: string) {
    setLatInput(nLat);
    setLngInput(nLng);
    const parsedLat = parseFloat(nLat);
    const parsedLng = parseFloat(nLng);
    if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
      setLoc({ lat: parsedLat, lng: parsedLng, label: locationLabel });
    }
  }

  function addTag(raw: string) {
    const parts = raw
      .split(/[,\s\n]/)
      .map((p) => p.trim().replace(/^#+/, ""))
      .filter(Boolean);
    if (!parts.length) return;
    setTags((prev) => {
      const seen = new Set(prev.map((t) => t.toLowerCase()));
      const next = [...prev];
      for (const p of parts) {
        if (!seen.has(p.toLowerCase())) {
          next.push(p);
          seen.add(p.toLowerCase());
        }
      }
      return next;
    });
    setTagInput("");
  }

  function removeTag(tagToRemove: string) {
    setTags((prev) => prev.filter((t) => t !== tagToRemove));
  }

  function insertSymbol(sym: string) {
    setCaption((prev) => `${prev} ${sym} `);
  }

  function toggleNetwork(id: string) {
    setNetworks((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) {
          toast.error("Keep at least one network selected");
          return prev;
        }
        return prev.filter((n) => n !== id);
      }
      return [...prev, id];
    });
  }

  function toggleImageId(id: string) {
    setImageIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= 4) {
        toast.info("Max 4 images per post");
        return prev;
      }
      return [...prev, id];
    });
  }

  // Filtered available library images for the image picker
  const filteredLibraryImages = useMemo(() => {
    const q = imageSearch.trim().toLowerCase();
    return libraryImages.filter((img) => {
      if (!q) return true;
      return (
        img.name.toLowerCase().includes(q) ||
        (img.title ?? "").toLowerCase().includes(q) ||
        (img.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [libraryImages, imageSearch]);

  const attachedImages = useMemo(() => {
    return imageIds.map((id) => imagesMap.get(id)).filter(Boolean) as ImageItem[];
  }, [imageIds, imagesMap]);

  async function save() {
    if (!caption.trim()) {
      toast.error("Post body / caption cannot be empty");
      return;
    }
    if (!scheduledAt) {
      toast.error("Pick a schedule date and time");
      return;
    }
    if (new Date(scheduledAt).getTime() <= Date.now()) {
      toast.error("Pick a future date and time — posts can't be scheduled in the past.");
      return;
    }
    setSaving(true);
    try {
      const finalLat = latInput.trim() ? parseFloat(latInput.trim()) : loc?.lat ?? null;
      const finalLng = lngInput.trim() ? parseFloat(lngInput.trim()) : loc?.lng ?? null;

      const { error } = await supabase
        .from("social_posts")
        .update({
          title: title.trim() || null,
          caption: caption.trim(),
          image_ids: imageIds,
          scheduled_at: new Date(scheduledAt).toISOString(),
          tags: tags,
          location_label: locationLabel.trim() || loc?.label || null,
          lat: finalLat,
          lng: finalLng,
          networks: networks.length ? networks : ["gmb"],
          cta_type: ctaType || null,
          cta_url: ctaUrl.trim() || null,
        } as never)
        .eq("id", post.id);

      if (error) throw error;
      toast.success("Scheduled post updated successfully.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-3 md:p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5 bg-muted/20">
          <div>
            <div className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold text-foreground">Edit Scheduled Post</h2>
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500 capitalize">
                {post.status}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Modify post content, attached images, geotag location, timing, and target networks.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body: Split Pane */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-5">
            {/* Left Column: Comprehensive Editor Form (7 cols) */}
            <div className="lg:col-span-7 space-y-5">
              {/* 1. Attached Images Section */}
              <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                      Attached Images ({imageIds.length}/4)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowImagePicker((prev) => !prev)}
                    className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition"
                  >
                    {showImagePicker ? (
                      <>
                        <X className="h-3.5 w-3.5" /> Close Gallery
                      </>
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5" /> + Add / Change Images
                      </>
                    )}
                  </button>
                </div>

                {/* Attached Images Grid */}
                {attachedImages.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {attachedImages.map((img) => (
                      <div
                        key={img.id}
                        className="group relative overflow-hidden rounded-lg border border-border bg-card shadow-sm"
                      >
                        <div className="relative aspect-square w-full bg-muted">
                          <SignedImage
                            bucket="frames"
                            path={img.storage_path}
                            alt={img.name}
                            className="h-full w-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => toggleImageId(img.id)}
                            className="absolute top-1.5 right-1.5 rounded-full bg-destructive/90 p-1 text-destructive-foreground shadow hover:bg-destructive transition"
                            title="Remove image from post"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                          {img.lat != null && img.lng != null && (
                            <div className="absolute bottom-1 left-1">
                              <GeoTaggedBadge lat={img.lat} lng={img.lng} compact />
                            </div>
                          )}
                        </div>
                        <div className="p-1.5 text-center">
                          <div className="truncate text-[11px] font-medium text-foreground" title={img.title || img.name}>
                            {img.title || img.name}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    No images attached to this post. Click &quot;+ Add / Change Images&quot; to pick from your library.
                  </div>
                )}

                {/* Expandable Image Library Picker */}
                {showImagePicker && (
                  <div className="mt-4 pt-4 border-t border-border space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                          type="search"
                          placeholder="Search library images by title or filename…"
                          value={imageSearch}
                          onChange={(e) => setImageSearch(e.target.value)}
                          className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-1.5 text-xs outline-none focus:border-primary"
                        />
                      </div>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {filteredLibraryImages.length} available
                      </span>
                    </div>

                    <div className="max-h-48 overflow-y-auto grid grid-cols-4 sm:grid-cols-6 gap-2 p-1 border border-border/70 rounded-lg bg-muted/20">
                      {filteredLibraryImages.map((img) => {
                        const isSelected = imageIds.includes(img.id);
                        return (
                          <button
                            key={img.id}
                            type="button"
                            onClick={() => toggleImageId(img.id)}
                            className={`group relative aspect-square rounded-md overflow-hidden border transition ${
                              isSelected
                                ? "border-primary ring-2 ring-primary"
                                : "border-border hover:border-primary/50"
                            }`}
                            title={img.title || img.name}
                          >
                            <SignedImage
                              bucket="frames"
                              path={img.storage_path}
                              alt={img.name}
                              className="h-full w-full object-cover"
                            />
                            {isSelected && (
                              <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                <div className="rounded-full bg-primary p-0.5 text-primary-foreground shadow">
                                  <Check className="h-3 w-3" />
                                </div>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Post Title & Caption */}
              <div className="space-y-3 rounded-xl border border-border bg-background p-4 shadow-sm">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Post Title / Headline
                  </label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Professional Floor Scrubbing & Deep Cleaning in Dubai"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-medium outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Post Content / Caption
                    </label>
                    <span
                      className={`text-[11px] font-mono ${
                        caption.length > 1500 ? "text-destructive font-semibold" : "text-muted-foreground"
                      }`}
                    >
                      {caption.length} / 1,500 chars
                    </span>
                  </div>

                  {/* Quick symbols toolbar */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1.5 mb-1.5">
                    <span className="text-[10px] text-muted-foreground uppercase mr-1">Insert:</span>
                    {QUICK_SYMBOLS.map((sym) => (
                      <button
                        key={sym}
                        type="button"
                        onClick={() => insertSymbol(sym)}
                        className="rounded border border-border bg-muted/40 hover:bg-accent px-1.5 py-0.5 text-xs transition"
                      >
                        {sym}
                      </button>
                    ))}
                  </div>

                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    rows={7}
                    placeholder="Enter the complete post copy, highlights, call-to-action details, and service points..."
                    className="w-full resize-y rounded-md border border-border bg-background p-3 text-xs leading-relaxed outline-none focus:border-primary"
                  />
                </div>

                {/* Hashtags / Tags */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Keywords & Hashtags
                  </label>
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          addTag(tagInput);
                        }
                      }}
                      placeholder="Type keyword and press Enter or comma…"
                      className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => addTag(tagInput)}
                      className="rounded-md bg-primary/10 border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
                    >
                      Add
                    </button>
                  </div>

                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] text-foreground"
                        >
                          #{t}
                          <button
                            type="button"
                            onClick={() => removeTag(t)}
                            className="rounded-full hover:bg-accent p-0.5 text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Timing & Social Platforms */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Schedule timing */}
                <div className="rounded-xl border border-border bg-background p-4 shadow-sm space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Schedule Timing
                    </label>
                    <Clock className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary font-medium"
                  />

                  {/* Timing presets */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => setScheduledAt(formatLocalDatetime(new Date(Date.now() + 3600 * 1000)))}
                      className="rounded border border-border bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent"
                    >
                      +1 hr
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 1);
                        d.setHours(9, 0, 0, 0);
                        setScheduledAt(formatLocalDatetime(d));
                      }}
                      className="rounded border border-border bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent"
                    >
                      Tmrw 9 AM
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 1);
                        d.setHours(14, 0, 0, 0);
                        setScheduledAt(formatLocalDatetime(d));
                      }}
                      className="rounded border border-border bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent"
                    >
                      Tmrw 2 PM
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 2);
                        d.setHours(10, 0, 0, 0);
                        setScheduledAt(formatLocalDatetime(d));
                      }}
                      className="rounded border border-border bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent"
                    >
                      +2 Days
                    </button>
                  </div>
                </div>

                {/* Target networks */}
                <div className="rounded-xl border border-border bg-background p-4 shadow-sm space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Target Networks
                    </label>
                    <Share2 className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {SOCIAL_NETWORKS.map((n) => {
                      const isSelected = networks.includes(n.id);
                      return (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => toggleNetwork(n.id)}
                          className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                            isSelected
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "border border-border bg-muted/40 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {n.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 4. Location & Geotag Details */}
              <div className="rounded-xl border border-border bg-background p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                      Geotag & Location
                    </span>
                  </div>
                  {loc?.lat != null && loc?.lng != null && (
                    <a
                      href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> View Map
                    </a>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">
                    Location Label / Area
                  </label>
                  <input
                    value={locationLabel}
                    onChange={(e) => setLocationLabel(e.target.value)}
                    placeholder="e.g. Dubai Marina, Dubai, United Arab Emirates"
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-muted-foreground">Latitude</span>
                    <input
                      type="number"
                      step="any"
                      value={latInput}
                      onChange={(e) => handleManualCoordChange(e.target.value, lngInput)}
                      placeholder="25.2048"
                      className="w-full rounded border border-border bg-background px-2.5 py-1.5 font-mono text-xs outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground">Longitude</span>
                    <input
                      type="number"
                      step="any"
                      value={lngInput}
                      onChange={(e) => handleManualCoordChange(latInput, e.target.value)}
                      placeholder="55.2708"
                      className="w-full rounded border border-border bg-background px-2.5 py-1.5 font-mono text-xs outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowMapPicker((prev) => !prev)}
                  className="text-[11px] text-primary hover:underline font-medium block"
                >
                  {showMapPicker ? "▲ Hide map search picker" : "▼ Search place or pick on map"}
                </button>

                {showMapPicker && (
                  <div className="pt-2 border-t border-border">
                    <LocationPicker value={loc} onChange={setLoc} />
                  </div>
                )}
              </div>

              {/* 5. Call To Action (Optional) */}
              <div className="rounded-xl border border-border bg-background p-4 shadow-sm space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Call To Action Button (Optional)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] text-muted-foreground block mb-1">Button Action</span>
                    <select
                      value={ctaType}
                      onChange={(e) => setCtaType(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                    >
                      {CTA_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block mb-1">Target URL / Phone</span>
                    <input
                      value={ctaUrl}
                      onChange={(e) => setCtaUrl(e.target.value)}
                      placeholder="https://yourwebsite.com/book"
                      className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Sticky Live Preview & Post Summary (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="sticky top-0 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Eye className="h-3.5 w-3.5 text-primary" /> Live Post Preview
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    Google Business &amp; Social layout
                  </span>
                </div>

                {/* Card Preview Mockup */}
                <div className="rounded-xl border border-border bg-card shadow-lg p-4 space-y-3">
                  {/* Card Header */}
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                      GB
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-foreground truncate">
                        Your Business
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {locationLabel || loc?.label || "No location set"} · Scheduled
                      </div>
                    </div>
                  </div>

                  {/* Scheduled time reminder badge */}
                  {scheduledAt && (
                    <div className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-500">
                      <Clock className="h-3 w-3 shrink-0" />
                      <span>
                        Delivers on: <strong>{new Date(scheduledAt).toLocaleString()}</strong>
                      </span>
                    </div>
                  )}

                  {/* Post Title */}
                  {title && (
                    <div className="text-sm font-bold text-foreground leading-snug">
                      {title}
                    </div>
                  )}

                  {/* Post Body Caption */}
                  <div className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/90 max-h-60 overflow-y-auto">
                    {caption.trim() ? (
                      caption
                    ) : (
                      <span className="italic text-muted-foreground">
                        Post caption preview will appear here…
                      </span>
                    )}
                  </div>

                  {/* Image Grid Preview */}
                  {attachedImages.length > 0 && (
                    <div
                      className={`grid gap-1.5 rounded-lg overflow-hidden ${
                        attachedImages.length === 1
                          ? "grid-cols-1"
                          : attachedImages.length === 2
                            ? "grid-cols-2"
                            : "grid-cols-2 sm:grid-cols-3"
                      }`}
                    >
                      {attachedImages.map((img) => (
                        <div key={img.id} className="relative aspect-video w-full overflow-hidden bg-muted">
                          <SignedImage
                            bucket="frames"
                            path={img.storage_path}
                            alt={img.name}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Tags Footer */}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 text-[11px] text-primary pt-1">
                      {tags.map((t) => (
                        <span key={t}>#{t}</span>
                      ))}
                    </div>
                  )}

                  {/* CTA Button Preview */}
                  {ctaType && (
                    <div className="pt-2">
                      <button
                        type="button"
                        className="w-full rounded-md bg-primary py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90"
                      >
                        {CTA_OPTIONS.find((c) => c.value === ctaType)?.label || "Learn More"}
                      </button>
                    </div>
                  )}
                </div>

                {/* Meta summary card */}
                <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2 text-xs">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Post Delivery Summary
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded border border-border/60 bg-background p-2">
                      <span className="text-muted-foreground block text-[10px]">Images</span>
                      <strong className="text-foreground">{attachedImages.length} attached</strong>
                    </div>
                    <div className="rounded border border-border/60 bg-background p-2">
                      <span className="text-muted-foreground block text-[10px]">Networks</span>
                      <strong className="text-foreground">{networks.length} selected</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3 bg-muted/20">
          <p className="text-[11px] text-muted-foreground hidden sm:block">
            Posts scheduled for future delivery will be automatically dispatched at the specified time.
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-border px-4 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !caption.trim() || !scheduledAt}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 shadow-sm"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
