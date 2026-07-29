import { CheckCircle2 } from "lucide-react";

/**
 * Persistent purple indicator for published images.
 * Rendered wherever a published image is shown so status is identifiable at a
 * glance — and it sits happily next to the geotag badge when an image is both.
 */
export function PublishedBadge({
  published,
  className = "",
  compact = false,
  title,
}: {
  published: boolean | null | undefined;
  className?: string;
  compact?: boolean;
  title?: string;
}) {
  if (!published) return null;
  const label = title ?? "Published";
  if (compact) {
    return (
      <span
        title={label}
        aria-label={label}
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-purple-600 text-white shadow ring-2 ring-purple-600/20 ${className}`}
      >
        <CheckCircle2 className="h-3 w-3" />
      </span>
    );
  }
  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-flex items-center gap-1 rounded-full bg-purple-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow ring-2 ring-purple-600/20 ${className}`}
    >
      <CheckCircle2 className="h-3 w-3" />
      Published
    </span>
  );
}
