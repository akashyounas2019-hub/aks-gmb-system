import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Scissors, Download, Loader2, CheckCircle2, Crop as CropIcon, Save } from "lucide-react";
import { toast } from "sonner";
import {
  loadFFmpeg, getFFmpeg, fetchFile, humanSize, downloadBlob, formatDuration,
  validateVideoFileBasic, validateVideoFile, MAX_VIDEO_DURATION_SECONDS,
} from "@/lib/ffmpeg-client";
import { uploadBlobWithProgress, getCurrentUserId } from "@/lib/storage-upload";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/video-compress")({
  component: VideoCompressPage,
});

type Crop = { x: number; y: number; w: number; h: number };

function VideoCompressPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [duration, setDuration] = useState<number | null>(null); // seconds
  const [trim, setTrim] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [crop, setCrop] = useState<Crop | null>(null);
  const [quality, setQuality] = useState(28); // CRF: lower = better quality, larger file
  const [scale, setScale] = useState(100); // % of original
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<{ blob: Blob; name: string; size: number } | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [comparePct, setComparePct] = useState(50);
  const [isPlaying, setIsPlaying] = useState(false);
  const [curTime, setCurTime] = useState(0);
  const [fps, setFps] = useState(30);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [saving, setSaving] = useState(false);
  const [savePct, setSavePct] = useState(0);
  const [saved, setSaved] = useState(false);

  async function saveToLibrary() {
    if (!result) return;
    setSaving(true);
    setSavePct(0);
    setSaved(false);
    try {
      const userId = await getCurrentUserId();
      const path = `${userId}/${crypto.randomUUID()}-${result.name}`;
      await uploadBlobWithProgress({
        bucket: "videos",
        path,
        blob: result.blob,
        contentType: "video/mp4",
        onProgress: (p) => setSavePct(p.pct),
      });
      const { error } = await supabase.from("videos").insert({
        owner_id: userId,
        storage_path: path,
        original_name: result.name,
        size_bytes: result.size,
        status: "ready",
      });
      if (error) throw error;
      setSaved(true);
      toast.success("Saved to library");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }
  const videoRef = useRef<HTMLVideoElement>(null);
  const beforeCmpRef = useRef<HTMLVideoElement>(null);
  const afterCmpRef = useRef<HTMLVideoElement>(null);
  const compareBoxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; box: DOMRect } | null>(null);
  const compareDragRef = useRef(false);

  useEffect(() => {
    if (!result) {
      setResultUrl(null);
      return;
    }
    const url = URL.createObjectURL(result.blob);
    setResultUrl(url);
    setComparePct(50);
    return () => URL.revokeObjectURL(url);
  }, [result]);

  // Keep the two comparison players in sync while scrubbing/playing.
  function syncPlay() {
    const b = beforeCmpRef.current, a = afterCmpRef.current;
    if (!b || !a) return;
    a.currentTime = b.currentTime;
    if (!b.paused) a.play().catch(() => {});
    setIsPlaying(true);
  }
  function syncPause() {
    const a = afterCmpRef.current;
    if (a) a.pause();
    setIsPlaying(false);
  }
  function syncSeek() {
    const b = beforeCmpRef.current, a = afterCmpRef.current;
    if (b && a) a.currentTime = b.currentTime;
    if (b) setCurTime(b.currentTime);
  }

  function togglePlay() {
    const b = beforeCmpRef.current;
    if (!b) return;
    if (b.paused) b.play().catch(() => {});
    else b.pause();
  }
  function stepFrame(dir: 1 | -1) {
    const b = beforeCmpRef.current, a = afterCmpRef.current;
    if (!b) return;
    b.pause();
    a?.pause();
    const step = 1 / Math.max(1, fps);
    const next = Math.max(0, Math.min((b.duration || 0) - 0.0001, b.currentTime + dir * step));
    b.currentTime = next;
    if (a) a.currentTime = next;
    setCurTime(next);
    setIsPlaying(false);
  }
  function seekToPct(pct: number) {
    const b = beforeCmpRef.current, a = afterCmpRef.current;
    if (!b || !b.duration) return;
    const t = (pct / 100) * b.duration;
    b.currentTime = t;
    if (a) a.currentTime = t;
    setCurTime(t);
  }
  function fmtTime(t: number) {
    if (!isFinite(t) || t < 0) t = 0;
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const cs = Math.floor((t - Math.floor(t)) * 100);
    return `${m}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
  }

  function updateCompareFromEvent(clientX: number) {
    const box = compareBoxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setComparePct(pct);
  }

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [busy]);

  const elapsedMs = startedAt ? now - startedAt : 0;
  const etaMs = startedAt && progress > 0.02 ? Math.max(0, (elapsedMs / progress) * (1 - progress)) : null;

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      setDims(null);
      setCrop(null);
      setDuration(null);
      setTrim({ start: 0, end: 0 });
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function onLoadedMeta() {
    const v = videoRef.current;
    if (!v) return;
    setDims({ w: v.videoWidth, h: v.videoHeight });
    setCrop({ x: 0, y: 0, w: v.videoWidth, h: v.videoHeight });
    const d = Number.isFinite(v.duration) ? v.duration : null;
    setDuration(d);
    if (d && d > 0) setTrim({ start: 0, end: d });
  }

  function startDrag(e: React.MouseEvent<HTMLDivElement>) {
    if (!videoRef.current || !dims) return;
    const box = e.currentTarget.getBoundingClientRect();
    dragRef.current = { startX: e.clientX - box.left, startY: e.clientY - box.top, box };
  }
  function moveDrag(e: React.MouseEvent<HTMLDivElement>) {
    if (!dragRef.current || !dims) return;
    const { startX, startY, box } = dragRef.current;
    const curX = e.clientX - box.left;
    const curY = e.clientY - box.top;
    const x1 = Math.max(0, Math.min(startX, curX));
    const y1 = Math.max(0, Math.min(startY, curY));
    const x2 = Math.min(box.width, Math.max(startX, curX));
    const y2 = Math.min(box.height, Math.max(startY, curY));
    const sx = dims.w / box.width;
    const sy = dims.h / box.height;
    setCrop({
      x: Math.round(x1 * sx),
      y: Math.round(y1 * sy),
      w: Math.max(2, Math.round((x2 - x1) * sx)),
      h: Math.max(2, Math.round((y2 - y1) * sy)),
    });
  }
  function endDrag() {
    dragRef.current = null;
  }
  function resetCrop() {
    if (dims) setCrop({ x: 0, y: 0, w: dims.w, h: dims.h });
  }

  const displayBox = (() => {
    if (!crop || !dims || !videoRef.current) return null;
    const el = videoRef.current;
    const dw = el.clientWidth || 1;
    const dh = el.clientHeight || 1;
    return {
      left: (crop.x / dims.w) * dw,
      top: (crop.y / dims.h) * dh,
      width: (crop.w / dims.w) * dw,
      height: (crop.h / dims.h) * dh,
    };
  })();

  async function run() {
    if (!file || !crop || !dims) return;
    // Enforce duration limit here — dims/duration are already loaded via <video> metadata.
    const video = videoRef.current;
    if (video && Number.isFinite(video.duration) && video.duration > MAX_VIDEO_DURATION_SECONDS) {
      toast.error(`Video exceeds the ${formatDuration(MAX_VIDEO_DURATION_SECONDS * 1000)} in-browser limit.`);
      return;
    }
    // Re-check basic constraints defensively.
    const err = await validateVideoFile(file);
    if (err) {
      toast.error(err.message);
      return;
    }
    setBusy(true);
    setProgress(0);
    setResult(null);
    setSaved(false);
    setSavePct(0);
    setStartedAt(Date.now());
    setNow(Date.now());
    setStatus("Loading engine…");
    // Capture ffmpeg log for real error surfacing.
    const logs: string[] = [];
    let logHandler: ((e: { message: string }) => void) | null = null;
    try {
      const ff = await loadFFmpeg(undefined, (p) => setProgress(Math.max(0, Math.min(1, p))));
      logHandler = ({ message }) => {
        logs.push(message);
        if (logs.length > 200) logs.shift();
      };
      ff.on("log", logHandler);

      const inputName = "input" + (file.name.match(/\.[^.]+$/)?.[0] ?? "");
      const outputName = "output.mp4";
      setStatus("Reading file…");
      await ff.writeFile(inputName, await fetchFile(file));

      // Clamp + even crop dims for libx264 (odd or zero dims cause an "Invalid argument" abort).
      const clampedW = Math.max(2, Math.min(crop.w, dims.w - crop.x));
      const clampedH = Math.max(2, Math.min(crop.h, dims.h - crop.y));
      const cw = Math.max(2, clampedW - (clampedW % 2));
      const ch = Math.max(2, clampedH - (clampedH % 2));
      const cx = Math.max(0, Math.min(crop.x, dims.w - cw));
      const cy = Math.max(0, Math.min(crop.y, dims.h - ch));
      const targetW = Math.max(2, Math.round((cw * scale) / 100));
      const targetH = Math.max(2, Math.round((ch * scale) / 100));
      const outW = Math.max(2, targetW - (targetW % 2));
      const outH = Math.max(2, targetH - (targetH % 2));

      const filters = [`crop=${cw}:${ch}:${cx}:${cy}`, `scale=${outW}:${outH}`].join(",");

      // Trim: use -ss BEFORE -i for fast seek, then -t for duration (more reliable than -to across builds).
      const trimStart = Math.max(0, trim.start);
      const trimDur = Math.max(0.05, trim.end - trim.start);
      const trimActive = duration !== null && (trimStart > 0.01 || trim.end < duration - 0.01);

      const args: string[] = [];
      if (trimActive) args.push("-ss", trimStart.toFixed(3));
      args.push("-i", inputName);
      if (trimActive) args.push("-t", trimDur.toFixed(3));
      args.push(
        // Take the first video stream; make audio optional so silent videos don't fail.
        "-map", "0:v:0",
        "-map", "0:a?",
        "-vf", filters,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", String(quality),
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        "-pix_fmt", "yuv420p",
        outputName,
      );

      setStatus(trimActive ? "Encoding (trim + crop)…" : "Encoding…");
      await ff.exec(args);

      const data = await ff.readFile(outputName);
      const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
      const ab = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(ab).set(bytes);
      const blob = new Blob([ab], { type: "video/mp4" });
      const outName = file.name.replace(/\.[^.]+$/, "") + "-compressed.mp4";
      setResult({ blob, name: outName, size: blob.size });
      setStatus("Done");
      // Best-effort cleanup of in-memory FS.
      try { await ff.deleteFile(inputName); } catch { /* ignore */ }
      try { await ff.deleteFile(outputName); } catch { /* ignore */ }
      toast.success(`Reduced from ${humanSize(file.size)} to ${humanSize(blob.size)}`);
    } catch (err) {
      console.error("[compress] ffmpeg failed", err, "\nlast ffmpeg logs:\n" + logs.slice(-25).join("\n"));
      const ffErr = logs.slice().reverse().find((l) =>
        /error|invalid|failed|no such|unsupported|does not contain/i.test(l),
      );
      const baseMsg = err instanceof Error && err.message ? err.message : "Processing failed";
      toast.error(ffErr ? `${baseMsg}: ${ffErr}` : baseMsg);
      setStatus("Failed");
    } finally {
      if (logHandler) {
        try { getFFmpeg().off("log", logHandler); } catch { /* ignore */ }
      }
      setBusy(false);
    }
  }

  return (
    <div className="w-full px-6 py-6 md:px-10 md:py-10">
      <div className="mb-6 flex items-center gap-2">
        <Scissors className="h-5 w-5 text-primary" />
        <h1 className="text-3xl">Compress & Crop</h1>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Reduce file size and crop your video. Drag on the preview to draw a crop region. Runs entirely in your browser.
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-xl border border-border/60 bg-card p-4">
          {!previewUrl ? (
            <label
              htmlFor="vc-input"
              className="flex h-64 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border/60 bg-background/50 text-sm text-muted-foreground hover:border-primary/60"
            >
              <Scissors className="h-8 w-8" />
              Click to select a video
            </label>
          ) : (
            <div
              className="relative select-none overflow-hidden rounded-lg bg-black"
              onMouseDown={startDrag}
              onMouseMove={moveDrag}
              onMouseUp={endDrag}
              onMouseLeave={endDrag}
            >
              <video
                ref={videoRef}
                src={previewUrl}
                onLoadedMetadata={onLoadedMeta}
                controls
                className="max-h-[520px] w-full"
              />
              {displayBox && (
                <div
                  className="pointer-events-none absolute border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]"
                  style={{
                    left: displayBox.left,
                    top: displayBox.top,
                    width: displayBox.width,
                    height: displayBox.height,
                  }}
                />
              )}
            </div>
          )}
          <input
            id="vc-input"
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setResult(null);
              if (f) {
                const err = validateVideoFileBasic(f);
                if (err) {
                  toast.error(err.message);
                  setFile(null);
                  e.target.value = "";
                  return;
                }
              }
              setFile(f);
            }}
          />
          {file && (
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>{file.name} · {humanSize(file.size)}{dims ? ` · ${dims.w}×${dims.h}` : ""}</span>
              <button onClick={resetCrop} className="inline-flex items-center gap-1 rounded-md border border-border/70 px-2 py-1 hover:bg-accent">
                <CropIcon className="h-3 w-3" /> Reset crop
              </button>
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-xl border border-border/60 bg-card p-5">
          <div>
            <label className="text-sm font-medium">Quality (CRF {quality})</label>
            <input
              type="range" min={18} max={40} value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="mt-2 w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Best (18)</span><span>Smallest (40)</span>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Resolution scale ({scale}%)</label>
            <input
              type="range" min={25} max={100} step={5} value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="mt-2 w-full"
            />
          </div>
          {duration !== null && duration > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Trim</span>
                <span className="tabular-nums text-xs text-muted-foreground">
                  {formatDuration(trim.start * 1000)} → {formatDuration(trim.end * 1000)}
                  <span className="ml-1">({formatDuration(Math.max(0, trim.end - trim.start) * 1000)})</span>
                </span>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Start</label>
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={0.1}
                  value={trim.start}
                  onChange={(e) => {
                    const s = Number(e.target.value);
                    setTrim((t) => ({ start: Math.min(s, t.end - 0.1), end: t.end }));
                  }}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">End</label>
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={0.1}
                  value={trim.end}
                  onChange={(e) => {
                    const en = Number(e.target.value);
                    setTrim((t) => ({ start: t.start, end: Math.max(en, t.start + 0.1) }));
                  }}
                  className="w-full"
                />
              </div>
              <button
                type="button"
                onClick={() => setTrim({ start: 0, end: duration })}
                className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Reset to full length
              </button>
            </div>
          )}
          {crop && dims && (
            <div className="rounded-md border border-border/60 bg-background/60 p-3 text-xs">
              <div className="font-medium text-foreground">Crop region</div>
              <div className="mt-1 text-muted-foreground">
                {crop.w}×{crop.h} at ({crop.x},{crop.y})
              </div>
            </div>
          )}
          {estimate && (
            <div className="rounded-md border border-border/60 bg-background/60 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">Estimated output</span>
                <span
                  className={
                    estimate.savingsPct >= 0
                      ? "rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400"
                      : "rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400"
                  }
                >
                  {estimate.savingsPct >= 0
                    ? `~${estimate.savingsPct}% smaller`
                    : `~${Math.abs(estimate.savingsPct)}% larger`}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-muted-foreground tabular-nums">
                <span>~{humanSize(estimate.sizeBytes)}</span>
                <span className="text-[10px]">from {humanSize(file!.size)}</span>
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {estimate.outW}×{estimate.outH} · {formatDuration(estimate.durSec * 1000)} · CRF {quality}
                <span className="ml-1 opacity-70">(rough estimate, actual varies with motion)</span>
              </div>
            </div>
          )}
          <button
            onClick={run}
            disabled={!file || busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
            Compress & crop
          </button>
          {busy && (
            <div className="text-xs text-muted-foreground">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate">{status}</span>
                <span className="tabular-nums">{Math.round(progress * 100)}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent/40">
                <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <div className="mt-1 flex justify-between tabular-nums">
                <span>{formatDuration(elapsedMs)} elapsed</span>
                <span>{etaMs !== null ? `~${formatDuration(etaMs)} left` : "estimating…"}</span>
              </div>
            </div>
          )}
          {result && (
            <div className="rounded-lg border border-border/60 bg-background/60 p-3">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="font-medium">{humanSize(result.size)}</span>
                {file && (
                  <span className="text-xs text-muted-foreground">
                    ({Math.round((1 - result.size / file.size) * 100)}% smaller)
                  </span>
                )}
              </div>
              <button
                onClick={saveToLibrary}
                disabled={saving || saved}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saved ? "Saved" : saving ? "Saving…" : "Save to library"}
              </button>
              <button
                onClick={() => downloadBlob(result.blob, result.name)}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md border border-border/70 bg-card px-3 py-1.5 text-sm hover:bg-accent"
              >
                <Download className="h-4 w-4" /> Download MP4
              </button>
              {(saving || saved) && (
                <div className="mt-2 text-xs text-muted-foreground">
                  <div className="mb-1 flex items-center justify-between">
                    <span>{saved ? "Uploaded to library" : "Uploading…"}</span>
                    <span className="tabular-nums">{Math.round(savePct * 100)}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent/40">
                    <div
                      className={`h-full transition-all ${saved ? "bg-emerald-500" : "bg-primary"}`}
                      style={{ width: `${Math.round(savePct * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {result && resultUrl && previewUrl && (
        <div className="mt-6 rounded-xl border border-border/60 bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-medium">Before / after preview</span>
              <span className="ml-2 text-xs text-muted-foreground">
                Drag the divider · use the Before player's controls to scrub
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              <span className="rounded bg-accent/40 px-2 py-0.5">Original {humanSize(file!.size)}</span>
              <span className="rounded bg-primary/20 px-2 py-0.5 text-foreground">Compressed {humanSize(result.size)}</span>
            </div>
          </div>

          <div
            ref={compareBoxRef}
            className="relative select-none overflow-hidden rounded-lg bg-black"
            onMouseMove={(e) => { if (compareDragRef.current) updateCompareFromEvent(e.clientX); }}
            onMouseUp={() => { compareDragRef.current = false; }}
            onMouseLeave={() => { compareDragRef.current = false; }}
            onTouchMove={(e) => { if (compareDragRef.current && e.touches[0]) updateCompareFromEvent(e.touches[0].clientX); }}
            onTouchEnd={() => { compareDragRef.current = false; }}
          >
            <video
              ref={beforeCmpRef}
              src={previewUrl}
              muted
              playsInline
              onPlay={syncPlay}
              onPause={syncPause}
              onSeeked={syncSeek}
              onLoadedMetadata={() => {
                const b = beforeCmpRef.current;
                if (b) setCurTime(b.currentTime);
              }}
              onTimeUpdate={() => {
                const b = beforeCmpRef.current, a = afterCmpRef.current;
                if (!b) return;
                setCurTime(b.currentTime);
                if (a && Math.abs(b.currentTime - a.currentTime) > 0.25) a.currentTime = b.currentTime;
              }}
              className="block max-h-[560px] w-full"
            />
            <div
              className="pointer-events-none absolute inset-0 overflow-hidden"
              style={{ clipPath: `inset(0 0 0 ${comparePct}%)` }}
            >
              <video
                ref={afterCmpRef}
                src={resultUrl}
                muted
                playsInline
                className="block h-full w-full object-contain"
              />
            </div>
            <div
              className="absolute inset-y-0 w-0.5 -translate-x-1/2 cursor-ew-resize bg-primary shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
              style={{ left: `${comparePct}%` }}
              onMouseDown={(e) => { compareDragRef.current = true; updateCompareFromEvent(e.clientX); e.preventDefault(); }}
              onTouchStart={(e) => { compareDragRef.current = true; if (e.touches[0]) updateCompareFromEvent(e.touches[0].clientX); }}
            >
              <div className="absolute top-1/2 left-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </div>
            <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white">
              Before
            </div>
            <div className="pointer-events-none absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white">
              After
            </div>
          </div>

          {/* Playback + frame-step controls (kept in sync across both players) */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { const b = beforeCmpRef.current; if (b) { b.pause(); b.currentTime = 0; } const a = afterCmpRef.current; if (a) a.currentTime = 0; setCurTime(0); setIsPlaying(false); }}
              className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs hover:bg-accent"
              aria-label="Jump to start"
              title="Jump to start"
            >⏮</button>
            <button
              type="button"
              onClick={() => stepFrame(-1)}
              className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs hover:bg-accent"
              aria-label="Previous frame"
              title="Previous frame"
            >⏪ Frame</button>
            <button
              type="button"
              onClick={togglePlay}
              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
              aria-label={isPlaying ? "Pause" : "Play"}
            >{isPlaying ? "⏸ Pause" : "▶ Play"}</button>
            <button
              type="button"
              onClick={() => stepFrame(1)}
              className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs hover:bg-accent"
              aria-label="Next frame"
              title="Next frame"
            >Frame ⏩</button>
            <button
              type="button"
              onClick={() => { const b = beforeCmpRef.current; if (!b || !b.duration) return; b.pause(); b.currentTime = b.duration; const a = afterCmpRef.current; if (a) a.currentTime = b.duration; setCurTime(b.duration); setIsPlaying(false); }}
              className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs hover:bg-accent"
              aria-label="Jump to end"
              title="Jump to end"
            >⏭</button>

            <div className="ml-2 font-mono text-xs tabular-nums text-muted-foreground">
              {fmtTime(curTime)} / {fmtTime(beforeCmpRef.current?.duration ?? 0)}
            </div>

            <label className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              fps
              <input
                type="number"
                min={1}
                max={240}
                value={fps}
                onChange={(e) => setFps(Math.max(1, Math.min(240, Number(e.target.value) || 30)))}
                className="w-14 rounded-md border border-border/60 bg-background px-1 py-0.5 text-right font-mono text-xs"
                aria-label="Frames per second for stepping"
              />
            </label>
          </div>

          {/* Scrub timeline — moves both videos together */}
          <input
            type="range"
            min={0}
            max={100}
            step={0.01}
            value={beforeCmpRef.current?.duration ? (curTime / beforeCmpRef.current.duration) * 100 : 0}
            onChange={(e) => seekToPct(Number(e.target.value))}
            aria-label="Scrub timeline"
            className="mt-2 w-full"
          />

          <div className="mt-3 border-t border-border/40 pt-3">
            <div className="mb-1 text-xs text-muted-foreground">Before / after divider</div>

          <input
            type="range"
            min={0}
            max={100}
            step={0.5}
            value={comparePct}
            onChange={(e) => setComparePct(Number(e.target.value))}
            aria-label="Before/after divider position"
            className="mt-3 w-full"
          />
          </div>
        </div>
      )}
    </div>
  );
}
