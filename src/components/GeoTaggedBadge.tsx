import { MapPin } from "lucide-react";

/**
 * Persistent visual indicator for geotagged images.
 * Rendered wherever a geotagged image is shown so users can identify status at a glance.
 */
export function GeoTaggedBadge({
  lat,
  lng,
  className = "",
  compact = false,
  title,
}: {
  lat: number | null | undefined;
  lng: number | null | undefined;
  className?: string;
  compact?: boolean;
  title?: string;
}) {
  if (lat == null || lng == null) return null;
  const label = title ?? `Geotagged · ${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
  if (compact) {
    return (
      <span
        title={label}
        aria-label={label}
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow ring-2 ring-emerald-500/20 ${className}`}
      >
        <MapPin className="h-3 w-3" />
      </span>
    );
  }
  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow ring-2 ring-emerald-500/20 ${className}`}
    >
      <MapPin className="h-3 w-3" />
      Geotagged
    </span>
  );
}
