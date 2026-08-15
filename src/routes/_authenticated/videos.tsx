import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Film, HardDrive, Pencil, Play, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/videos")({
  component: VideosPage,
});

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

// Supabase Storage free tier: ~1 GB. Pro tier: 100 GB included.
const STORAGE_QUOTA_BYTES = 1 * 1024 * 1024 * 1024;

function VideosPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["videos"],
    queryFn: fetchVideos,
  });

  const [preview, setPreview] = useState<VideoRow | null>(null);
  const [editing, setEditing] = useState<VideoRow | null>(null);

  const totalBytes = (data ?? []).reduce((s, v) => s + (v.size_bytes ?? 0), 0);
  const usedPct = Math.min(100, (totalBytes / STORAGE_QUOTA_BYTES) * 100);

  const deleteMut = useMutation({
    mutationFn: async (v: VideoRow) => {
      // Remove storage object first, then DB row (RLS scopes to owner).
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

  const renameMut = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("videos").update({ original_name: name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Renamed");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Rename failed"),
  });

  return (
    <div className="p-6 md:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">Videos</h1>
          <p className="mt-1 text-sm text-muted-foreground">{data?.length ?? 0} videos uploaded</p>
        </div>

        {/* Storage usage */}
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm">
            <HardDrive className="h-4 w-4 text-primary" />
            <span className="font-medium">Storage</span>
            <span className="ml-auto text-muted-foreground">
              {formatBytes(totalBytes)} / {formatBytes(STORAGE_QUOTA_BYTES)}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${usedPct}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Stored in Lovable Cloud (Supabase Storage,{" "}
            <code className="text-foreground">videos</code> bucket) — not on your local device. Free
            tier: ~1 GB. Upgrade the Cloud plan to raise the limit.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-10 text-sm text-muted-foreground">Loading…</div>
      ) : (data?.length ?? 0) === 0 ? (
        <div className="mt-16 rounded-2xl border border-dashed border-border p-10 text-center">
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
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data!.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              onPreview={() => setPreview(v)}
              onEdit={() => setEditing(v)}
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
      {editing && (
        <RenameModal
          video={editing}
          onClose={() => setEditing(null)}
          onSave={(name) => renameMut.mutate({ id: editing.id, name })}
          saving={renameMut.isPending}
        />
      )}
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
  onEdit,
  onDelete,
}: {
  video: VideoRow;
  onPreview: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const url = useVideoUrl(video.storage_path);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <button onClick={onPreview} className="group relative block aspect-video w-full bg-muted">
        {url ? (
          <video
            src={url}
            className="h-full w-full object-cover"
            muted
            playsInline
            preload="metadata"
          />
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
            onClick={onEdit}
            className="inline-flex items-center justify-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
          >
            <Pencil className="h-3.5 w-3.5" />
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

function RenameModal({
  video,
  onClose,
  onSave,
  saving,
}: {
  video: VideoRow;
  onClose: () => void;
  onSave: (name: string) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(video.original_name);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-medium">Rename video</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-3 w-full rounded-md border border-border bg-background p-2 text-sm"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(name.trim() || video.original_name)}
            disabled={saving}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
