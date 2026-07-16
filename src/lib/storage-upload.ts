import { supabase } from "@/integrations/supabase/client";

export type UploadProgress = { loaded: number; total: number; pct: number };

/**
 * Upload a Blob to Supabase Storage with real byte-level progress.
 * Uses a signed upload URL + XHR PUT (the JS client's .upload() has no progress events).
 */
export async function uploadBlobWithProgress(opts: {
  bucket: string;
  path: string;
  blob: Blob;
  contentType?: string;
  signal?: AbortSignal;
  onProgress?: (p: UploadProgress) => void;
}): Promise<void> {
  const { bucket, path, blob, contentType, signal, onProgress } = opts;

  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) throw new Error(error?.message ?? "Failed to create upload URL");

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", data.signedUrl, true);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("x-upsert", "false");

    xhr.upload.onprogress = (e) => {
      if (!onProgress) return;
      const total = e.lengthComputable ? e.total : blob.size;
      const loaded = e.loaded;
      onProgress({ loaded, total, pct: total > 0 ? loaded / total : 0 });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.({ loaded: blob.size, total: blob.size, pct: 1 });
        resolve();
      } else {
        reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText || xhr.statusText}`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new Error("Upload aborted"));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(blob);
  });
}

export async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("You must be signed in to save to the library.");
  return data.user.id;
}
