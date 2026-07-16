import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  UploadCloud,
  CheckCircle2,
  XCircle,
  Loader2,
  RotateCw,
  X,
  Clock,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { extractSharpFrames } from "@/lib/ffmpeg-extract";
import { LocationPicker, type PickedLocation } from "@/components/LocationPicker";

type QueueStage =
  | "pending"
  | "extracting"
  | "uploading"
  | "saving"
  | "done"
  | "error";

interface QueueItem {
  id: string;
  file: File;
  stage: QueueStage;
  progress: number;
  message: string;
  error?: string;
  framesSaved?: number;
  framesTotal?: number;
}

export interface UploadPanelProps {
  onComplete?: () => void;
  onImageSaved?: () => void;
  showHeader?: boolean;
}

export function UploadPanel({ onComplete, onImageSaved, showHeader = true }: UploadPanelProps) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [maxFrames, setMaxFrames] = useState(15);
  const [sampleMs, setSampleMs] = useState(1000);
  const [dragOver, setDragOver] = useState(false);
  const [location, setLocation] = useState<PickedLocation | null>(null);
  const [autoGeotag, setAutoGeotag] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);
  // Tracks whether we've already fired onComplete for the current drained state.
  // Resets whenever any new work is queued so the next drain can fire it again.
  const drainedFiredRef = useRef(false);

  // Keep latest option values reachable from the processor without re-triggering effect
  const optsRef = useRef({ maxFrames, sampleMs, autoGeotag, location });
  useEffect(() => {
    optsRef.current = { maxFrames, sampleMs, autoGeotag, location };
  }, [maxFrames, sampleMs, autoGeotag, location]);

  const patchItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }, []);

  const processItem = useCallback(
    async (item: QueueItem) => {
      const { maxFrames, sampleMs, autoGeotag, location } = optsRef.current;
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Not signed in.");

      // Image path — upload directly, no frame extraction.
      if (item.file.type.startsWith("image/")) {
        patchItem(item.id, { stage: "uploading", message: "Uploading image…", progress: 0.2 });
        const ext = item.file.name.split(".").pop() || "jpg";
        const imgPath = `${userId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("frames")
          .upload(imgPath, item.file, { contentType: item.file.type, upsert: false });
        if (upErr) throw upErr;

        patchItem(item.id, { stage: "saving", message: "Saving…", progress: 0.7 });
        const baseName = item.file.name.replace(/\.[^.]+$/, "");
        const { error: iErr } = await supabase.from("images").insert({
          owner_id: userId,
          storage_path: imgPath,
          name: baseName || item.file.name,
          lat: autoGeotag && location ? location.lat : null,
          lng: autoGeotag && location ? location.lng : null,
        });
        if (iErr) throw iErr;
        onImageSaved?.();
        patchItem(item.id, { stage: "done", progress: 1, message: "Uploaded" });
        // Note: onComplete is fired once when the entire queue drains (see effect below),
        // not per item — otherwise the parent may navigate away and unmount the panel
        // while other videos are still processing.
        return;
      }

      patchItem(item.id, { stage: "extracting", message: "Analyzing video…", progress: 0 });
      const { frames, durationSeconds } = await extractSharpFrames(item.file, {
        sampleEveryMs: sampleMs,
        maxFrames,
        onProgress: (p) => {
          patchItem(item.id, {
            progress: p.progress * 0.3,
            message: p.message ?? "Analyzing video…",
          });
        },
      });
      if (frames.length === 0) throw new Error("Couldn't extract any frames.");

      patchItem(item.id, {
        stage: "uploading",
        message: "Uploading video…",
        progress: 0.3,
        framesTotal: frames.length,
      });

      const videoPath = `${userId}/${crypto.randomUUID()}-${item.file.name}`;
      const { error: vErr } = await supabase.storage
        .from("videos")
        .upload(videoPath, item.file, { upsert: false, contentType: item.file.type });
      if (vErr) throw vErr;

      const { data: videoRow, error: vRowErr } = await supabase
        .from("videos")
        .insert({
          owner_id: userId,
          storage_path: videoPath,
          original_name: item.file.name,
          duration_seconds: durationSeconds,
          size_bytes: item.file.size,
          frame_count: frames.length,
          status: "ready",
        })
        .select("id")
        .single();
      if (vRowErr) throw vRowErr;

      patchItem(item.id, { stage: "saving", message: "Saving frames…", progress: 0.4 });
      const baseName = item.file.name.replace(/\.[^.]+$/, "");
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        const framePath = `${userId}/${videoRow.id}/${String(i + 1).padStart(3, "0")}.jpg`;
        const { error: fErr } = await supabase.storage
          .from("frames")
          .upload(framePath, f.blob, { contentType: "image/jpeg", upsert: false });
        if (fErr) throw fErr;
        const { error: iErr } = await supabase.from("images").insert({
          owner_id: userId,
          video_id: videoRow.id,
          storage_path: framePath,
          name: `${baseName} — Frame ${i + 1}`,
          sharpness_score: f.sharpness,
          timestamp_seconds: f.timestampSeconds,
          width: f.width,
          height: f.height,
          lat: autoGeotag && location ? location.lat : null,
          lng: autoGeotag && location ? location.lng : null,
        });
        if (iErr) throw iErr;
        const done = i + 1;
        patchItem(item.id, {
          progress: 0.4 + (done / frames.length) * 0.6,
          message: `Saved ${done}/${frames.length}`,
          framesSaved: done,
        });
        onImageSaved?.();
      }

      patchItem(item.id, {
        stage: "done",
        progress: 1,
        message: `Extracted ${frames.length} sharp frames`,
      });
      onComplete?.();
    },
    [patchItem, onImageSaved, onComplete],
  );

  // Drain queue sequentially
  useEffect(() => {
    if (processingRef.current) return;
    const next = queue.find((q) => q.stage === "pending");
    if (!next) return;
    processingRef.current = true;
    (async () => {
      try {
        await processItem(next);
      } catch (err) {
        console.error(err);
        const msg = err instanceof Error ? err.message : "Upload failed";
        patchItem(next.id, { stage: "error", error: msg, message: msg });
        toast.error(`${next.file.name}: ${msg}`);
      } finally {
        processingRef.current = false;
        // Trigger effect re-run by touching state minimally
        setQueue((prev) => [...prev]);
      }
    })();
  }, [queue, processItem, patchItem]);

  const enqueueFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    const valid: QueueItem[] = [];
    for (const file of arr) {
      if (!file.type.startsWith("video/") && !file.type.startsWith("image/")) {
        toast.error(`Skipped ${file.name}: not an image or video`);
        continue;
      }
      valid.push({
        id: crypto.randomUUID(),
        file,
        stage: "pending",
        progress: 0,
        message: "Waiting…",
      });
    }
    if (valid.length) setQueue((prev) => [...prev, ...valid]);
  }, []);

  const retry = useCallback((id: string) => {
    patchItem(id, {
      stage: "pending",
      progress: 0,
      message: "Waiting…",
      error: undefined,
    });
  }, [patchItem]);

  const remove = useCallback((id: string) => {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  }, []);

  const clearFinished = useCallback(() => {
    setQueue((prev) => prev.filter((q) => q.stage !== "done"));
  }, []);

  const hasFinished = queue.some((q) => q.stage === "done");

  return (
    <div>
      {showHeader && (
        <>
          <h2 className="text-2xl">Upload a video</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Extraction runs entirely in your browser. Nothing leaves your machine until
            you have the frames you want.
          </p>
        </>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) enqueueFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-16 text-center transition ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border bg-card/50 hover:border-primary/50"
        }`}
      >
        <UploadCloud className="h-10 w-10 text-primary" />
        <div className="mt-4 text-lg font-medium">
          Drop images or videos here, or click to browse
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          Images (JPG, PNG, WebP…) upload directly · Videos (MP4, MOV, WebM) extract sharp frames · queue multiple files
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) enqueueFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="rounded-lg border border-border bg-card p-4 text-sm">
          <div className="flex items-center justify-between">
            <span>Max frames per video</span>
            <span className="font-mono text-primary">{maxFrames}</span>
          </div>
          <input
            type="range"
            min={5}
            max={40}
            value={maxFrames}
            onChange={(e) => setMaxFrames(Number(e.target.value))}
            className="mt-2 w-full accent-primary"
          />
        </label>
        <label className="rounded-lg border border-border bg-card p-4 text-sm">
          <div className="flex items-center justify-between">
            <span>Sample every</span>
            <span className="font-mono text-primary">{sampleMs} ms</span>
          </div>
          <input
            type="range"
            min={250}
            max={3000}
            step={250}
            value={sampleMs}
            onChange={(e) => setSampleMs(Number(e.target.value))}
            className="mt-2 w-full accent-primary"
          />
          <div className="mt-1 text-xs text-muted-foreground">
            Lower = more candidates, slower analysis.
          </div>
        </label>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Geotag frames</div>
            <div className="text-xs text-muted-foreground">
              Pick a location (e.g. Al Qusais, Dubai). Every extracted frame gets these coordinates.
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={autoGeotag}
              onChange={(e) => setAutoGeotag(e.target.checked)}
              className="accent-primary"
            />
            Auto-apply on upload
          </label>
        </div>
        <LocationPicker value={location} onChange={setLocation} />
      </div>

      {queue.length > 0 && (
        <div className="mt-8 rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium">
              Upload queue{" "}
              <span className="text-muted-foreground">({queue.length})</span>
            </div>
            {hasFinished && (
              <button
                onClick={clearFinished}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Clear completed
              </button>
            )}
          </div>
          <ul className="space-y-2">
            {queue.map((q) => (
              <QueueRow key={q.id} item={q} onRetry={() => retry(q.id)} onRemove={() => remove(q.id)} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function QueueRow({
  item,
  onRetry,
  onRemove,
}: {
  item: QueueItem;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const active =
    item.stage === "extracting" || item.stage === "uploading" || item.stage === "saving";
  const pct = Math.round(item.progress * 100);

  return (
    <li className="rounded-md border border-border/60 bg-background/50 p-3">
      <div className="flex items-center gap-3">
        <StatusIcon stage={item.stage} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-sm font-medium">{item.file.name}</div>
            <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              <span>{(item.file.size / (1024 * 1024)).toFixed(1)} MB</span>
              {active && <span className="font-mono">{pct}%</span>}
            </div>
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {item.stage === "error" ? item.error : item.message}
          </div>
          {(active || item.stage === "done") && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full transition-all ${
                  item.stage === "done" ? "bg-emerald-500" : "bg-primary"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {item.stage === "error" && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
            >
              <RotateCw className="h-3 w-3" /> Retry
            </button>
          )}
          {(item.stage === "pending" || item.stage === "error" || item.stage === "done") && (
            <button
              onClick={onRemove}
              aria-label="Remove from queue"
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function StatusIcon({ stage }: { stage: QueueStage }) {
  if (stage === "done")
    return <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />;
  if (stage === "error")
    return <XCircle className="h-5 w-5 shrink-0 text-destructive" />;
  if (stage === "pending")
    return <Clock className="h-5 w-5 shrink-0 text-muted-foreground" />;
  return <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />;
}
