import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { FileVideo, Download, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  loadFFmpeg, fetchFile, humanSize, downloadBlob, formatDuration,
  validateVideoFileBasic, validateVideoFile,
} from "@/lib/ffmpeg-client";

export const Route = createFileRoute("/_authenticated/video-converter")({
  component: VideoConverterPage,
});

function VideoConverterPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>("");
  const [result, setResult] = useState<{ blob: Blob; name: string; size: number } | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

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
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
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
          <div className="mt-6 flex items-center justify-between rounded-lg border border-border/60 bg-background/60 p-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <div className="text-sm">
                <div className="font-medium">{result.name}</div>
                <div className="text-xs text-muted-foreground">{humanSize(result.size)}</div>
              </div>
            </div>
            <button
              onClick={() => downloadBlob(result.blob, result.name)}
              className="inline-flex items-center gap-2 rounded-md border border-border/70 bg-card px-3 py-1.5 text-sm hover:bg-accent"
            >
              <Download className="h-4 w-4" /> Download
            </button>
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
