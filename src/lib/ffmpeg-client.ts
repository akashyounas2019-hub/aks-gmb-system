import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";

export function getFFmpeg(): FFmpeg {
  if (!ffmpegInstance) ffmpegInstance = new FFmpeg();
  return ffmpegInstance;
}

export async function loadFFmpeg(
  onLog?: (msg: string) => void,
  onProgress?: (p: number) => void,
): Promise<FFmpeg> {
  const ff = getFFmpeg();
  if (ff.loaded) return ff;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    if (onLog) ff.on("log", ({ message }) => onLog(message));
    if (onProgress) ff.on("progress", ({ progress }) => onProgress(progress));
    await ff.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    });
    return ff;
  })();
  return loadPromise;
}

export { fetchFile };

export function humanSize(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(ms: number): string {
  if (!isFinite(ms) || ms < 0) ms = 0;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${rem.toString().padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${(m % 60).toString().padStart(2, "0")}m`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Allowed input formats for ffmpeg.wasm. Broad but explicit — anything not here is rejected early.
export const SUPPORTED_VIDEO_EXTENSIONS = [
  "mp4",
  "m4v",
  "mov",
  "webm",
  "mkv",
  "avi",
  "flv",
  "wmv",
  "mpg",
  "mpeg",
  "ts",
  "mts",
  "m2ts",
  "3gp",
  "3g2",
  "ogv",
  "ogg",
  "asf",
  "vob",
  "f4v",
] as const;

export const SUPPORTED_VIDEO_MIME_PREFIXES = ["video/"];

// Practical ceiling for ffmpeg.wasm: it loads the whole file into WASM linear memory (~2-4 GB cap).
// Keeping this at 2 GB avoids OOMs on most devices.
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;
// 2 hours — beyond this, browser encoding becomes impractical and heat/battery cost is severe.
export const MAX_VIDEO_DURATION_SECONDS = 2 * 60 * 60;

export type ValidationError = { code: string; message: string };

export function validateVideoFileBasic(file: File): ValidationError | null {
  const ext = file.name.match(/\.([^.]+)$/)?.[1]?.toLowerCase() ?? "";
  const mimeOk = SUPPORTED_VIDEO_MIME_PREFIXES.some((p) => file.type.startsWith(p));
  const extOk = (SUPPORTED_VIDEO_EXTENSIONS as readonly string[]).includes(ext);
  if (!mimeOk && !extOk) {
    return {
      code: "unsupported_type",
      message: `Unsupported file type${ext ? ` ".${ext}"` : ""}. Supported: ${SUPPORTED_VIDEO_EXTENSIONS.join(", ").toUpperCase()}.`,
    };
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return {
      code: "too_large",
      message: `File is ${humanSize(file.size)}. Maximum supported size in-browser is ${humanSize(MAX_VIDEO_BYTES)}.`,
    };
  }
  if (file.size === 0) {
    return { code: "empty", message: "File is empty." };
  }
  return null;
}

// Probes duration via a hidden <video> element. Resolves null when the browser cannot decode the container
// (that's fine — ffmpeg may still handle it, so we don't reject on probe failure).
export function probeVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
    };
    const timeout = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 8000);
    video.onloadedmetadata = () => {
      clearTimeout(timeout);
      const d = Number.isFinite(video.duration) ? video.duration : null;
      cleanup();
      resolve(d);
    };
    video.onerror = () => {
      clearTimeout(timeout);
      cleanup();
      resolve(null);
    };
    video.src = url;
  });
}

export async function validateVideoFile(file: File): Promise<ValidationError | null> {
  const basic = validateVideoFileBasic(file);
  if (basic) return basic;
  const duration = await probeVideoDuration(file);
  if (duration !== null && duration > MAX_VIDEO_DURATION_SECONDS) {
    return {
      code: "too_long",
      message: `Video is ${formatDuration(duration * 1000)}. Maximum supported duration is ${formatDuration(MAX_VIDEO_DURATION_SECONDS * 1000)}.`,
    };
  }
  return null;
}
