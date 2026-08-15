/**
 * Browser-side frame extraction using ffmpeg.wasm.
 *
 * Strategy:
 * 1. Sample the video every `sampleEveryMs` using HTMLVideoElement (fast).
 * 2. Score each sampled frame with Laplacian variance (sharpness).
 * 3. Cluster frames into `bucketSeconds` windows and keep the sharpest per window.
 * 4. Cap to `maxFrames` and return as JPEG blobs.
 *
 * We rely on the video element + canvas (no ffmpeg needed for scoring). ffmpeg.wasm
 * is loaded lazily and only used for a final high-quality encode; for most cases the
 * canvas encode is enough, so ffmpeg is optional. Keeping the code simple: canvas-only.
 */

export interface ExtractedFrame {
  blob: Blob;
  timestampSeconds: number;
  sharpness: number;
  width: number;
  height: number;
}

export interface ExtractOptions {
  sampleEveryMs?: number;
  bucketSeconds?: number;
  maxFrames?: number;
  /** Ensure at least this many frames are returned, backfilling by sharpness if buckets are sparse. */
  minFrames?: number;
  maxDimension?: number;
  jpegQuality?: number;
  onProgress?: (p: { stage: string; progress: number; message?: string }) => void;
}

/** Load a File into an HTMLVideoElement and wait for metadata. */
function loadVideo(file: File): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.src = URL.createObjectURL(file);
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => reject(new Error("Failed to load video"));
  });
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const handler = () => {
      video.removeEventListener("seeked", handler);
      resolve();
    };
    const err = () => {
      video.removeEventListener("error", err);
      reject(new Error("Seek failed"));
    };
    video.addEventListener("seeked", handler, { once: true });
    video.addEventListener("error", err, { once: true });
    video.currentTime = Math.min(time, video.duration - 0.05);
  });
}

/** Laplacian variance sharpness score on a downscaled grayscale image. */
function sharpnessScore(imageData: ImageData): number {
  const { data, width, height } = imageData;
  // Convert to grayscale array
  const gray = new Float32Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  // 3x3 Laplacian: center*4 - up - down - left - right
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const v =
        4 * gray[idx] - gray[idx - 1] - gray[idx + 1] - gray[idx - width] - gray[idx + width];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export async function extractSharpFrames(
  file: File,
  options: ExtractOptions = {},
): Promise<{ frames: ExtractedFrame[]; durationSeconds: number }> {
  const {
    sampleEveryMs = 1000,
    bucketSeconds = 5,
    maxFrames = 20,
    minFrames = 0,
    maxDimension = 1600,
    jpegQuality = 0.92,
    onProgress,
  } = options;
  const effectiveMax = Math.max(maxFrames, minFrames);

  onProgress?.({ stage: "loading", progress: 0 });
  const video = await loadVideo(file);
  const duration = video.duration;

  // Downscale for scoring
  const scoringSize = 240;
  const scoreCanvas = document.createElement("canvas");
  const scoreCtx = scoreCanvas.getContext("2d", { willReadFrequently: true })!;

  // Full-res canvas for output
  const outCanvas = document.createElement("canvas");
  const outCtx = outCanvas.getContext("2d")!;
  const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight));
  outCanvas.width = Math.round(video.videoWidth * scale);
  outCanvas.height = Math.round(video.videoHeight * scale);

  // Set score canvas
  const aspect = video.videoWidth / video.videoHeight;
  scoreCanvas.width = scoringSize;
  scoreCanvas.height = Math.round(scoringSize / aspect);

  const samples: {
    t: number;
    score: number;
  }[] = [];

  // Hard cap on total samples so a very long video can't freeze the tab with
  // thousands of sequential seeks — widen the sampling interval instead of
  // sampling every `sampleEveryMs` no matter how long the clip is.
  const MAX_SAMPLES = 600;
  let step = sampleEveryMs / 1000;
  const requestedSamples = Math.max(1, Math.floor(duration / step));
  if (requestedSamples > MAX_SAMPLES) {
    step = duration / MAX_SAMPLES;
  }
  let t = 0;
  const totalSamples = Math.max(1, Math.floor(duration / step));
  let idx = 0;

  while (t < duration - 0.1) {
    await seekTo(video, t);
    scoreCtx.drawImage(video, 0, 0, scoreCanvas.width, scoreCanvas.height);
    const img = scoreCtx.getImageData(0, 0, scoreCanvas.width, scoreCanvas.height);
    const score = sharpnessScore(img);
    samples.push({ t, score });
    idx++;
    onProgress?.({
      stage: "scoring",
      progress: idx / totalSamples,
      message: `Sampled ${idx}/${totalSamples} frames`,
    });
    t += step;
  }

  // Bucket & pick sharpest per bucket
  const buckets = new Map<number, { t: number; score: number }>();
  for (const s of samples) {
    const b = Math.floor(s.t / bucketSeconds);
    const cur = buckets.get(b);
    if (!cur || s.score > cur.score) buckets.set(b, s);
  }
  const bucketWinners = Array.from(buckets.values()).sort((a, b) => b.score - a.score);
  const picked = new Map<number, { t: number; score: number }>();
  for (const w of bucketWinners.slice(0, effectiveMax)) picked.set(w.t, w);

  // Backfill toward minFrames with an even distribution across the clip.
  // Strategy: slot the timeline into `target` equal intervals and, for each
  // still-empty interval, pick the sharpest remaining sample inside it.
  // If some intervals stay empty (short clip / sparse samples), fall back to
  // farthest-point insertion — pick the candidate that maximises the minimum
  // distance to already-picked frames, breaking ties by sharpness. This avoids
  // clumping all backfilled frames in the sharpest region of the video.
  const target = Math.min(minFrames, effectiveMax);
  if (picked.size < target) {
    const slotCount = target;
    const slotWidth = duration / slotCount;

    // 1) Even slot pass — one sharpest sample per empty slot.
    const slotOccupied = new Array(slotCount).fill(false);
    for (const p of picked.values()) {
      const s = Math.min(slotCount - 1, Math.floor(p.t / slotWidth));
      slotOccupied[s] = true;
    }
    const bySlot = new Map<number, { t: number; score: number }[]>();
    for (const s of samples) {
      if (picked.has(s.t)) continue;
      const idx = Math.min(slotCount - 1, Math.floor(s.t / slotWidth));
      if (slotOccupied[idx]) continue;
      const arr = bySlot.get(idx) ?? [];
      arr.push(s);
      bySlot.set(idx, arr);
    }
    for (let i = 0; i < slotCount && picked.size < target; i++) {
      if (slotOccupied[i]) continue;
      const arr = bySlot.get(i);
      if (!arr || arr.length === 0) continue;
      arr.sort((a, b) => b.score - a.score);
      picked.set(arr[0].t, arr[0]);
      slotOccupied[i] = true;
    }

    // 2) Farthest-point fallback — for anything still missing (empty slots,
    //    short clips), maximise gap to existing picks, tiebreak on sharpness.
    if (picked.size < target) {
      const maxScore = samples.reduce((m, s) => Math.max(m, s.score), 1);
      while (picked.size < target) {
        let best: { t: number; score: number } | null = null;
        let bestKey = -Infinity;
        for (const s of samples) {
          if (picked.has(s.t)) continue;
          let minDist = Infinity;
          for (const p of picked.values()) {
            const d = Math.abs(p.t - s.t);
            if (d < minDist) minDist = d;
          }
          if (!Number.isFinite(minDist)) minDist = duration;
          // Distance dominates; sharpness is a small tiebreaker.
          const key = minDist + (s.score / maxScore) * (slotWidth * 0.25);
          if (key > bestKey) {
            bestKey = key;
            best = s;
          }
        }
        if (!best) break;
        picked.set(best.t, best);
      }
    }
  }

  const winners = Array.from(picked.values()).sort((a, b) => a.t - b.t);

  const frames: ExtractedFrame[] = [];
  for (let i = 0; i < winners.length; i++) {
    const w = winners[i];
    await seekTo(video, w.t);
    outCtx.drawImage(video, 0, 0, outCanvas.width, outCanvas.height);
    const blob: Blob = await new Promise((res) =>
      outCanvas.toBlob((b) => res(b!), "image/jpeg", jpegQuality),
    );
    frames.push({
      blob,
      timestampSeconds: w.t,
      sharpness: w.score,
      width: outCanvas.width,
      height: outCanvas.height,
    });
    onProgress?.({
      stage: "encoding",
      progress: (i + 1) / winners.length,
      message: `Encoded ${i + 1}/${winners.length} frames`,
    });
  }

  URL.revokeObjectURL(video.src);
  onProgress?.({ stage: "done", progress: 1 });
  return { frames, durationSeconds: duration };
}
