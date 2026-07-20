import { Heart } from "lucide-react";

/**
 * Persistent visual indicator for favorited images.
 * Shown across all views (library, geotagging, etc.) so favorites are
 * easy to spot and select at a glance.
 */
export function FavoriteBadge({
  favorite,
  className = "",
  compact = false,
  title = "Favorite",
}: {
  favorite: boolean | null | undefined;
  className?: string;
  compact?: boolean;
  title?: string;
}) {
  if (!favorite) return null;
  if (compact) {
    return (
      <span
        title={title}
        aria-label={title}
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white shadow ring-2 ring-rose-500/25 ${className}`}
      >
        <Heart className="h-3 w-3 fill-current" />
      </span>
    );
  }
  return (
    <span
      title={title}
      aria-label={title}
      className={`inline-flex items-center gap-1 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow ring-2 ring-rose-500/25 ${className}`}
    >
      <Heart className="h-3 w-3 fill-current" />
      Favorite
    </span>
  );
}
