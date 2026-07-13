import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  UploadCloud,
  Scissors,
  ImageIcon,
  MapPin,
  Send,
  Check,
  Loader2,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { extractSharpFrames, type ExtractedFrame } from "@/lib/ffmpeg-extract";
import { sendImagesToGhl } from "@/lib/ghl.functions";

export const Route = createFileRoute("/_authenticated/wizard")({
  component: WizardPage,
});

type Step = 1 | 2 | 3 | 4 | 5;

interface PendingFrame extends ExtractedFrame {
  previewUrl: string;
  selected: boolean;
}

interface SavedImage {
  id: string;
  name: string;
  storage_path: string;
  previewUrl: string;
}

interface Venue {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
}

function StepBar({ step }: { step: Step }) {
  const steps: { n: Step; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { n: 1, label: "Upload", icon: UploadCloud },
    { n: 2, label: "Extract", icon: Scissors },
    { n: 3, label: "Select", icon: ImageIcon },
    { n: 4, label: "Geotag", icon: MapPin },
    { n: 5, label: "Send", icon: Send },
  ];
  return (
    <div className="mb-8 flex items-center gap-2">
      {steps.map((s, i) => {
        const active = s.n === step;
        const done = s.n < step;
        return (
          <div key={s.n} className="flex flex-1 items-center gap-2">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : done
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              {done ? <Check className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
            </div>
            <span
              className={`text-sm ${
                active ? "text-foreground font-medium" : "text-muted-foreground"
              }`}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && <div className="mx-2 h-px flex-1 bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

export function WizardPage() {
  const sendFn = useServerFn(sendImagesToGhl);
  const [step, setStep] = useState<Step>(1);

  // Step 1: file
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Step 2: extract
  const [maxFrames, setMaxFrames] = useState(15);
  const [sampleMs, setSampleMs] = useState(1000);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<PendingFrame[]>([]);

  // Step 3: saved after selection persisted
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SavedImage[]>([]);
  const [videoId, setVideoId] = useState<string | null>(null);

  // Step 4: geotag
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueId, setVenueId] = useState<string>("");
  const [customLat, setCustomLat] = useState("");
  const [customLng, setCustomLng] = useState("");
  const [venueFilter, setVenueFilter] = useState("");

  // Step 5: send
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState("");
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number } | null>(null);

  const filteredVenues = useMemo(() => {
    const q = venueFilter.toLowerCase();
    return venues.filter((v) => !q || v.name.toLowerCase().includes(q));
  }, [venues, venueFilter]);

  const selectedFrames = pending.filter((p) => p.selected);

  // ------- Step 1 → 2: pick file -------
  const chooseFile = (f: File) => {
    if (!f.type.startsWith("video/")) {
      toast.error("Please choose a video file.");
      return;
    }
    setFile(f);
    setStep(2);
  };

  // ------- Step 2: run extraction -------
  const runExtraction = useCallback(async () => {
    if (!file) return;
    setExtracting(true);
    setProgress(0);
    try {
      const { frames } = await extractSharpFrames(file, {
        sampleEveryMs: sampleMs,
        maxFrames,
        onProgress: (p) => {
          setProgress(p.progress);
          if (p.message) setMessage(p.message);
        },
      });
      if (frames.length === 0) {
        toast.error("Couldn't extract any frames.");
        setExtracting(false);
        return;
      }
      const withPreview: PendingFrame[] = frames.map((f) => ({
        ...f,
        previewUrl: URL.createObjectURL(f.blob),
        selected: true,
      }));
      setPending(withPreview);
      setExtracting(false);
      setStep(3);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Extraction failed");
      setExtracting(false);
    }
  }, [file, sampleMs, maxFrames]);

  // ------- Step 3 → 4: save selected frames -------
  const persistSelected = useCallback(async () => {
    if (!file) return;
    const picks = pending.filter((p) => p.selected);
    if (picks.length === 0) {
      toast.error("Select at least one frame.");
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Not signed in");

      // Upload video
      setMessage("Uploading video…");
      const videoPath = `${userId}/${crypto.randomUUID()}-${file.name}`;
      const { error: vErr } = await supabase.storage
        .from("videos")
        .upload(videoPath, file, { contentType: file.type });
      if (vErr) throw vErr;
      const { data: videoRow, error: vRowErr } = await supabase
        .from("videos")
        .insert({
          owner_id: userId,
          storage_path: videoPath,
          original_name: file.name,
          size_bytes: file.size,
          frame_count: picks.length,
          status: "ready",
        })
        .select("id")
        .single();
      if (vRowErr) throw vRowErr;
      setVideoId(videoRow.id);

      const baseName = file.name.replace(/\.[^.]+$/, "");
      const savedImgs: SavedImage[] = [];
      for (let i = 0; i < picks.length; i++) {
        const f = picks[i];
        setMessage(`Saving frame ${i + 1}/${picks.length}`);
        const framePath = `${userId}/${videoRow.id}/${String(i + 1).padStart(3, "0")}.jpg`;
        const { error: fErr } = await supabase.storage
          .from("frames")
          .upload(framePath, f.blob, { contentType: "image/jpeg" });
        if (fErr) throw fErr;
        const { data: imgRow, error: iErr } = await supabase
          .from("images")
          .insert({
            owner_id: userId,
            video_id: videoRow.id,
            storage_path: framePath,
            name: `${baseName} — Frame ${i + 1}`,
            sharpness_score: f.sharpness,
            timestamp_seconds: f.timestampSeconds,
            width: f.width,
            height: f.height,
          })
          .select("id, name, storage_path")
          .single();
        if (iErr) throw iErr;
        savedImgs.push({ ...imgRow, previewUrl: f.previewUrl });
      }
      setSaved(savedImgs);

      // Load venues for step 4
      const { data: v } = await supabase
        .from("venues")
        .select("id, name, address, lat, lng")
        .order("name");
      setVenues(
        (v ?? []).map((row) => ({
          ...row,
          lat: Number(row.lat),
          lng: Number(row.lng),
        })),
      );

      setSaving(false);
      setStep(4);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }, [file, pending]);

  // ------- Step 4 → 5: apply geotag -------
  const applyGeotag = useCallback(async () => {
    if (saved.length === 0) return;
    const update: { lat?: number; lng?: number; venue_id?: string | null } = {};
    if (venueId) {
      const v = venues.find((x) => x.id === venueId);
      if (v) {
        update.lat = v.lat;
        update.lng = v.lng;
        update.venue_id = v.id;
      }
    } else if (customLat && customLng) {
      const lat = Number(customLat);
      const lng = Number(customLng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        toast.error("Invalid coordinates");
        return;
      }
      update.lat = lat;
      update.lng = lng;
      update.venue_id = null;
    } else {
      toast.error("Pick a venue or enter coordinates");
      return;
    }

    const ids = saved.map((s) => s.id);
    const { error } = await supabase.from("images").update(update).in("id", ids);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Geotagged ${ids.length} image(s)`);
    setStep(5);
  }, [saved, venueId, venues, customLat, customLng]);

  // ------- Step 5: send to GHL -------
  const sendToGhl = useCallback(async () => {
    if (saved.length === 0) return;
    setSending(true);
    try {
      const res = await sendFn({
        data: {
          imageIds: saved.map((s) => s.id),
          extra: note ? { note } : undefined,
        },
      });
      setSendResult({ sent: res.sent, failed: res.failed });
      if (res.failed > 0) toast.error(`${res.failed} image(s) failed to send`);
      else toast.success(`Sent ${res.sent} image(s) to GoHighLevel`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }, [saved, note, sendFn]);

  const restart = () => {
    for (const p of pending) URL.revokeObjectURL(p.previewUrl);
    setFile(null);
    setPending([]);
    setSaved([]);
    setVideoId(null);
    setVenueId("");
    setCustomLat("");
    setCustomLng("");
    setNote("");
    setSendResult(null);
    setStep(1);
  };

  return (
    <div className="w-full py-6 pl-6 md:py-10 md:pl-10" style={{ paddingRight: 50 }}>
      <h1 className="text-3xl">Pipeline</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Upload → extract → select → geotag → send to GoHighLevel.
      </p>

      <div className="mt-8">
        <StepBar step={step} />
      </div>

      {/* Step 1 */}
      {step === 1 && (
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
            if (f) chooseFile(f);
          }}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-16 text-center transition ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border bg-card/50 hover:border-primary/50"
          }`}
        >
          <UploadCloud className="h-10 w-10 text-primary" />
          <div className="mt-4 text-lg font-medium">Drop your video, or click to browse</div>
          <div className="mt-1 text-sm text-muted-foreground">MP4, MOV, WebM</div>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) chooseFile(f);
            }}
          />
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && file && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="text-sm text-muted-foreground">Video</div>
          <div className="mt-1 font-medium">{file.name}</div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="rounded-lg border border-border bg-background/50 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span>Max frames</span>
                <span className="font-mono text-primary">{maxFrames}</span>
              </div>
              <input
                type="range"
                min={3}
                max={40}
                value={maxFrames}
                onChange={(e) => setMaxFrames(Number(e.target.value))}
                disabled={extracting}
                className="mt-2 w-full accent-primary"
              />
            </label>
            <label className="rounded-lg border border-border bg-background/50 p-4 text-sm">
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
                disabled={extracting}
                className="mt-2 w-full accent-primary"
              />
            </label>
          </div>
          {extracting && (
            <div className="mt-6">
              <div className="mb-2 flex justify-between text-sm">
                <span>Analyzing…</span>
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
          <div className="mt-6 flex justify-between">
            <button
              onClick={() => setStep(1)}
              disabled={extracting}
              className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-50"
            >
              Back
            </button>
            <button
              onClick={runExtraction}
              disabled={extracting}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
              Extract frames
            </button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {selectedFrames.length} of {pending.length} selected · click to toggle
            </div>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setPending((prev) => prev.map((p) => ({ ...p, selected: true })))
                }
                className="rounded-md border border-border px-3 py-1.5 text-xs"
              >
                Select all
              </button>
              <button
                onClick={() =>
                  setPending((prev) => prev.map((p) => ({ ...p, selected: false })))
                }
                className="rounded-md border border-border px-3 py-1.5 text-xs"
              >
                Deselect all
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {pending.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() =>
                  setPending((prev) =>
                    prev.map((x, xi) => (xi === i ? { ...x, selected: !x.selected } : x)),
                  )
                }
                className={`group relative overflow-hidden rounded-lg border transition ${
                  p.selected ? "border-primary ring-2 ring-primary/40" : "border-border opacity-70"
                }`}
              >
                <img
                  src={p.previewUrl}
                  alt={`Frame at ${p.timestampSeconds.toFixed(1)}s`}
                  className="aspect-video w-full object-cover"
                />
                <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-black/60 px-2 py-1 text-xs">
                  <span>{p.timestampSeconds.toFixed(1)}s</span>
                  <span className="font-mono">{Math.round(p.sharpness)}</span>
                </div>
                {p.selected && (
                  <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                )}
              </button>
            ))}
          </div>
          <div className="mt-6 flex justify-between">
            <button
              onClick={() => setStep(2)}
              disabled={saving}
              className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-50"
            >
              Back
            </button>
            <button
              onClick={persistSelected}
              disabled={saving || selectedFrames.length === 0}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? message || "Saving…" : `Save ${selectedFrames.length} & continue`}
            </button>
          </div>
        </div>
      )}

      {/* Step 4 */}
      {step === 4 && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-xl">Geotag {saved.length} image(s)</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a Dubai venue or enter custom coordinates. Applied to every saved image.
          </p>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <label className="text-xs font-medium">Dubai venue</label>
              <input
                type="text"
                value={venueFilter}
                onChange={(e) => setVenueFilter(e.target.value)}
                placeholder="Search venues…"
                className="mt-1 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm"
              />
              <div className="mt-2 max-h-64 overflow-auto rounded-md border border-border">
                {filteredVenues.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      setVenueId(v.id);
                      setCustomLat("");
                      setCustomLng("");
                    }}
                    className={`flex w-full flex-col items-start border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent ${
                      venueId === v.id ? "bg-primary/10 text-primary" : ""
                    }`}
                  >
                    <span className="font-medium">{v.name}</span>
                    {v.address && (
                      <span className="text-xs text-muted-foreground">{v.address}</span>
                    )}
                  </button>
                ))}
                {filteredVenues.length === 0 && (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No venues match.
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium">Or custom coordinates</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="any"
                  value={customLat}
                  onChange={(e) => {
                    setCustomLat(e.target.value);
                    setVenueId("");
                  }}
                  placeholder="Latitude"
                  className="rounded-md border border-input bg-background/50 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  step="any"
                  value={customLng}
                  onChange={(e) => {
                    setCustomLng(e.target.value);
                    setVenueId("");
                  }}
                  placeholder="Longitude"
                  className="rounded-md border border-input bg-background/50 px-3 py-2 text-sm"
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                e.g. 25.1972, 55.2744 (Burj Khalifa)
              </p>
            </div>
          </div>

          <div className="mt-6 flex justify-between">
            <button
              onClick={() => setStep(3)}
              className="rounded-md border border-border px-4 py-2 text-sm"
            >
              Back
            </button>
            <button
              onClick={applyGeotag}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              <MapPin className="h-4 w-4" />
              Apply geotag & continue
            </button>
          </div>
        </div>
      )}

      {/* Step 5 */}
      {step === 5 && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-xl">Send to GoHighLevel</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Each image is sent as JSON to your configured GHL inbound webhook, with a 24-hour
            signed URL to the JPEG plus location + tags.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {saved.slice(0, 6).map((s) => (
              <img
                key={s.id}
                src={s.previewUrl}
                alt={s.name}
                className="aspect-square w-full rounded-md object-cover"
              />
            ))}
          </div>
          {saved.length > 6 && (
            <div className="mt-2 text-xs text-muted-foreground">+{saved.length - 6} more</div>
          )}

          <label className="mt-6 block text-sm">
            <div className="text-xs font-medium">Optional note (forwarded in payload)</div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="e.g. Location scouting round — Downtown"
              className="mt-1 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm"
            />
          </label>

          {sendResult && (
            <div
              className={`mt-4 rounded-md border p-3 text-sm ${
                sendResult.failed === 0
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-destructive/40 bg-destructive/10"
              }`}
            >
              Sent {sendResult.sent} · Failed {sendResult.failed}
            </div>
          )}

          <div className="mt-6 flex justify-between">
            <button
              onClick={() => setStep(4)}
              disabled={sending}
              className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-50"
            >
              Back
            </button>
            <div className="flex gap-2">
              <button
                onClick={restart}
                disabled={sending}
                className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-50"
              >
                Start over
              </button>
              <button
                onClick={sendToGhl}
                disabled={sending}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? "Sending…" : `Send ${saved.length} to GHL`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
