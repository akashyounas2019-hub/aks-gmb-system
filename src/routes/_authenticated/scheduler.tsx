import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Loader2,
  Pencil,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
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
        <nav role="tablist" aria-label="Scheduler sections" className="-mb-px flex flex-wrap gap-1 overflow-x-auto">
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
/*  Post Scheduler — upcoming schedule + GHL CSV export                */
/* ------------------------------------------------------------------ */

type ScheduledPost = {
  id: string;
  caption: string;
  status: string;
  scheduled_at: string | null;
  created_at: string;
  location_label: string | null;
  image_ids: string[] | null;
  title: string | null;
  tags: string[] | null;
  cta_type: string | null;
  cta_url: string | null;
};

function PostSchedulerPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [scope, setScope] = useState<"upcoming" | "all">("upcoming");
  const [editingPost, setEditingPost] = useState<ScheduledPost | null>(null);
  const [deletingPost, setDeletingPost] = useState<ScheduledPost | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function reload() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("social_posts")
      .select(
        "id,caption,status,scheduled_at,created_at,location_label,image_ids,title,tags,cta_type,cta_url",
      )
      .not("scheduled_at", "is", null)
      .order("scheduled_at", { ascending: true })
      .limit(500);
    if (error) setError(error.message);
    setPosts((data ?? []) as unknown as ScheduledPost[]);
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, []);

  async function confirmDelete() {
    if (!deletingPost) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("social_posts")
        .delete()
        .eq("id", deletingPost.id);
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
      ? posts.filter(
          (p) => p.scheduled_at && new Date(p.scheduled_at).getTime() >= now,
        )
      : posts;
  }, [posts, scope]);

  function downloadCsv() {
    if (!rows.length) {
      toast.error("Nothing scheduled to export.");
      return;
    }
    // Lovable's temporary preview subdomain (preview--<project>.lovable.app)
    // isn't a stable public link for GHL to fetch images from later — strip
    // the "preview--" prefix so the CSV always points at the real domain.
    const origin = window.location.origin.replace("preview--", "");
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

    const header =
      "postAtSpecificTime (YYYY-MM-DD HH:mm:ss),content,link (OGmetaUrl),imageUrls,gifUrl,videoUrls,thumbnailUrl";
    const lines = rows.map((p) => {
      const when = p.scheduled_at ? new Date(p.scheduled_at) : new Date();
      const urls = (p.image_ids ?? [])
        .map((id) => `${origin}/api/public/img/${id}.jpg`)
        .join(" ");
      return [esc(fmt(when)), esc(p.caption ?? ""), "", esc(urls), "", "", ""].join(",");
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
                    scope === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
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
                  <th className="py-2 pr-4 font-medium">Scheduled</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Images</th>
                  <th className="py-2 pr-4 font-medium">Content</th>
                  <th className="py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-border/60 align-top">
                    <td className="whitespace-nowrap py-2 pr-4 tabular-nums">
                      {p.scheduled_at ? new Date(p.scheduled_at).toLocaleString() : "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
                        {p.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 tabular-nums text-muted-foreground">
                      {p.image_ids?.length ?? 0}
                    </td>
                    <td className="max-w-[520px] py-2 text-muted-foreground">
                      <span className="line-clamp-2 whitespace-pre-wrap">{p.caption}</span>
                    </td>
                    <td className="py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingPost(p)}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                          title="Edit scheduled post"
                        >
                          <Pencil className="h-3 w-3" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingPost(p)}
                          className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                          title="Delete scheduled post"
                        >
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editingPost && (
        <EditScheduledPostModal
          post={editingPost}
          onClose={() => setEditingPost(null)}
          onSaved={() => {
            setEditingPost(null);
            reload();
          }}
        />
      )}

      {deletingPost && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !deleting && setDeletingPost(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-background p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-base font-medium">Delete scheduled post?</div>
            <p className="mt-2 text-sm text-muted-foreground">
              This removes it from the schedule permanently. This can&apos;t be undone.
            </p>
            <p className="mt-3 line-clamp-3 rounded-md border border-border bg-card p-2 text-xs text-muted-foreground">
              {deletingPost.caption}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingPost(null)}
                disabled={deleting}
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EditScheduledPostModal({
  post,
  onClose,
  onSaved,
}: {
  post: ScheduledPost;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [caption, setCaption] = useState(post.caption);
  const [scheduledAt, setScheduledAt] = useState(() => {
    if (!post.scheduled_at) return "";
    const d = new Date(post.scheduled_at);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!caption.trim()) {
      toast.error("Post body can't be empty");
      return;
    }
    if (!scheduledAt) {
      toast.error("Pick a schedule date/time");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("social_posts")
        .update({
          caption: caption.trim(),
          scheduled_at: new Date(scheduledAt).toISOString(),
        } as never)
        .eq("id", post.id);
      if (error) throw error;
      toast.success("Scheduled post updated.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-background p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="text-base font-medium">Edit scheduled post</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="mt-4 block text-xs font-medium text-muted-foreground">Post body</label>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={8}
          className="mt-1 w-full resize-y rounded-md border border-input bg-background/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
        />

        <label className="mt-3 block text-xs font-medium text-muted-foreground">Scheduled at</label>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
        />

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
