import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { UploadCloud } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { extractSharpFrames } from "@/lib/ffmpeg-extract";
import { LocationPicker, type PickedLocation } from "@/components/LocationPicker";

export const Route = createFileRoute("/_authenticated/upload")({
  component: UploadPage,
});

type Stage = "idle" | "uploading" | "extracting" | "saving" | "done";

function UploadPage() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [maxFrames, setMaxFrames] = useState(15);
  const [sampleMs, setSampleMs] = useState(1000);
  const [dragOver, setDragOver] = useState(false);
  const [location, setLocation] = useState<PickedLocation | null>(null);
  const [autoGeotag, setAutoGeotag] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("video/")) {
        toast.error("Please choose a video file.");
        return;
      }
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        toast.error("Not signed in.");
        return;
      }

      try {
        // 1. Extract frames locally
        setStage("extracting");
        setMessage("Analyzing video…");
        const { frames, durationSeconds } = await extractSharpFrames(file, {
          sampleEveryMs: sampleMs,
          maxFrames,
          onProgress: (p) => {
            setProgress(p.progress);
            if (p.message) setMessage(p.message);
          },
        });

        if (frames.length === 0) {
          toast.error("Couldn't extract any frames from this video.");
          setStage("idle");
          return;
        }

        // 2. Upload the original video
        setStage("uploading");
        setMessage("Uploading video…");
        setProgress(0);
        const videoPath = `${userId}/${crypto.randomUUID()}-${file.name}`;
        const { error: vErr } = await supabase.storage
          .from("videos")
          .upload(videoPath, file, { upsert: false, contentType: file.type });
        if (vErr) throw vErr;

        // 3. Insert video row
        const { data: videoRow, error: vRowErr } = await supabase
          .from("videos")
          .insert({
            owner_id: userId,
            storage_path: videoPath,
            original_name: file.name,
            duration_seconds: durationSeconds,
            size_bytes: file.size,
            frame_count: frames.length,
            status: "ready",
          })
          .select("id")
          .single();
        if (vRowErr) throw vRowErr;

        // 4. Upload each frame + insert row
        setStage("saving");
        setMessage("Saving frames…");
        const baseName = file.name.replace(/\.[^.]+$/, "");
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
          setProgress((i + 1) / frames.length);
          setMessage(`Saved ${i + 1}/${frames.length}`);
        }

        setStage("done");
        toast.success(`Extracted ${frames.length} sharp frames.`);
        setTimeout(() => navigate({ to: "/library" }), 800);
      } catch (err) {
        console.error(err);
        toast.error(err instanceof Error ? err.message : "Upload failed");
        setStage("idle");
      }
    },
    [maxFrames, sampleMs, navigate, location, autoGeotag],
  );

  return (
    <div className="w-full py-6 pl-6 md:py-10 md:pl-10" style={{ paddingRight: 50 }}>
      <h1 className="text-3xl">Upload a video</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Extraction runs entirely in your browser. Nothing leaves your machine until
        you have the frames you want.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={`mt-8 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-16 text-center transition ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border bg-card/50 hover:border-primary/50"
        }`}
      >
        <UploadCloud className="h-10 w-10 text-primary" />
        <div className="mt-4 text-lg font-medium">
          Drop your video here, or click to browse
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          MP4, MOV, WebM · up to a few hundred MB
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
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

      {stage !== "idle" && (
        <div className="mt-8 rounded-lg border border-border bg-card p-4">
          <div className="mb-2 flex justify-between text-sm">
            <span className="capitalize">{stage}</span>
            <span className="text-muted-foreground">{message}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
