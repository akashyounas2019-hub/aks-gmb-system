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
