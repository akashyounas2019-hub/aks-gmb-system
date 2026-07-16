import { useCallback, useEffect, useRef, useState } from "react";
import {
  UploadCloud,
  CheckCircle2,
  XCircle,
  Loader2,
  RotateCw,
  X,
  Clock,
} from "lucide-react";

import { LocationPicker, type PickedLocation } from "@/components/LocationPicker";
import {
  clearFinished,
  enqueueFiles,
  onEvent,
  removeItem,
  retryItem,
  updateSettings,
  type QueueItem,
  type QueueStage,
} from "@/lib/upload-queue-store";
import { useUploadQueueItems, useUploadSettings } from "@/hooks/use-upload-queue";

export interface UploadPanelProps {
  onComplete?: () => void;
  onImageSaved?: () => void;
  showHeader?: boolean;
}

export function UploadPanel({ onComplete, onImageSaved, showHeader = true }: UploadPanelProps) {
  const queue = useUploadQueueItems();
  const settings = useUploadSettings();
  const { maxFrames, minFrames, sampleMs, autoGeotag, location } = settings;

  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep latest callbacks reachable from the global-store subscriptions.
  const onCompleteRef = useRef(onComplete);
  const onImageSavedRef = useRef(onImageSaved);
  useEffect(() => {
    onCompleteRef.current = onComplete;
    onImageSavedRef.current = onImageSaved;
  }, [onComplete, onImageSaved]);

  useEffect(() => {
    const offSaved = onEvent("imageSaved", () => onImageSavedRef.current?.());
    const offDrained = onEvent("drained", () => onCompleteRef.current?.());
    return () => {
      offSaved();
      offDrained();
    };
  }, []);

  const setLocation = useCallback((v: PickedLocation | null) => updateSettings({ location: v }), []);

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
            <span>Min frames per video</span>
            <span className="font-mono text-primary">{minFrames}</span>
          </div>
          <input
            type="range"
            min={1}
            max={40}
            value={minFrames}
            onChange={(e) => {
              const v = Number(e.target.value);
              updateSettings({ minFrames: v, ...(v > maxFrames ? { maxFrames: v } : {}) });
            }}
            className="mt-2 w-full accent-primary"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Backfills with the sharpest remaining frames if the video is short or evenly lit.
          </p>
        </label>
        <label className="rounded-lg border border-border bg-card p-4 text-sm">
          <div className="flex items-center justify-between">
            <span>Max frames per video</span>
            <span className="font-mono text-primary">{maxFrames}</span>
          </div>
          <input
            type="range"
            min={1}
            max={40}
            value={maxFrames}
            onChange={(e) => {
              const v = Number(e.target.value);
              updateSettings({ maxFrames: v, ...(v < minFrames ? { minFrames: v } : {}) });
            }}
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
            onChange={(e) => updateSettings({ sampleMs: Number(e.target.value) })}
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
              onChange={(e) => updateSettings({ autoGeotag: e.target.checked })}
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
              <QueueRow key={q.id} item={q} onRetry={() => retryItem(q.id)} onRemove={() => removeItem(q.id)} />
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
