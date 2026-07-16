import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { FileVideo, Download, Loader2, CheckCircle2, AlertCircle, Save } from "lucide-react";
import { toast } from "sonner";
import {
  loadFFmpeg, fetchFile, humanSize, downloadBlob, formatDuration,
  validateVideoFileBasic, validateVideoFile,
} from "@/lib/ffmpeg-client";
import { uploadBlobWithProgress, getCurrentUserId } from "@/lib/storage-upload";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/video-converter")({
  component: VideoConverterPage,
});

function VideoConverterPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>("");
  const [result, setResult] = useState<{ blob: Blob; name: string; size: number } | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [saving, setSaving] = useState(false);
  const [savePct, setSavePct] = useState(0);
  const [saved, setSaved] = useState(false);

  // Before/after comparison state
  const [comparePct, setComparePct] = useState(50);
  const [isPlaying, setIsPlaying] = useState(false);
  const [curTime, setCurTime] = useState(0);
  const [fps, setFps] = useState(30);

  const inputRef = useRef<HTMLInputElement>(null);
  const beforeCmpRef = useRef<HTMLVideoElement>(null);
  const afterCmpRef = useRef<HTMLVideoElement>(null);
  const compareBoxRef = useRef<HTMLDivElement>(null);
  const compareDragRef = useRef<boolean>(false);

  // Manage object URLs for source preview and result
  useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!result) { setResultUrl(null); return; }
    const url = URL.createObjectURL(result.blob);
    setResultUrl(url);
    setComparePct(50);
    setCurTime(0);
    setIsPlaying(false);
    return () => URL.revokeObjectURL(url);
  }, [result]);

  // Sync helpers for the two comparison players
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

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [busy]);

  const elapsedMs = startedAt ? now - startedAt : 0;
  const etaMs = startedAt && progress > 0.02 ? Math.max(0, (elapsedMs / progress) * (1 - progress)) : null;

  async function convert() {
    if (!file) return;
    // Full validation (including duration probe) before spinning up ffmpeg.
    setStatus("Checking file…");
    const err = await validateVideoFile(file);
    if (err) {
      setStatus("");
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
    setStatus("Loading converter…");
    try {
      const ff = await loadFFmpeg(undefined, (p) => setProgress(Math.max(0, Math.min(1, p))));
      const inputName = "input" + (file.name.match(/\.[^.]+$/)?.[0] ?? "");
      const outputName = "output.mp4";
      setStatus("Reading file…");
      await ff.writeFile(inputName, await fetchFile(file));

      setStatus("Remuxing to MP4 (lossless stream copy)…");
      // Try lossless remux first — no re-encode, zero quality loss.
      let ok = false;
      try {
        await ff.exec(["-i", inputName, "-c", "copy", "-movflags", "+faststart", outputName]);
        ok = true;
      } catch {
        ok = false;
      }

      if (!ok) {
        setStatus("Codec not MP4-compatible — re-encoding at visually lossless quality…");
        await ff.exec([
          "-i", inputName,
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
          "-c:a", "aac", "-b:a", "192k",
          "-movflags", "+faststart",
          outputName,
        ]);
      }

      const data = await ff.readFile(outputName);
      const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
      const ab = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(ab).set(bytes);
      const blob = new Blob([ab], { type: "video/mp4" });
      const outName = file.name.replace(/\.[^.]+$/, "") + ".mp4";
      setResult({ blob, name: outName, size: blob.size });
      setStatus("Done");
      toast.success("Conversion complete");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Conversion failed");
      setStatus("Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full px-6 py-6 md:px-10 md:py-10">
      <div className="mb-6 flex items-center gap-2">
        <FileVideo className="h-5 w-5 text-primary" />
        <h1 className="text-3xl">Video Converter</h1>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Convert any video to MP4 in your browser. Uses lossless stream copy when possible — no quality loss.
        Files never leave your device.
      </p>

      <div className="rounded-xl border border-border/60 bg-card p-6">
        <label
          htmlFor="video-input"
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border/60 bg-background/50 px-6 py-10 text-center transition hover:border-primary/60 hover:bg-accent/30"
        >
          <FileVideo className="h-8 w-8 text-muted-foreground" />
          <div className="text-sm">
            {file ? (
              <><span className="font-medium">{file.name}</span> · {humanSize(file.size)}</>
            ) : (
              <>Click to select a video file (MOV, AVI, MKV, WEBM, FLV, WMV, etc.)</>
            )}
          </div>
        </label>
        <input
          ref={inputRef}
          id="video-input"
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setResult(null);
            setSaved(false);
            setSavePct(0);
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

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={convert}
            disabled={!file || busy}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileVideo className="h-4 w-4" />}
            Convert to MP4
          </button>
          {busy && (
            <div className="flex-1 text-xs text-muted-foreground">
              <div className="mb-1 flex items-center justify-between gap-3">
                <span>{status}</span>
                <span className="tabular-nums">
                  {Math.round(progress * 100)}% · {formatDuration(elapsedMs)} elapsed
                  {etaMs !== null ? ` · ~${formatDuration(etaMs)} left` : ""}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent/40">
                <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            </div>
          )}
        </div>

        {result && (
          <div className="mt-6 rounded-lg border border-border/60 bg-background/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <div className="text-sm">
                  <div className="font-medium">{result.name}</div>
                  <div className="text-xs text-muted-foreground">{humanSize(result.size)}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={saveToLibrary}
                  disabled={saving || saved}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saved ? "Saved" : saving ? "Saving…" : "Save to library"}
                </button>
                <button
                  onClick={() => downloadBlob(result.blob, result.name)}
                  className="inline-flex items-center gap-2 rounded-md border border-border/70 bg-card px-3 py-1.5 text-sm hover:bg-accent"
                >
                  <Download className="h-4 w-4" /> Download
                </button>
              </div>
            </div>
            {(saving || saved) && (
              <div className="mt-3 text-xs text-muted-foreground">
                <div className="mb-1 flex items-center justify-between">
                  <span>{saved ? "Uploaded to library" : "Uploading to library…"}</span>
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

        {result && resultUrl && previewUrl && (
          <div className="mt-6 rounded-xl border border-border/60 bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm">
                <span className="font-medium">Before / after preview</span>
                <span className="ml-2 text-xs text-muted-foreground">Drag the divider · step frame-by-frame below</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                <span className="rounded bg-accent/40 px-2 py-0.5">Original {humanSize(file!.size)}</span>
                <span className="rounded bg-primary/20 px-2 py-0.5 text-foreground">MP4 {humanSize(result.size)}</span>
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
                onLoadedMetadata={() => { const b = beforeCmpRef.current; if (b) setCurTime(b.currentTime); }}
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
              <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white">Before</div>
              <div className="pointer-events-none absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white">After</div>
            </div>

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
                className="w-full"
              />
            </div>
          </div>
        )}

        <div className="mt-6 flex gap-2 rounded-md border border-border/60 bg-accent/20 p-3 text-xs text-muted-foreground">
          <AlertCircle className="h-4 w-4 shrink-0 text-primary" />
          <div>
            Large files may take a while — everything runs locally via WebAssembly. Keep this tab open during conversion.
          </div>
        </div>
      </div>
    </div>
  );
}
