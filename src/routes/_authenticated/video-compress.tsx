import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Scissors, Download, Loader2, CheckCircle2, Crop as CropIcon } from "lucide-react";
import { toast } from "sonner";
import {
  loadFFmpeg, fetchFile, humanSize, downloadBlob, formatDuration,
  validateVideoFileBasic, validateVideoFile, MAX_VIDEO_DURATION_SECONDS,
} from "@/lib/ffmpeg-client";

export const Route = createFileRoute("/_authenticated/video-compress")({
  component: VideoCompressPage,
});

type Crop = { x: number; y: number; w: number; h: number };

function VideoCompressPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [quality, setQuality] = useState(28); // CRF: lower = better quality, larger file
  const [scale, setScale] = useState(100); // % of original
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<{ blob: Blob; name: string; size: number } | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const videoRef = useRef<HTMLVideoElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; box: DOMRect } | null>(null);

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
    setStartedAt(Date.now());
    setNow(Date.now());
    setStatus("Loading engine…");
    try {
      const ff = await loadFFmpeg(undefined, (p) => setProgress(Math.max(0, Math.min(1, p))));
      const inputName = "input" + (file.name.match(/\.[^.]+$/)?.[0] ?? "");
      const outputName = "output.mp4";
      setStatus("Reading file…");
      await ff.writeFile(inputName, await fetchFile(file));

      // Ensure even dims for libx264
      const cw = crop.w - (crop.w % 2);
      const ch = crop.h - (crop.h % 2);
      const targetW = Math.max(2, Math.round((cw * scale) / 100));
      const targetH = Math.max(2, Math.round((ch * scale) / 100));
      const outW = targetW - (targetW % 2);
      const outH = targetH - (targetH % 2);

      const filters = [
        `crop=${cw}:${ch}:${crop.x}:${crop.y}`,
        `scale=${outW}:${outH}`,
      ].join(",");

      setStatus("Encoding…");
      await ff.exec([
        "-i", inputName,
        "-vf", filters,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", String(quality),
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        outputName,
      ]);

      const data = await ff.readFile(outputName);
      const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
      const ab = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(ab).set(bytes);
      const blob = new Blob([ab], { type: "video/mp4" });
      const outName = file.name.replace(/\.[^.]+$/, "") + "-compressed.mp4";
      setResult({ blob, name: outName, size: blob.size });
      setStatus("Done");
      toast.success(`Reduced from ${humanSize(file.size)} to ${humanSize(blob.size)}`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Processing failed");
      setStatus("Failed");
    } finally {
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
          {crop && dims && (
            <div className="rounded-md border border-border/60 bg-background/60 p-3 text-xs">
              <div className="font-medium text-foreground">Crop region</div>
              <div className="mt-1 text-muted-foreground">
                {crop.w}×{crop.h} at ({crop.x},{crop.y})
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
                onClick={() => downloadBlob(result.blob, result.name)}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md border border-border/70 bg-card px-3 py-1.5 text-sm hover:bg-accent"
              >
                <Download className="h-4 w-4" /> Download MP4
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
