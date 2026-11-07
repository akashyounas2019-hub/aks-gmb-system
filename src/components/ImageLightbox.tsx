import { useEffect, useState } from "react";
import { Eye, ExternalLink, X } from "lucide-react";

/**
 * App-wide image preview. Any thumbnail can call `openImagePreview(url, alt)`
 * and the single <ImageLightboxHost/> (mounted in AppShell) shows it large.
 */
type PreviewState = { url: string; alt: string } | null;

let current: PreviewState = null;
const listeners = new Set<(s: PreviewState) => void>();

function emit(next: PreviewState) {
  current = next;
  listeners.forEach((l) => l(next));
}

export function openImagePreview(url: string, alt = "Image preview") {
  if (url) emit({ url, alt });
}

export function closeImagePreview() {
  emit(null);
}

export function ImageLightboxHost() {
  const [state, setState] = useState<PreviewState>(current);

  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeImagePreview();
      }
    }
    // capture phase so an underlying modal's Escape handler doesn't also fire
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [state]);

  if (!state) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={state.alt}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      onClick={closeImagePreview}
    >
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <a
          href={state.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open original
        </a>
        <button
          type="button"
          onClick={closeImagePreview}
          aria-label="Close preview"
          className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <img
        src={state.url}
        alt={state.alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] max-w-[94vw] rounded-lg object-contain shadow-2xl"
      />
    </div>
  );
}

/**
 * Small "eye" button overlaid on a thumbnail. Rendered as a span with
 * role=button so it can sit inside thumbnails that are themselves <button>s.
 */
export function ExpandImageButton({
  url,
  alt,
  className = "",
}: {
  url: string | null | undefined;
  alt: string;
  className?: string;
}) {
  if (!url) return null;
  const open = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openImagePreview(url, alt);
  };
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`Preview ${alt}`}
      title="Preview"
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") open(e);
      }}
      className={`absolute left-1/2 top-1/2 z-10 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-zoom-in place-items-center rounded-full bg-black/55 text-white opacity-0 shadow ring-1 ring-white/30 transition hover:bg-black/75 focus-visible:opacity-100 group-hover/expand:opacity-100 ${className}`}
    >
      <Eye className="h-3.5 w-3.5" />
    </span>
  );
}
