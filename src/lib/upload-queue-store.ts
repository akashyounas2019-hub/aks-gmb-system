/**
 * Global upload queue store.
 *
 * The queue and its processor live at module scope so they survive route
 * changes — leaving the Upload tab (or the Library route entirely) no longer
 * cancels or hides in-flight work. UI components subscribe via `subscribe()`
 * (through `useSyncExternalStore`) and read snapshots with `getSnapshot()`.
 */
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { extractSharpFrames } from "@/lib/ffmpeg-extract";
import type { PickedLocation } from "@/components/LocationPicker";

export type QueueStage =
  | "pending"
  | "extracting"
  | "uploading"
  | "saving"
  | "done"
  | "error";

export interface UploadSettings {
  maxFrames: number;
  minFrames: number;
  sampleMs: number;
  /** Longest edge (px) for extracted frames. 0 = keep source resolution. */
  frameMaxDimension: number;
  autoGeotag: boolean;
  location: PickedLocation | null;
  /** Base name applied to extracted frames as "<titleName> — Frame N". Empty = use the video's filename. */
  titleName: string;
}

export interface QueueItem {
  id: string;
  file: File;
  stage: QueueStage;
  progress: number;
  message: string;
  error?: string;
  framesSaved?: number;
  framesTotal?: number;
  opts: UploadSettings;
}

type Listener = () => void;
type StoreEvent = "imageSaved" | "drained";

let items: QueueItem[] = [];
let settings: UploadSettings = {
  maxFrames: 15,
  minFrames: 10,
  sampleMs: 1000,
  // 1200px long edge matches Google's recommended Business Profile photo upload size (1200×900).
  frameMaxDimension: 1200,
  autoGeotag: true,
  location: null,
  titleName: "",
};

const listeners = new Set<Listener>();
const eventListeners: Record<StoreEvent, Set<Listener>> = {
  imageSaved: new Set(),
  drained: new Set(),
};

let processing = false;
let drainedFired = true; // Nothing to drain initially.
const cancelled = new Set<string>();

class CancelledError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "CancelledError";
  }
}

function throwIfCancelled(id: string) {
  if (cancelled.has(id)) throw new CancelledError();
}

function emit() {
  for (const l of listeners) l();
}
function fire(ev: StoreEvent) {
  for (const l of eventListeners[ev]) l();
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function onEvent(ev: StoreEvent, l: Listener): () => void {
  eventListeners[ev].add(l);
  return () => {
    eventListeners[ev].delete(l);
  };
}

export function getItemsSnapshot(): QueueItem[] {
  return items;
}

export function getSettingsSnapshot(): UploadSettings {
  return settings;
}

export function updateSettings(patch: Partial<UploadSettings>) {
  settings = { ...settings, ...patch };
  emit();
}

function patchItem(id: string, patch: Partial<QueueItem>) {
  const idx = items.findIndex((q) => q.id === id);
  if (idx < 0) return;
  items = items.map((q) => (q.id === id ? { ...q, ...patch } : q));
  emit();
}

export function enqueueFiles(files: FileList | File[]): number {
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
      opts: { ...settings },
    });
  }
  if (valid.length) {
    items = [...items, ...valid];
    drainedFired = false;
    emit();
    void drain();
  }
  return valid.length;
}

export function retryItem(id: string) {
  patchItem(id, {
    stage: "pending",
    progress: 0,
    message: "Waiting…",
    error: undefined,
  });
  drainedFired = false;
  void drain();
}

export function removeItem(id: string) {
  items = items.filter((q) => q.id !== id);
  cancelled.delete(id);
  emit();
}

/**
 * Cancel an item. If pending/done/error, removes it. If in-flight, marks it
 * for cancellation — the processor will bail at the next checkpoint and the
 * item is removed from the queue.
 */
export function cancelItem(id: string) {
  const item = items.find((q) => q.id === id);
  if (!item) return;
  if (
    item.stage === "extracting" ||
    item.stage === "uploading" ||
    item.stage === "saving"
  ) {
    cancelled.add(id);
    patchItem(id, { message: "Cancelling…" });
  } else {
    removeItem(id);
  }
}

export function clearFinished() {
  items = items.filter((q) => q.stage !== "done");
  emit();
}

async function processItem(item: QueueItem) {
  const { maxFrames, minFrames, sampleMs, frameMaxDimension, autoGeotag, location, titleName } =
    item.opts;
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in.");
  throwIfCancelled(item.id);

  // Image path — upload directly, no frame extraction.
  if (item.file.type.startsWith("image/")) {
    patchItem(item.id, { stage: "uploading", message: "Uploading image…", progress: 0.2 });
    const ext = item.file.name.split(".").pop() || "jpg";
    const imgPath = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("frames")
      .upload(imgPath, item.file, { contentType: item.file.type, upsert: false });
    if (upErr) throw upErr;
    throwIfCancelled(item.id);

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
    fire("imageSaved");
    patchItem(item.id, { stage: "done", progress: 1, message: "Uploaded" });
    return;
  }

  patchItem(item.id, { stage: "extracting", message: "Analyzing video…", progress: 0 });
  const { frames, durationSeconds } = await extractSharpFrames(item.file, {
    sampleEveryMs: sampleMs,
    maxFrames,
    minFrames,
    // 0 = keep source resolution; ffmpeg-extract treats large values as "no downscale".
    maxDimension: frameMaxDimension > 0 ? frameMaxDimension : 100000,
    onProgress: (p) => {
      if (cancelled.has(item.id)) return;
      patchItem(item.id, {
        progress: p.progress * 0.3,
        message: p.message ?? "Analyzing video…",
      });
    },
  });
  throwIfCancelled(item.id);
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
  throwIfCancelled(item.id);

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
  throwIfCancelled(item.id);

  patchItem(item.id, { stage: "saving", message: "Saving frames…", progress: 0.4 });
  const baseName = titleName.trim() || item.file.name.replace(/\.[^.]+$/, "");
  for (let i = 0; i < frames.length; i++) {
    throwIfCancelled(item.id);
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
    fire("imageSaved");
  }

  patchItem(item.id, {
    stage: "done",
    progress: 1,
    message: `Extracted ${frames.length} sharp frames`,
  });
}

async function drain() {
  if (processing) return;
  const next = items.find((q) => q.stage === "pending");
  if (!next) {
    // Drained: fire once when nothing is pending or in-flight.
    const hasWorkLeft = items.some(
      (q) =>
        q.stage === "pending" ||
        q.stage === "extracting" ||
        q.stage === "uploading" ||
        q.stage === "saving",
    );
    if (!hasWorkLeft && items.length > 0 && !drainedFired) {
      drainedFired = true;
      fire("drained");
    }
    return;
  }
  processing = true;
  try {
    await processItem(next);
  } catch (err) {
    if (err instanceof CancelledError || cancelled.has(next.id)) {
      // Cancelled by the user — drop the item silently.
      items = items.filter((q) => q.id !== next.id);
      cancelled.delete(next.id);
      emit();
    } else {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Upload failed";
      patchItem(next.id, { stage: "error", error: msg, message: msg });
      toast.error(`${next.file.name}: ${msg}`);
    }
  } finally {
    processing = false;
    void drain();
  }
}
