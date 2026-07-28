import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  MapPin,
  UploadCloud,
  Home,
  Briefcase,
  Store,
  Search,
  Copy,
  Check,
  Trash2,
  Loader2,
  Image as ImageIcon,
  Crosshair,
  Pin,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CircleCheck,
  Download,
  Library,
  Plus,
  RefreshCw,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { LocationPicker, type PickedLocation } from "@/components/LocationPicker";
import { SignedImage, useSignedUrl } from "@/components/SignedImage";
import { FavoriteBadge } from "@/components/FavoriteBadge";
import { embedGps, readGps, readMeta, type GpsReadResult } from "@/lib/exif-geotag";

export const Route = createFileRoute("/_authenticated/geotagging")({
  component: GeotaggingPage,
  head: () => ({
    meta: [
      { title: "Geotagging — Bulk Image Location Tagging" },
      {
        name: "description",
        content:
          "Bulk upload images and apply precise GPS coordinates from a curated location library — homes, offices and commercial places across Dubai.",
      },
    ],
  }),
});

/* -------------------------------------------------------------------------- */
/* Preset location library                                                    */
/* -------------------------------------------------------------------------- */

type PlaceType = "home" | "office" | "commercial";

type Place = {
  id: string;
  name: string;
  area: string;
  type: PlaceType;
  lat: number;
  lng: number;
  address?: string;
};

const TYPE_META: Record<PlaceType, { label: string; icon: typeof Home; tone: string }> = {
  home: { label: "Home", icon: Home, tone: "bg-emerald-500/15 text-emerald-500" },
  office: { label: "Office", icon: Briefcase, tone: "bg-sky-500/15 text-sky-500" },
  commercial: { label: "Commercial", icon: Store, tone: "bg-amber-500/15 text-amber-500" },
};

// Google Places search text per property type — combined with the user's
// city/area to find real homes, offices, and commercial places.
const TYPE_SEARCH_TERM: Record<PlaceType, string> = {
  home: "residential building",
  office: "office building",
  commercial: "commercial building",
};

// Common Dubai areas — a shortcut for the area filter and the default map
// city buttons. These are only starting points for a real Google Places
// search; they are never used as a source of coordinates themselves.
const AREA_SEED_CENTERS: Record<string, { lat: number; lng: number }> = {
  "Abu Hail": { lat: 25.2857, lng: 55.3335 },
  "Al Barsha": { lat: 25.1041, lng: 55.1936 },
  "Al Barsha Heights": { lat: 25.0985, lng: 55.1758 },
  "Al Furjan": { lat: 25.0263, lng: 55.1442 },
  "Al Jadaf": { lat: 25.2246, lng: 55.3325 },
  "Al Khalil Gate": { lat: 25.1876, lng: 55.2622 },
  "Al Mamzar": { lat: 25.3007, lng: 55.3441 },
  "Al Nahda": { lat: 25.2939, lng: 55.3691 },
  "Al Qusais": { lat: 25.2867, lng: 55.3873 },
  "Al Rigga": { lat: 25.2646, lng: 55.3243 },
  "Al Warqa": { lat: 25.2062, lng: 55.3903 },
  "Al Wasl": { lat: 25.1963, lng: 55.2534 },
  Akoya: { lat: 24.9297, lng: 55.2611 },
  "Arabian Ranches": { lat: 25.0432, lng: 55.2703 },
  Arjaan: { lat: 25.0995, lng: 55.1740 },
  Boulevard: { lat: 25.1930, lng: 55.2760 },
  "Burj Khalifa": { lat: 25.1972, lng: 55.2744 },
  "Business Bay": { lat: 25.1867, lng: 55.2704 },
  DIFC: { lat: 25.2110, lng: 55.2796 },
  "Discovery Gardens": { lat: 25.0430, lng: 55.1385 },
  "Dubai Downtown": { lat: 25.1934, lng: 55.2751 },
  "Dubai Falcon City": { lat: 25.1183, lng: 55.3216 },
  "Dubai Festival City": { lat: 25.2216, lng: 55.3536 },
  "Dubai Health Care City": { lat: 25.2320, lng: 55.3234 },
  "Dubai Investment Park": { lat: 24.9857, lng: 55.1770 },
  "Dubai Land": { lat: 25.1000, lng: 55.3200 },
  "Dubai Marina": { lat: 25.0805, lng: 55.1403 },
  "Emirates Hills": { lat: 25.0682, lng: 55.1657 },
  IMPZ: { lat: 25.0299, lng: 55.2088 },
  "International City": { lat: 25.1615, lng: 55.4098 },
  "Internet City": { lat: 25.0937, lng: 55.1626 },
  JLT: { lat: 25.0705, lng: 55.1443 },
  JVC: { lat: 25.0587, lng: 55.2094 },
  Jumeirah: { lat: 25.2048, lng: 55.2708 },
  "Jumeirah Beach Residence": { lat: 25.0784, lng: 55.1336 },
  "Jumeirah Park": { lat: 25.0447, lng: 55.1583 },
  "Layan Community": { lat: 25.0640, lng: 55.3170 },
  Meadows: { lat: 25.0575, lng: 55.1745 },
  Meydan: { lat: 25.1571, lng: 55.3006 },
  Mirdiff: { lat: 25.2168, lng: 55.4183 },
  "Mirdiff Hills": { lat: 25.2110, lng: 55.4231 },
  "Motor City": { lat: 25.0475, lng: 55.2385 },
  Mudon: { lat: 25.0027, lng: 55.2646 },
  "Nad Al Hammar": { lat: 25.2166, lng: 55.3670 },
  "Nad Al Sheba": { lat: 25.1567, lng: 55.3200 },
  "Palm Jumeirah": { lat: 25.1124, lng: 55.1390 },
  Rashidiya: { lat: 25.2400, lng: 55.3897 },
  "Sheikh Zayed Road": { lat: 25.2110, lng: 55.2740 },
  "Sport City": { lat: 25.0388, lng: 55.2226 },
  "Studio City": { lat: 25.0342, lng: 55.2418 },
  "Umm Suqeim": { lat: 25.1413, lng: 55.1994 },
  "Uptown Mirdiff": { lat: 25.2247, lng: 55.4149 },
  Deira: { lat: 25.2701, lng: 55.3160 },
};

const AREAS = Object.keys(AREA_SEED_CENTERS).sort();


/**
 * Looks up real places from Google Places (Text Search) for a given property
 * type within a city/area — replaces the old hardcoded, made-up location
 * list. Returns actual addresses and coordinates.
 */
async function searchPlaces(
  type: PlaceType | "All",
  areaOrQuery: string,
): Promise<Place[]> {
  const google = (window as any).google;
  if (!google?.maps?.importLibrary) throw new Error("Google Maps not loaded");
  const { Place: GPlace } = (await google.maps.importLibrary("places")) as any;

  const city = areaOrQuery.trim() || "Dubai";
  const types: PlaceType[] = type === "All" ? ["home", "office", "commercial"] : [type];

  const results = await Promise.all(
    types.map(async (t) => {
      try {
        const { places: found } = await GPlace.searchByText({
          textQuery: `${TYPE_SEARCH_TERM[t]} in ${city}`,
          fields: ["displayName", "formattedAddress", "location", "id"],
          locationBias: { lat: 25.2048, lng: 55.2708, radius: 60000 },
          maxResultCount: 12,
        });
        return (found ?? []).map((p: any): Place | null => {
          const loc = p.location;
          const lat = typeof loc?.lat === "function" ? loc.lat() : loc?.lat;
          const lng = typeof loc?.lng === "function" ? loc.lng() : loc?.lng;
          if (typeof lat !== "number" || typeof lng !== "number") return null;
          return {
            id: p.id,
            name: p.displayName?.text ?? p.displayName ?? "Unnamed place",
            area: city,
            type: t,
            lat,
            lng,
            address: p.formattedAddress ?? undefined,
          };
        }).filter((p: Place | null): p is Place => p !== null);
      } catch {
        return [];
      }
    }),
  );

  return results.flat();
}

/** De-duplicate a keyword list (case-insensitive) and optionally seed it with
 *  the current location label so venue-scoped auto-tags survive alongside
 *  user-provided keywords. */
function mergeKeywordSet(
  existing: string[] | undefined,
  locationLabel?: string | null,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    const key = v.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(v);
  };
  (existing ?? []).forEach(push);
  if (locationLabel) push(locationLabel);
  return out;
}


/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type LocalImage = {
  id: string;
  file: File;
  previewUrl: string;
  lat: number | null;
  lng: number | null;
  locationLabel: string | null;
  title: string;
  description: string;
  keywords: string[];
  status: "pending" | "saving" | "saved" | "error";
  error?: string;
  // When the image was added from the user's library, we track the DB row so
  // saveAll updates that row (and re-uploads to the same storage path) instead
  // of creating a duplicate.
  libraryId?: string;
  libraryStoragePath?: string;
  favorite?: boolean;
  // True when the image was imported from the library and already had title/description set.
  // We won't re-prompt for those fields.
  hasExistingMeta?: boolean;
  // Detected EXIF sources so Step 3 can show which tag each field came from.
  metaSources?: {
    title: import("@/lib/exif-geotag").ExifMetaSource;
    description: import("@/lib/exif-geotag").ExifMetaSource;
    keywords: import("@/lib/exif-geotag").ExifMetaSource;
  };
  // Raw per-tag values so the user can pick an alternative source without retyping.
  metaRaw?: {
    XPTitle: string;
    ImageDescription: string;
    XPComment: string;
    XPSubject: string;
    XPKeywords: string;
    UserComment: string;
  };
};

type LibraryImage = {
  id: string;
  name: string;
  storage_path: string;
  lat: number | null;
  lng: number | null;
  title: string | null;
  description: string | null;
  is_favorite: boolean | null;
};

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

function GeotaggingPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"wizard" | "verify">("wizard");
  const [images, setImages] = useState<LocalImage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [openSection, setOpenSection] = useState<"quick" | "library" | "map">("quick");

  const [areaFilter, setAreaFilter] = useState<string>("All");
  const [typeFilter, setTypeFilter] = useState<PlaceType | "All">("All");
  const [placeSearch, setPlaceSearch] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [activePlace, setActivePlace] = useState<Place | null>(null);
  const [customLocation, setCustomLocation] = useState<PickedLocation | null>(null);
  const [copied, setCopied] = useState(false);
  const [savingBulk, setSavingBulk] = useState(false);

  // Pinned coordinate (auto-applied to newly uploaded images)
  const [pinnedCoord, setPinnedCoord] = useState<
    { lat: number; lng: number; label: string; kind: "home" | "office" | "custom" } | null
  >(null);

  // Dedicated Home/Office quick pickers
  const homePlaces = useMemo(() => places.filter((p) => p.type === "home"), [places]);
  const officePlaces = useMemo(() => places.filter((p) => p.type === "office"), [places]);
  const [homePickId, setHomePickId] = useState<string>("");
  const [officePickId, setOfficePickId] = useState<string>("");

  // City centers used only as map-picker shortcuts (not a source of coordinates
  // for tagging — real coordinates always come from the live Google Places
  // search below).
  const cityOptions = useMemo(
    () => AREAS.map((name) => ({ name, ...AREA_SEED_CENTERS[name] })),
    [],
  );

  // Live lookup — runs whenever the type/city/search text changes, so "Home"
  // + "Al Qusais" fetches real residential addresses in Al Qusais from Google
  // Places, instead of filtering a fixed made-up list.
  const runSearch = useCallback(async () => {
    setPlacesLoading(true);
    setPlacesError(null);
    try {
      const city = placeSearch.trim() || (areaFilter !== "All" ? areaFilter : "Dubai");
      const found = await searchPlaces(typeFilter, city);
      setPlaces(found);
      setHomePickId((cur) => (found.some((p) => p.id === cur) ? cur : found.find((p) => p.type === "home")?.id ?? ""));
      setOfficePickId((cur) => (found.some((p) => p.id === cur) ? cur : found.find((p) => p.type === "office")?.id ?? ""));
      setActivePlace((cur) => (cur && found.some((p) => p.id === cur.id) ? cur : found[0] ?? null));
    } catch (e) {
      setPlacesError(e instanceof Error ? e.message : "Couldn't reach Google Places.");
      setPlaces([]);
    } finally {
      setPlacesLoading(false);
    }
  }, [typeFilter, areaFilter, placeSearch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      runSearch();
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, areaFilter, placeSearch]);

  const refreshLocations = useCallback(() => {
    setRefreshing(true);
    runSearch().finally(() => {
      setRefreshKey((k) => k + 1);
      toast.success("Coordinates refreshed from Google Places");
      setRefreshing(false);
    });
  }, [runSearch]);



  // Cloud library (existing user images)
  const [library, setLibrary] = useState<LibraryImage[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [importingFromLibrary, setImportingFromLibrary] = useState(false);

  const reloadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    const { data } = await supabase
      .from("images")
      .select("id,name,storage_path,lat,lng,title,description,is_favorite")
      .order("created_at", { ascending: false })
      .limit(500);
    // Favorites first (most-recent-first within each group), so they're
    // easy to find at a glance instead of scattered by upload date.
    const rows = (data ?? []) as LibraryImage[];
    rows.sort((a, b) => Number(Boolean(b.is_favorite)) - Number(Boolean(a.is_favorite)));
    setLibrary(rows);
    setLibraryLoading(false);
  }, []);

  useEffect(() => {
    reloadLibrary();
  }, [reloadLibrary]);

  const alreadyImportedIds = useMemo(
    () => new Set(images.map((i) => i.libraryId).filter(Boolean) as string[]),
    [images],
  );

  const addFromLibrary = useCallback(
    async (rows: LibraryImage[]) => {
      if (rows.length === 0) return;
      setImportingFromLibrary(true);
      try {
        const newOnes = rows.filter((r) => !alreadyImportedIds.has(r.id));
        if (newOnes.length === 0) {
          toast.info("Already added from library.");
          return;
        }
        const built: LocalImage[] = [];
        for (const row of newOnes) {
          const { data: signed, error } = await supabase.storage
            .from("frames")
            .createSignedUrl(row.storage_path, 60 * 60);
          if (error || !signed?.signedUrl) continue;
          const res = await fetch(signed.signedUrl);
          const blob = await res.blob();
          const mime = blob.type || "image/jpeg";
          const file = new File([blob], row.name || `library-${row.id}.jpg`, {
            type: mime,
            lastModified: Date.now(),
          });
          const lat = row.lat != null ? Number(row.lat) : pinnedCoord?.lat ?? null;
          const lng = row.lng != null ? Number(row.lng) : pinnedCoord?.lng ?? null;
          built.push({
            id: crypto.randomUUID(),
            file,
            previewUrl: URL.createObjectURL(blob),
            lat,
            lng,
            locationLabel:
              row.lat != null && row.lng != null
                ? `Existing tag ${Number(row.lat).toFixed(4)}, ${Number(row.lng).toFixed(4)}`
                : pinnedCoord?.label ?? null,
            title: row.title ?? row.name ?? file.name,
            description: row.description ?? "",
            keywords: [],
            status: "pending",
            libraryId: row.id,
            libraryStoragePath: row.storage_path,
            // Always treat library-sourced images as having existing metadata —
            // we pre-fill title (from title → name → filename) and description,
            // so the user doesn't have to re-enter anything from the previous step.
            hasExistingMeta: true,
            favorite: Boolean(row.is_favorite),
          });
        }
        setImages((prev) => [...prev, ...built]);
        toast.success(`Imported ${built.length} image${built.length === 1 ? "" : "s"} from library.`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Library import failed.");
      } finally {
        setImportingFromLibrary(false);
      }
    },
    [alreadyImportedIds, pinnedCoord],
  );

  /* --------------------------- upload handling --------------------------- */

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (list.length === 0) {
        toast.error("Please choose image files.");
        return;
      }
      // Read existing EXIF title/description/GPS in parallel so we don't
      // re-prompt for metadata that's already embedded in the file.
      const enriched = await Promise.all(
        list.map(async (f) => {
          const [meta, gps] = await Promise.all([readMeta(f), readGps(f)]);
          return { file: f, meta, gps };
        }),
      );
      setImages((prev) => [
        ...prev,
        ...enriched.map(({ file: f, meta, gps }) => {
          const lat = gps.hasGps && gps.lat != null ? gps.lat : pinnedCoord?.lat ?? null;
          const lng = gps.hasGps && gps.lng != null ? gps.lng : pinnedCoord?.lng ?? null;
          const locationLabel = gps.hasGps
            ? `Existing tag ${gps.lat!.toFixed(4)}, ${gps.lng!.toFixed(4)}`
            : pinnedCoord?.label ?? null;
          const hasExistingMeta = Boolean(meta.title || meta.description);
          return {
            id: crypto.randomUUID(),
            file: f,
            previewUrl: URL.createObjectURL(f),
            lat,
            lng,
            locationLabel,
            title: meta.title || "",
            description: meta.description || "",
            keywords: meta.keywords ?? [],
            status: "pending" as const,
            hasExistingMeta: hasExistingMeta || (meta.keywords?.length ?? 0) > 0,
            metaSources: meta.sources,
            metaRaw: meta.raw,
          };
        }),
      ]);
      // Surface any metadata consistency warnings (e.g. title==description,
      // XPSubject-only descriptions) so the user knows why a field was
      // remapped or left blank.
      const warnings = enriched.flatMap(({ file: f, meta }) =>
        meta.warnings.map((w) => `${f.name}: ${w}`),
      );
      if (warnings.length > 0) {
        console.warn("[geotagging] EXIF consistency notes:", warnings);
        toast.warning(
          warnings.length === 1
            ? warnings[0]
            : `Metadata consistency check flagged ${warnings.length} issue${warnings.length === 1 ? "" : "s"} — see console for details.`,
        );
      }
      if (pinnedCoord) {
        toast.success(
          `Auto-tagged ${list.length} new image${list.length === 1 ? "" : "s"} with ${pinnedCoord.label}.`,
        );
      }
    },
    [pinnedCoord],
  );

  const removeImage = (id: string) => {
    setImages((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
    setSelected((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  };

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const selectAll = () => setSelected(new Set(images.map((i) => i.id)));
  const clearSelection = () => setSelected(new Set());

  /* --------------------------- filtered places --------------------------- */

  const filteredPlaces = useMemo(() => {
    const q = placeSearch.trim().toLowerCase();
    return places.filter((p) => {
      if (areaFilter !== "All" && p.area !== areaFilter) return false;
      if (typeFilter !== "All" && p.type !== typeFilter) return false;
      if (
        q &&
        !`${p.name} ${p.area} ${p.address ?? ""}`.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [places, areaFilter, typeFilter, placeSearch]);


  /* ----------------------------- apply coords ---------------------------- */

  const activeCoord = customLocation
    ? { lat: customLocation.lat, lng: customLocation.lng, label: customLocation.label }
    : activePlace
      ? { lat: activePlace.lat, lng: activePlace.lng, label: `${activePlace.name}, ${activePlace.area}` }
      : null;

  const applyToTargets = (targetIds: string[]) => {
    if (!activeCoord) {
      toast.error("Pick a location first.");
      return;
    }
    setImages((prev) =>
      prev.map((img) =>
        targetIds.includes(img.id)
          ? {
              ...img,
              lat: activeCoord.lat,
              lng: activeCoord.lng,
              locationLabel: activeCoord.label,
            }
          : img,
      ),
    );
    toast.success(
      `Applied ${activeCoord.label} to ${targetIds.length} image${targetIds.length === 1 ? "" : "s"}.`,
    );
  };

  const applyToSelected = () => {
    const ids = selected.size ? Array.from(selected) : images.map((i) => i.id);
    if (ids.length === 0) {
      toast.error("Upload some images first.");
      return;
    }
    applyToTargets(ids);
  };

  // Every coordinate the user can assign to a single image from Step 2.
  const coordOptions = useMemo(() => {
    const out: { key: string; label: string; lat: number; lng: number }[] = [];
    const seen = new Set<string>();
    const push = (key: string, label: string, lat: number, lng: number) => {
      const k = `${lat.toFixed(6)},${lng.toFixed(6)}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ key, label, lat, lng });
    };
    if (customLocation) push("custom", customLocation.label, customLocation.lat, customLocation.lng);
    if (pinnedCoord) push("pinned", pinnedCoord.label, pinnedCoord.lat, pinnedCoord.lng);
    filteredPlaces.forEach((p) => push(p.id, `${p.name}, ${p.area}`, p.lat, p.lng));
    return out;
  }, [customLocation, pinnedCoord, filteredPlaces]);

  // Assign one specific coordinate to one specific image (per-image tagging).
  const assignCoordToImage = (
    id: string,
    coord: { lat: number; lng: number; label: string } | null,
  ) => {
    setImages((prev) =>
      prev.map((img) =>
        img.id === id
          ? {
              ...img,
              lat: coord?.lat ?? null,
              lng: coord?.lng ?? null,
              locationLabel: coord?.label ?? null,
            }
          : img,
      ),
    );
  };


  const updateImageMeta = (
    id: string,
    patch: Partial<Pick<LocalImage, "title" | "description" | "keywords">>,
  ) => {
    setImages((prev) => prev.map((img) => (img.id === id ? { ...img, ...patch } : img)));
  };

  const applyMetaToTargets = (
    ids: string[],
    patch: Partial<Pick<LocalImage, "title" | "description" | "keywords">>,
  ) => {
    if (ids.length === 0) return;
    setImages((prev) =>
      prev.map((img) => (ids.includes(img.id) ? { ...img, ...patch } : img)),
    );
  };

  const copyCoord = async () => {
    if (!activeCoord) return;
    await navigator.clipboard.writeText(`${activeCoord.lat}, ${activeCoord.lng}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  /* ---------------------------- save to cloud ---------------------------- */

  const readyToSave = images.filter(
    (i) => i.lat !== null && i.lng !== null && i.status !== "saved",
  );

  const saveAll = async () => {
    if (readyToSave.length === 0) {
      toast.error("Tag images with a location before saving.");
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      toast.error("Not signed in.");
      return;
    }

    setSavingBulk(true);
    let ok = 0;
    let fail = 0;

    for (const img of readyToSave) {
      setImages((prev) =>
        prev.map((x) => (x.id === img.id ? { ...x, status: "saving" } : x)),
      );
      try {
        // Embed GPS EXIF into the JPEG bytes so third-party viewers (Photos,
        // Windows Explorer, Lightroom, etc.) recognise the coordinates.
        const tagged = await embedGps(img.file, img.lat!, img.lng!, {
          title: img.title,
          description: img.description,
          keywords: mergeKeywordSet(img.keywords, img.locationLabel),
        });

        if (img.libraryId && img.libraryStoragePath) {
          // Overwrite the existing storage object so the file itself carries
          // the new GPS EXIF, and update the DB row rather than inserting.
          const { error: upErr } = await supabase.storage
            .from("frames")
            .upload(img.libraryStoragePath, tagged, {
              contentType: tagged.type,
              upsert: true,
            });
          if (upErr) throw upErr;
          const { error: dbErr } = await supabase
            .from("images")
            .update({
              lat: img.lat,
              lng: img.lng,
              title: img.title.trim() || null,
              description: img.description.trim() || null,
            } as never)
            .eq("id", img.libraryId);
          if (dbErr) throw dbErr;
        } else {
          const ext = tagged.name.split(".").pop() || "jpg";
          const path = `${userId}/geotag/${crypto.randomUUID()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("frames")
            .upload(path, tagged, { contentType: tagged.type, upsert: false });
          if (upErr) throw upErr;
          const { error: dbErr } = await supabase.from("images").insert({
            owner_id: userId,
            storage_path: path,
            name: img.file.name,
            lat: img.lat,
            lng: img.lng,
            title: img.title.trim() || null,
            description: img.description.trim() || null,
          } as never);
          if (dbErr) throw dbErr;
        }

        ok++;
        setImages((prev) =>
          prev.map((x) => (x.id === img.id ? { ...x, status: "saved" } : x)),
        );
      } catch (e) {
        fail++;
        setImages((prev) =>
          prev.map((x) =>
            x.id === img.id
              ? { ...x, status: "error", error: (e as Error).message }
              : x,
          ),
        );
      }
    }

    setSavingBulk(false);
    if (fail === 0) toast.success(`Saved ${ok} geotagged image${ok === 1 ? "" : "s"}.`);
    else toast.error(`${ok} saved, ${fail} failed.`);
    reloadLibrary();
  };

  /* --------------------------- download processed --------------------------- */

  const downloadProcessed = async (img: LocalImage) => {
    if (img.lat === null || img.lng === null) {
      toast.error("Tag this image with a location first.");
      return;
    }
    try {
      const tagged = await embedGps(img.file, img.lat, img.lng, {
        title: img.title,
        description: img.description,
        keywords: mergeKeywordSet(img.keywords, img.locationLabel),
      });
      const url = URL.createObjectURL(tagged);
      const a = document.createElement("a");
      a.href = url;
      // Prefer the user-supplied title (e.g. "Exterior Window Cleaning") over the
      // raw uploaded filename (e.g. "003(1).jpg") when we build the "Save As" name.
      const rawBase = img.title?.trim() || img.file.name.replace(/\.[^.]+$/, "");
      const base = rawBase.replace(/[^\p{L}\p{N}\s._-]/gu, "").trim().replace(/\s+/g, "-") || "image";
      // Derive extension from the actual MIME type of the tagged blob so
      // non-JPEG originals (PNG/WebP/HEIC) still download with a viewer-
      // friendly extension. Falling back to the filename left files with
      // stripped or wrong extensions that Windows/Preview couldn't open.
      const mimeExt: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/heic": "heic",
        "image/heif": "heif",
      };
      const fromName = tagged.name.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase();
      const ext = mimeExt[tagged.type?.toLowerCase() ?? ""] || fromName || "jpg";
      a.download = `${base}-geotagged.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed.");
    }
  };


  /* --------------------------------- UI --------------------------------- */

  const stats = {
    total: images.length,
    tagged: images.filter((i) => i.lat !== null).length,
    saved: images.filter((i) => i.status === "saved").length,
  };

  const expandedCoords = typeFilter === "home" || typeFilter === "office";

  const steps = [
    { n: 1 as const, title: "Upload images", hint: "Drop or browse photos" },
    { n: 2 as const, title: "Choose location", hint: "Pick a coordinate" },
    { n: 3 as const, title: "Assign & review", hint: "Apply to your batch" },
    { n: 4 as const, title: "Save", hint: "Push to library" },
  ];

  const canNext =
    (step === 1 && images.length > 0) ||
    (step === 2 && activeCoord !== null) ||
    (step === 3 && stats.tagged > 0) ||
    step === 4;

  const gotoNext = () => {
    if (step === 1 && images.length === 0) return toast.error("Upload at least one image.");
    if (step === 2 && !activeCoord) return toast.error("Pick a location first.");
    if (step === 3 && stats.tagged === 0) return toast.error("Tag at least one image.");
    if (step < 4) setStep(((step + 1) as 1 | 2 | 3 | 4));
  };

  const gotoBack = () => {
    if (step > 1) setStep(((step - 1) as 1 | 2 | 3 | 4));
  };

  return (
    <div className="mx-auto max-w-[1200px] p-6">
      {/* Header */}
      <header className="mb-6">
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
          <MapPin className="h-3.5 w-3.5" /> Geotagging wizard
        </div>
        <h1 className="font-display text-3xl leading-tight">Bulk image geotagging</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          A guided flow — upload, choose a location, assign, then save. One step at a time.
        </p>
      </header>

      {/* Tabs */}
      <div className="mb-6 inline-flex rounded-lg border border-border bg-card p-1">
        <button
          onClick={() => setTab("wizard")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
            tab === "wizard" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Geotagging wizard
        </button>
        <button
          onClick={() => setTab("verify")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
            tab === "verify" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          GeoTag Imager
        </button>
      </div>

      {tab === "verify" ? (
        <GeoTagImager library={library} libraryLoading={libraryLoading} onRefresh={reloadLibrary} />

      ) : (
      <>
      {/* Progress bar */}
      <ol className="mb-8 grid grid-cols-4 gap-2">
        {steps.map((s) => {
          const done = step > s.n;
          const active = step === s.n;
          return (
            <li key={s.n}>
              <button
                onClick={() => {
                  // allow backwards nav freely; forward only if valid
                  if (s.n <= step) setStep(s.n);
                }}
                className="w-full text-left"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-semibold transition ${
                      done
                        ? "border-primary bg-primary text-primary-foreground"
                        : active
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border bg-card text-muted-foreground"
                    }`}
                  >
                    {done ? <CircleCheck className="h-4 w-4" /> : s.n}
                  </div>
                  <div className="min-w-0">
                    <div
                      className={`truncate text-xs font-medium ${
                        active ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      Step {s.n}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground/80">{s.title}</div>
                  </div>
                </div>
                <div
                  className={`mt-2 h-1 rounded-full transition ${
                    done || active ? "bg-primary" : "bg-muted"
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ol>

      {/* Persistent lightweight status strip */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
        <StatChip label="Uploaded" value={stats.total} />
        <StatChip label="Tagged" value={stats.tagged} tone="primary" />
        <StatChip label="Saved" value={stats.saved} tone="success" />
        {activeCoord && (
          <div className="ml-auto flex min-w-0 items-center gap-2 rounded-md bg-muted/60 px-2 py-1 text-[11px]">
            <Crosshair className="h-3.5 w-3.5 text-primary" />
            <span className="truncate max-w-[220px]" title={activeCoord.label}>
              {activeCoord.label}
            </span>
            <span className="font-mono text-muted-foreground/80">
              {activeCoord.lat.toFixed(4)}, {activeCoord.lng.toFixed(4)}
            </span>
          </div>
        )}
      </div>

      {/* Step body */}
      <section className="rounded-2xl border border-border bg-card p-5 md:p-6">
        {step === 1 && (
          <StepUpload
            images={images}
            dragOver={dragOver}
            setDragOver={setDragOver}
            inputRef={inputRef}
            addFiles={addFiles}
            removeImage={removeImage}
            library={library}
            libraryLoading={libraryLoading}
            reloadLibrary={reloadLibrary}
            openLibrary={() => setLibraryOpen(true)}
            alreadyImportedIds={alreadyImportedIds}
            addFromLibrary={addFromLibrary}
            importingFromLibrary={importingFromLibrary}
          />
        )}

        {step === 2 && (
          <StepLocation
            openSection={openSection}
            setOpenSection={setOpenSection}
            pinnedCoord={pinnedCoord}
            setPinnedCoord={setPinnedCoord}
            homePlaces={homePlaces}
            officePlaces={officePlaces}
            homePickId={homePickId}
            setHomePickId={setHomePickId}
            officePickId={officePickId}
            setOfficePickId={setOfficePickId}
            setActivePlace={setActivePlace}
            setCustomLocation={setCustomLocation}
            filteredPlaces={filteredPlaces}
            placesLoading={placesLoading}
            placesError={placesError}
            activePlace={activePlace}
            customLocation={customLocation}
            areaFilter={areaFilter}
            setAreaFilter={setAreaFilter}
            typeFilter={typeFilter}
            setTypeFilter={setTypeFilter}
            placeSearch={placeSearch}
            setPlaceSearch={setPlaceSearch}
            expandedCoords={expandedCoords}
            activeCoord={activeCoord}
            copyCoord={copyCoord}
            copied={copied}
            onRefresh={refreshLocations}
            refreshing={refreshing}
            refreshKey={refreshKey}
            cityOptions={cityOptions}
            images={images}
            coordOptions={coordOptions}
            assignCoordToImage={assignCoordToImage}

          />

        )}

        {step === 3 && (
          <StepAssign
            images={images}
            selected={selected}
            toggleSelect={toggleSelect}
            selectAll={selectAll}
            clearSelection={clearSelection}
            activeCoord={activeCoord}
            applyToTargets={applyToTargets}
            applyToSelected={applyToSelected}
            removeImage={removeImage}
            inputRef={inputRef}
            addFiles={addFiles}
            openLibrary={() => setLibraryOpen(true)}
            downloadProcessed={downloadProcessed}
            updateImageMeta={updateImageMeta}
            applyMetaToTargets={applyMetaToTargets}
          />
        )}

        {step === 4 && (
          <StepSave
            stats={stats}
            readyToSave={readyToSave}
            savingBulk={savingBulk}
            saveAll={saveAll}
            images={images}
            downloadProcessed={downloadProcessed}
          />
        )}
      </section>

      {/* Validation notice */}
      {step < 4 && !canNext && (
        <div className="mt-6 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          <span aria-hidden>⚠</span>
          <span>
            {step === 1
              ? "Upload at least one image to continue."
              : step === 2
                ? "Choose a location (Quick pick, Library, or Map) to continue."
                : "Tag at least one image to continue."}
          </span>
        </div>
      )}

      {/* Wizard nav */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          onClick={gotoBack}
          disabled={step === 1}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm hover:bg-accent disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <div className="text-xs text-muted-foreground">
          Step {step} of 4 · {steps[step - 1].hint}
        </div>
        {step < 4 ? (
          <button
            onClick={gotoNext}
            disabled={!canNext}
            aria-disabled={!canNext}
            title={
              !canNext
                ? step === 1
                  ? "Upload at least one image"
                  : step === 2
                    ? "Choose a location first"
                    : "Tag at least one image"
                : undefined
            }
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={saveAll}
            disabled={savingBulk || readyToSave.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {savingBulk ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UploadCloud className="h-4 w-4" />
            )}
            Save {readyToSave.length > 0 ? readyToSave.length : ""} to cloud
          </button>
        )}
      </div>
      </>
      )}

      {/* Library gallery modal */}
      {libraryOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setLibraryOpen(false)}
        >
          <div
            className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div>
                <div className="text-sm font-medium">Your image library</div>
                <div className="text-xs text-muted-foreground">
                  {library.length} available · {alreadyImportedIds.size} already added
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={librarySearch}
                    onChange={(e) => setLibrarySearch(e.target.value)}
                    placeholder="Search by name…"
                    className="w-56 rounded-md border border-border bg-background pl-7 pr-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <button
                  onClick={() => setLibraryOpen(false)}
                  className="rounded p-1 hover:bg-accent"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {(() => {
                const q = librarySearch.trim().toLowerCase();
                const filtered = q
                  ? library.filter((r) => r.name.toLowerCase().includes(q))
                  : library;
                if (filtered.length === 0) {
                  return (
                    <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                      No images match.
                    </div>
                  );
                }
                return (
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                    {filtered.map((row) => {
                      const imported = alreadyImportedIds.has(row.id);
                      return (
                        <LibraryThumb
                          key={row.id}
                          row={row}
                          imported={imported}
                          onClick={() => !imported && addFromLibrary([row])}
                        />
                      );
                    })}
                  </div>
                );
              })()}
            </div>
            <div className="flex items-center justify-between border-t border-border px-5 py-3">
              <div className="text-xs text-muted-foreground">
                {importingFromLibrary ? "Importing…" : "Click any image to add it to the batch."}
              </div>
              <button
                onClick={() => setLibraryOpen(false)}
                className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Collapsible section                                                        */
/* -------------------------------------------------------------------------- */

function Collapsible({
  title,
  subtitle,
  open,
  onToggle,
  badge,
  children,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 bg-muted/30 px-4 py-3 text-left hover:bg-muted/50"
      >
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "" : "-rotate-90"
          }`}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{title}</div>
          {subtitle && (
            <div className="truncate text-[11px] text-muted-foreground">{subtitle}</div>
          )}
        </div>
        {badge}
      </button>
      {open && <div className="border-t border-border p-4">{children}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 1 — Upload                                                            */
/* -------------------------------------------------------------------------- */

function StepUpload({
  images,
  dragOver,
  setDragOver,
  inputRef,
  addFiles,
  removeImage,
  library,
  libraryLoading,
  reloadLibrary,
  openLibrary,
  alreadyImportedIds,
  addFromLibrary,
  importingFromLibrary,
}: {
  images: LocalImage[];
  dragOver: boolean;
  setDragOver: (b: boolean) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  addFiles: (f: FileList | File[]) => void;
  removeImage: (id: string) => void;
  library: LibraryImage[];
  libraryLoading: boolean;
  reloadLibrary: () => void;
  openLibrary: () => void;
  alreadyImportedIds: Set<string>;
  addFromLibrary: (rows: LibraryImage[]) => Promise<void>;
  importingFromLibrary: boolean;
}) {
  const PREVIEW_COUNT = 8;
  const previewLibrary = library.slice(0, PREVIEW_COUNT);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Upload your images</h2>
        <p className="text-sm text-muted-foreground">
          Drop a batch of photos below, or pick from your existing library. You can add
          more or remove any at later steps.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/60"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
        <UploadCloud className="h-8 w-8 text-muted-foreground" />
        <div className="text-sm font-medium">Drop images here or click to browse</div>
        <div className="text-xs text-muted-foreground">JPG, PNG, WEBP — bulk upload supported</div>
      </div>

      {/* Library picker */}
      <section className="rounded-xl border border-border bg-card/40 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Library className="h-4 w-4 text-primary" /> Pick from your library
            <span className="text-xs text-muted-foreground">
              ({library.length} available)
            </span>
            {importingFromLibrary && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </div>
          <button
            type="button"
            onClick={reloadLibrary}
            className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
          >
            {libraryLoading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {previewLibrary.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No images in your library yet. Uploaded and geotagged images will appear here.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2 md:grid-cols-8">
              {previewLibrary.map((row) => {
                const imported = alreadyImportedIds.has(row.id);
                return (
                  <LibraryThumb
                    key={row.id}
                    row={row}
                    imported={imported}
                    onClick={() => !imported && addFromLibrary([row])}
                  />
                );
              })}
            </div>
            {library.length > PREVIEW_COUNT && (
              <button
                onClick={openLibrary}
                className="mt-3 w-full rounded-md border border-border py-2 text-xs font-medium hover:border-primary/50 hover:bg-accent"
              >
                View all {library.length} images →
              </button>
            )}
          </>
        )}
      </section>

      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 md:grid-cols-5 lg:grid-cols-6">
          {images.map((img) => (
            <div key={img.id} className="group relative overflow-hidden rounded-lg border border-border">
              <img
                src={img.previewUrl}
                alt={img.file.name}
                className="aspect-square h-full w-full object-cover"
              />
              {img.libraryId && (
                <span className="absolute left-1 top-1 rounded-md bg-primary/85 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary-foreground">
                  Library
                </span>
              )}
              {img.favorite && (
                <div className="absolute right-1 bottom-1 pointer-events-none">
                  <FavoriteBadge favorite compact />
                </div>
              )}
              <button
                onClick={() => removeImage(img.id)}
                className="absolute right-1 top-1 rounded-md bg-background/90 p-1 opacity-0 shadow transition group-hover:opacity-100 hover:text-destructive"
                aria-label="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LibraryThumb({
  row,
  imported,
  onClick,
}: {
  row: LibraryImage;
  imported: boolean;
  onClick: () => void;
}) {
  const url = useSignedUrl("frames", row.storage_path);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={imported}
      title={imported ? "Already added" : row.name}
      className={`relative overflow-hidden rounded-md border transition ${
        imported
          ? "border-primary/50 opacity-60"
          : "border-border hover:border-primary hover:ring-2 hover:ring-primary/40"
      }`}
    >
      {url ? (
        <img src={url} alt={row.name} className="aspect-square w-full object-cover" />
      ) : (
        <div className="aspect-square w-full animate-pulse bg-muted" />
      )}
      {row.lat != null && row.lng != null && (
        <span className="absolute left-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white shadow ring-2 ring-emerald-500/20">
          <MapPin className="h-2.5 w-2.5" />
        </span>
      )}
      {row.is_favorite && (
        <div className="absolute right-1 top-1">
          <FavoriteBadge favorite compact />
        </div>
      )}
      {imported && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-[10px] font-semibold text-primary">
          Added
        </div>
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 2 — Location                                                          */
/* -------------------------------------------------------------------------- */

function StepLocation(props: {
  openSection: "quick" | "library" | "map";
  setOpenSection: (s: "quick" | "library" | "map") => void;
  pinnedCoord: { lat: number; lng: number; label: string; kind: "home" | "office" | "custom" } | null;
  setPinnedCoord: (
    p: { lat: number; lng: number; label: string; kind: "home" | "office" | "custom" } | null,
  ) => void;
  homePlaces: Place[];
  officePlaces: Place[];
  homePickId: string;
  setHomePickId: (id: string) => void;
  officePickId: string;
  setOfficePickId: (id: string) => void;
  setActivePlace: (p: Place | null) => void;
  setCustomLocation: (l: PickedLocation | null) => void;
  filteredPlaces: Place[];
  placesLoading: boolean;
  placesError: string | null;
  activePlace: Place | null;
  customLocation: PickedLocation | null;
  areaFilter: string;
  setAreaFilter: (a: string) => void;
  typeFilter: PlaceType | "All";
  setTypeFilter: (t: PlaceType | "All") => void;
  placeSearch: string;
  setPlaceSearch: (s: string) => void;
  expandedCoords: boolean;
  activeCoord: { lat: number; lng: number; label: string } | null;
  copyCoord: () => void;
  copied: boolean;
  onRefresh: () => void;
  refreshing: boolean;
  refreshKey: number;
  cityOptions: { name: string; lat: number; lng: number }[];
  images: LocalImage[];
  coordOptions: { key: string; label: string; lat: number; lng: number }[];
  assignCoordToImage: (
    id: string,
    coord: { lat: number; lng: number; label: string } | null,
  ) => void;

}) {
  const {
    openSection,
    setOpenSection,
    pinnedCoord,
    setPinnedCoord,
    homePlaces,
    officePlaces,
    homePickId,
    setHomePickId,
    officePickId,
    setOfficePickId,
    setActivePlace,
    setCustomLocation,
    filteredPlaces,
    placesLoading,
    placesError,
    activePlace,
    customLocation,
    areaFilter,
    setAreaFilter,
    typeFilter,
    setTypeFilter,
    placeSearch,
    setPlaceSearch,
    expandedCoords,
    activeCoord,
    copyCoord,
    copied,
    onRefresh,
    refreshing,
    refreshKey,
    cityOptions,
    images,
    coordOptions,
    assignCoordToImage,
  } = props;


  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Choose a location</h2>
          <p className="text-sm text-muted-foreground">
            Pick from a quick preset, browse the library, or drop a pin on the map.
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          title="Refresh coordinates for all options"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>


      {/* Selected coordinate summary */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/15 text-primary">
          <Crosshair className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {activeCoord?.label ?? "No location selected yet"}
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            {activeCoord
              ? `${activeCoord.lat.toFixed(6)}, ${activeCoord.lng.toFixed(6)}`
              : "Choose a section below"}
          </div>
        </div>
        <button
          onClick={copyCoord}
          disabled={!activeCoord}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-40"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {/* Per-image coordinate assignment */}
      {images.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-medium text-muted-foreground">
              Assign a location per image
              <span className="ml-1 text-muted-foreground/70">
                — optional; leave blank to use the batch coordinate in Step 3.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!activeCoord) return toast.error("Pick a location first.");
                images.forEach((img) => assignCoordToImage(img.id, activeCoord));
                toast.success(`Applied ${activeCoord.label} to all ${images.length} images.`);
              }}
              disabled={!activeCoord}
              className="rounded-md border border-border px-2.5 py-1 text-[11px] hover:bg-accent disabled:opacity-40"
            >
              Use selected for all
            </button>
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {images.map((img) => {
              const currentKey =
                img.lat !== null && img.lng !== null
                  ? coordOptions.find(
                      (o) =>
                        o.lat.toFixed(6) === img.lat!.toFixed(6) &&
                        o.lng.toFixed(6) === img.lng!.toFixed(6),
                    )?.key ?? "__current"
                  : "";
              return (
                <div
                  key={img.id}
                  className="flex items-center gap-3 rounded-md border border-border bg-background p-2"
                >
                  <img
                    src={img.previewUrl}
                    alt={img.file.name}
                    className="h-11 w-11 shrink-0 rounded object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium" title={img.file.name}>
                      {img.file.name}
                    </div>
                    <div className="truncate font-mono text-[11px] text-muted-foreground">
                      {img.lat !== null && img.lng !== null
                        ? `${img.lat.toFixed(6)}, ${img.lng.toFixed(6)}`
                        : "Not tagged"}
                    </div>
                  </div>
                  <select
                    value={currentKey}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return assignCoordToImage(img.id, null);
                      if (v === "__active") {
                        if (!activeCoord) return;
                        return assignCoordToImage(img.id, activeCoord);
                      }
                      const opt = coordOptions.find((o) => o.key === v);
                      if (opt)
                        assignCoordToImage(img.id, {
                          lat: opt.lat,
                          lng: opt.lng,
                          label: opt.label,
                        });
                    }}
                    className="w-52 shrink-0 rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">No location</option>
                    {currentKey === "__current" && (
                      <option value="__current">{img.locationLabel ?? "Current coordinate"}</option>
                    )}
                    {activeCoord && <option value="__active">Selected: {activeCoord.label}</option>}
                    {coordOptions.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}






      {/* Collapsible: library */}
      <Collapsible
        title="Location library"
        subtitle={
          placesLoading
            ? "Searching Google Places…"
            : `${filteredPlaces.length} real places found · filter by area & type`
        }
        open={openSection === "library"}
        onToggle={() => setOpenSection("library")}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={placeSearch}
              onChange={(e) => setPlaceSearch(e.target.value)}
              placeholder="Search Al Qusais, Marina…"
              className="w-full rounded-md border border-input bg-background py-2 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as PlaceType | "All")}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
            >
              <option value="All">All types</option>
              <option value="home">Home</option>
              <option value="office">Office</option>
              <option value="commercial">Commercial</option>
            </select>
            <select
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
            >
              <option value="All">All areas</option>
              {AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>

        {placesError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-6 text-center text-xs text-destructive">
            {placesError}
          </div>
        ) : placesLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching Google Places…
          </div>
        ) : filteredPlaces.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            No real places found — try a different city or type.
          </div>
        ) : (
          <div
            className={`grid gap-2 ${
              expandedCoords ? "md:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-2 lg:grid-cols-3"
            } max-h-[360px] overflow-auto pr-1`}
          >
            {filteredPlaces.map((p) => {
              const active = activePlace?.id === p.id && !customLocation;
              const meta = TYPE_META[p.type];
              const Icon = meta.icon;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setActivePlace(p);
                    setCustomLocation(null);
                  }}
                  className={`flex items-start gap-3 rounded-lg border p-3 text-left transition ${
                    active
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  <span className={`mt-0.5 grid h-9 w-9 place-items-center rounded-md ${meta.tone}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {p.area} · {meta.label}
                    </span>
                    <span className="mt-1 block rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                      {p.lat.toFixed(6)}, {p.lng.toFixed(6)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Collapsible>

      {/* Collapsible: map */}
      <Collapsible
        title="Pick anywhere on the map"
        subtitle="Drop a pin to use a custom coordinate."
        open={openSection === "map"}
        onToggle={() => setOpenSection("map")}
        badge={
          customLocation && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
              Custom
            </span>
          )
        }
      >
        <LocationPicker
          value={customLocation}
          onChange={setCustomLocation}
          compact
          cityOptions={cityOptions}
          refreshKey={refreshKey}
        />

      </Collapsible>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 3 — Assign & review                                                   */
/* -------------------------------------------------------------------------- */

function StepAssign({
  images,
  selected,
  toggleSelect,
  selectAll,
  clearSelection,
  activeCoord,
  applyToTargets,
  applyToSelected,
  removeImage,
  inputRef,
  addFiles,
  openLibrary,
  downloadProcessed,
  updateImageMeta,
  applyMetaToTargets,
}: {
  images: LocalImage[];
  selected: Set<string>;
  toggleSelect: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  activeCoord: { lat: number; lng: number; label: string } | null;
  applyToTargets: (ids: string[]) => void;
  applyToSelected: () => void;
  removeImage: (id: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  addFiles: (f: FileList | File[]) => void;
  openLibrary: () => void;
  downloadProcessed: (img: LocalImage) => Promise<void>;
  updateImageMeta: (
    id: string,
    patch: Partial<Pick<LocalImage, "title" | "description">>,
  ) => void;
  applyMetaToTargets: (
    ids: string[],
    patch: Partial<Pick<LocalImage, "title" | "description">>,
  ) => void;
}) {
  const [batchTitle, setBatchTitle] = useState("");
  const [batchDescription, setBatchDescription] = useState("");
  const prefilledRef = useRef(false);

  // Auto-fill the batch title/description from any uploaded image that already
  // carries embedded metadata, so users don't have to retype what's in the file.
  useEffect(() => {
    if (prefilledRef.current) return;
    const withMeta = images.find(
      (i) => i.hasExistingMeta && (i.title || i.description),
    );
    if (!withMeta) return;
    if (!batchTitle && withMeta.title) setBatchTitle(withMeta.title);
    if (!batchDescription && withMeta.description)
      setBatchDescription(withMeta.description);
    prefilledRef.current = true;
  }, [images, batchTitle, batchDescription]);

  const applyBatchMeta = () => {
    const ids = selected.size ? Array.from(selected) : images.map((i) => i.id);
    if (ids.length === 0) {
      toast.error("Upload some images first.");
      return;
    }
    const patch: Partial<Pick<LocalImage, "title" | "description">> = {};
    if (batchTitle.trim()) patch.title = batchTitle.trim();
    if (batchDescription.trim()) patch.description = batchDescription.trim();
    if (Object.keys(patch).length === 0) {
      toast.error("Enter a title or description first.");
      return;
    }
    applyMetaToTargets(ids, patch);
    toast.success(
      `Applied details to ${ids.length} image${ids.length === 1 ? "" : "s"}.`,
    );
  };
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Assign the coordinate</h2>
        <p className="text-sm text-muted-foreground">
          Apply to every image, just the selected ones, or tag individually.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
        <div className="text-xs text-muted-foreground">
          <b className="text-foreground">{images.length}</b> image{images.length === 1 ? "" : "s"} ·{" "}
          <b className="text-foreground">{selected.size}</b> selected
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" /> Add photos
          </button>
          <button
            type="button"
            onClick={openLibrary}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent"
          >
            <Library className="h-3.5 w-3.5" /> From library
          </button>
          <button
            onClick={selected.size === images.length ? clearSelection : selectAll}
            disabled={images.length === 0}
            className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent disabled:opacity-40"
          >
            {selected.size === images.length && images.length > 0 ? "Clear selection" : "Select all"}
          </button>
          <button
            onClick={applyToSelected}
            disabled={!activeCoord || images.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            <MapPin className="h-3.5 w-3.5" />
            Apply to {selected.size > 0 ? `${selected.size} selected` : "all"}
          </button>
        </div>
      </div>

      {/* Batch title + description */}
      <div className="rounded-lg border border-border bg-muted/20 p-3">
        <div className="mb-2 text-xs font-medium text-muted-foreground">
          Title &amp; description for this batch
          <span className="ml-1 text-muted-foreground/70">
            — applied alongside the location when you save.
          </span>
        </div>
        <div className="grid gap-2 md:grid-cols-[1fr_1.5fr_auto]">
          <input
            value={batchTitle}
            onChange={(e) => setBatchTitle(e.target.value)}
            placeholder="Title (e.g. Marina villa exterior)"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            value={batchDescription}
            onChange={(e) => setBatchDescription(e.target.value)}
            placeholder="Description shown on hover in the library"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="button"
            onClick={applyBatchMeta}
            disabled={images.length === 0}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            Apply to {selected.size > 0 ? `${selected.size} selected` : "all"}
          </button>
        </div>
      </div>

      {images.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          <ImageIcon className="mx-auto mb-2 h-8 w-8 opacity-40" />
          No images uploaded.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {images.map((img) => {
            const isSelected = selected.has(img.id);
            return (
              <div
                key={img.id}
                className={`group relative overflow-hidden rounded-xl border bg-card transition ${
                  isSelected ? "border-primary ring-2 ring-primary/40" : "border-border"
                }`}
              >
                <button
                  onClick={() => toggleSelect(img.id)}
                  className="relative block aspect-square w-full overflow-hidden"
                >
                  <img
                    src={img.previewUrl}
                    alt={img.file.name}
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                  {img.lat !== null && img.lng !== null && (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow ring-2 ring-emerald-500/20">
                      <MapPin className="h-3 w-3" />
                      Geotagged
                    </span>
                  )}
                  {isSelected && <span className="absolute inset-0 ring-2 ring-inset ring-primary" />}
                </button>
                <div className="space-y-1 p-2.5">
                  <div className="truncate text-xs font-medium" title={img.file.name}>
                    {img.file.name}
                  </div>
                  <div className="truncate text-[11px] font-medium text-foreground" title={img.locationLabel ?? ""}>
                    {img.locationLabel ? cityFromLabel(img.locationLabel) : "Not tagged"}
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground" title={img.locationLabel ?? ""}>
                    {img.locationLabel ?? "No location assigned"}
                  </div>
                  <div className="truncate rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                    {img.lat !== null && img.lng !== null
                      ? `${img.lat.toFixed(6)}, ${img.lng.toFixed(6)}`
                      : "—"}
                  </div>

                  <MetaFields
                    img={img}
                    updateImageMeta={updateImageMeta}
                  />


                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      onClick={() => applyToTargets([img.id])}
                      disabled={!activeCoord}
                      className="flex-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-40"
                    >
                      Tag
                    </button>
                    <button
                      onClick={() => downloadProcessed(img)}
                      disabled={img.lat === null}
                      className="rounded-md border border-border p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                      aria-label="Download geotagged"
                      title="Download with GPS EXIF"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => removeImage(img.id)}
                      className="rounded-md border border-border p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 4 — Save                                                              */
/* -------------------------------------------------------------------------- */

function StepSave({
  stats,
  readyToSave,
  savingBulk,
  saveAll: _saveAll,
  images,
  downloadProcessed,
}: {
  stats: { total: number; tagged: number; saved: number };
  readyToSave: LocalImage[];
  savingBulk: boolean;
  saveAll: () => void;
  images: LocalImage[];
  downloadProcessed: (img: LocalImage) => Promise<void>;
}) {
  const taggedImages = images.filter((i) => i.lat !== null);
  const downloadAll = async () => {
    for (const img of taggedImages) {
      await downloadProcessed(img);
    }
  };
  const untagged = stats.total - stats.tagged;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Review & save</h2>
        <p className="text-sm text-muted-foreground">
          Everything ready looks right? Push the batch to your cloud library.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <SummaryCard label="Total images" value={stats.total} />
        <SummaryCard label="Ready to save" value={readyToSave.length} tone="primary" />
        <SummaryCard label="Untagged" value={untagged} tone={untagged > 0 ? "warn" : undefined} />
      </div>

      {untagged > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-600 dark:text-amber-400">
          {untagged} image{untagged === 1 ? "" : "s"} still untagged — they will be skipped. Go back
          to Step 3 to tag them.
        </div>
      )}

      <div className="rounded-lg border border-border">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="text-xs font-medium text-muted-foreground">Preview</div>
          <button
            type="button"
            onClick={downloadAll}
            disabled={taggedImages.length === 0}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-40"
          >
            <Download className="h-3 w-3" />
            Download all ({taggedImages.length})
          </button>
        </div>
        <div className="grid max-h-72 gap-2 overflow-auto p-3 sm:grid-cols-2 md:grid-cols-3">
          {images.map((img) => (
            <div
              key={img.id}
              className="flex items-center gap-2 rounded-md border border-border bg-muted/20 p-2"
            >
              <img
                src={img.previewUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{img.file.name}</div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {img.locationLabel ?? "Not tagged"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => downloadProcessed(img)}
                disabled={img.lat === null}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                aria-label="Download geotagged image"
                title="Download with GPS EXIF"
              >
                <Download className="h-4 w-4" />
              </button>
              {img.status === "saved" ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : img.status === "saving" ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : img.lat !== null ? (
                <MapPin className="h-4 w-4 text-primary" />
              ) : (
                <X className="h-4 w-4 text-muted-foreground/60" />
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "primary" | "warn";
}) {
  const cls =
    tone === "primary"
      ? "border-primary/40 bg-primary/5"
      : tone === "warn"
        ? "border-amber-500/40 bg-amber-500/5"
        : "border-border bg-card";
  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <div className="text-2xl font-semibold">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}


/* -------------------------------------------------------------------------- */
/* Small UI bits                                                              */
/* -------------------------------------------------------------------------- */

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "primary" | "success";
}) {
  const toneCls =
    tone === "primary"
      ? "bg-primary/15 text-primary"
      : tone === "success"
        ? "bg-emerald-500/15 text-emerald-500"
        : "bg-muted text-foreground";
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <span className={`grid h-6 min-w-6 place-items-center rounded-md px-1.5 text-xs font-semibold ${toneCls}`}>
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* GeoTag Imager — verifier tab                                               */
/* -------------------------------------------------------------------------- */

type VerifyRow = {
  id: string;
  file: File;
  previewUrl: string;
  result: GpsReadResult | null;
  loading: boolean;
  // Library metadata (present when the row was picked from the user's library)
  title?: string | null;
  description?: string | null;
  displayName?: string; // friendly name, falls back to file.name
  // Nearest city resolved via reverse geocoding once GPS is known
  nearestCity?: string | null;
  cityLoading?: boolean;
};

// In-memory reverse-geocoding cache keyed by rounded coordinate (~1km bucket)
const cityCache = new Map<string, string | null>();

async function reverseGeocodeCity(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (cityCache.has(key)) return cityCache.get(key)!;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&zoom=12&lat=${lat}&lon=${lng}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) throw new Error("geocode failed");
    const data = (await res.json()) as { address?: Record<string, string> };
    const a = data.address ?? {};
    const city =
      a.city ??
      a.town ??
      a.village ??
      a.municipality ??
      a.suburb ??
      a.county ??
      a.state ??
      null;
    cityCache.set(key, city);
    return city;
  } catch {
    cityCache.set(key, null);
    return null;
  }
}

function MetaCell({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`text-xs text-foreground ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}


function GeoTagImager({
  library,
  libraryLoading,
  onRefresh,
}: {
  library: LibraryImage[];
  libraryLoading: boolean;
  onRefresh: () => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<VerifyRow[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const [libSearch, setLibSearch] = useState("");
  const [libSelected, setLibSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const addFiles = useCallback(
    async (
      files: FileList | File[],
      metaByIndex?: Array<{ title?: string | null; description?: string | null; displayName?: string }>,
    ) => {
      const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (list.length === 0) {
        toast.error("Choose image files to verify.");
        return;
      }
      const newRows: VerifyRow[] = list.map((f, i) => ({
        id: crypto.randomUUID(),
        file: f,
        previewUrl: URL.createObjectURL(f),
        result: null,
        loading: true,
        title: metaByIndex?.[i]?.title ?? null,
        description: metaByIndex?.[i]?.description ?? null,
        displayName: metaByIndex?.[i]?.displayName ?? f.name,
        cityLoading: false,
      }));
      setRows((prev) => [...newRows, ...prev]);
      for (const row of newRows) {
        const result = await readGps(row.file);
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? { ...r, result, loading: false, cityLoading: result.hasGps }
              : r,
          ),
        );
        if (result.hasGps && result.lat != null && result.lng != null) {
          const city = await reverseGeocodeCity(result.lat, result.lng);
          setRows((prev) =>
            prev.map((r) => (r.id === row.id ? { ...r, nearestCity: city, cityLoading: false } : r)),
          );
        }
      }
    },
    [],
  );

  const clearAll = () => {
    rows.forEach((r) => URL.revokeObjectURL(r.previewUrl));
    setRows([]);
  };

  const importSelectedFromLibrary = useCallback(async () => {
    const picks = library.filter((l) => libSelected.has(l.id));
    if (picks.length === 0) {
      toast.error("Select at least one image.");
      return;
    }
    setImporting(true);
    try {
      const files: File[] = [];
      const metas: Array<{ title?: string | null; description?: string | null; displayName?: string }> = [];
      for (const row of picks) {
        const { data: signed } = await supabase.storage
          .from("frames")
          .createSignedUrl(row.storage_path, 60 * 60);
        if (!signed?.signedUrl) continue;
        const res = await fetch(signed.signedUrl);
        const blob = await res.blob();
        const mime = blob.type || "image/jpeg";
        files.push(new File([blob], row.name || `library-${row.id}.jpg`, { type: mime }));
        metas.push({
          title: row.title,
          description: row.description,
          displayName: row.title || row.name,
        });
      }
      if (files.length) await addFiles(files, metas);
      setLibOpen(false);
      setLibSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }, [library, libSelected, addFiles]);



  const tagged = rows.filter((r) => r.result?.hasGps).length;
  const untagged = rows.filter((r) => r.result && !r.result.hasGps).length;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5 md:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">Verify GeoTag status</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Drop any image to read its embedded GPS EXIF — the same metadata that Photos,
              Windows Explorer, Lightroom, and other third-party viewers rely on. This is a
              local check; no files leave your browser.
            </p>
          </div>
          {rows.length > 0 && (
            <button
              onClick={clearAll}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
            >
              Clear
            </button>
          )}
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition ${
            dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/60"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
          <ImageIcon className="h-7 w-7 text-muted-foreground" />
          <div className="text-sm font-medium">Drop images to check their GPS EXIF</div>
          <div className="text-xs text-muted-foreground">
            JPEG only reliably carries GPS metadata that third-party apps can read.
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setLibSelected(new Set());
              setLibOpen(true);
              if (library.length === 0) onRefresh();
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            <Library className="h-3.5 w-3.5 text-primary" />
            Pick from library
            <span className="text-muted-foreground">({library.length})</span>
          </button>
          <span className="text-xs text-muted-foreground">
            Verify GeoTag status of images already in your cloud library.
          </span>
        </div>


        {rows.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <StatChip label="Checked" value={rows.length} />
            <StatChip label="GeoTagged" value={tagged} tone="success" />
            <StatChip label="Missing GPS" value={untagged} tone="primary" />
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-start"
            >
              <img
                src={r.previewUrl}
                alt={r.displayName ?? r.file.name}
                className="h-20 w-20 shrink-0 rounded-md object-cover"
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {r.title || r.displayName || r.file.name}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {(r.file.size / 1024).toFixed(1)} KB · {r.file.type || "unknown"}
                      {r.title && r.displayName && r.title !== r.displayName ? (
                        <> · file: {r.displayName}</>
                      ) : null}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {r.loading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : r.result?.hasGps ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <CircleCheck className="h-3.5 w-3.5" /> GeoTagged
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                        <X className="h-3.5 w-3.5" /> Not tagged
                      </span>
                    )}
                  </div>
                </div>

                {r.description && (
                  <div className="line-clamp-2 text-xs text-muted-foreground">
                    {r.description}
                  </div>
                )}

                {r.loading && (
                  <div className="text-xs text-muted-foreground">Reading EXIF…</div>
                )}

                {r.result?.hasGps && (
                  <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-3">
                    <MetaCell label="Latitude" value={r.result.lat!.toFixed(6)} mono />
                    <MetaCell label="Longitude" value={r.result.lng!.toFixed(6)} mono />
                    <MetaCell
                      label="Nearest city"
                      value={
                        r.cityLoading
                          ? "Resolving…"
                          : r.nearestCity ?? "Unknown"
                      }
                    />
                  </dl>
                )}

                {r.result && !r.result.hasGps && (
                  <div className="text-xs text-amber-600 dark:text-amber-400">
                    {r.result.reason ?? "No GPS EXIF"}
                  </div>
                )}

                {r.result?.hasGps && (
                  <div className="pt-1">
                    <a
                      href={`https://www.google.com/maps?q=${r.result.lat},${r.result.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      Open in Google Maps →
                    </a>
                  </div>
                )}
              </div>
            </li>

          ))}
        </ul>
      )}

      {libOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur"
          onClick={() => !importing && setLibOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-2xl border border-border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border p-4">
              <div>
                <div className="text-sm font-medium">Pick images from your library</div>
                <div className="text-xs text-muted-foreground">
                  {library.length} available · {libSelected.size} selected
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={libSearch}
                    onChange={(e) => setLibSearch(e.target.value)}
                    placeholder="Search…"
                    className="h-8 w-48 rounded-md border border-border bg-background pl-7 pr-2 text-xs"
                  />
                </div>
                <button
                  onClick={() => setLibOpen(false)}
                  className="rounded-md p-1.5 hover:bg-accent"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {libraryLoading && library.length === 0 ? (
                <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {(() => {
                    const q = libSearch.trim().toLowerCase();
                    const list = q
                      ? library.filter((r) => r.name.toLowerCase().includes(q))
                      : library;
                    if (list.length === 0) {
                      return (
                        <div className="col-span-full py-10 text-center text-sm text-muted-foreground">
                          No images found.
                        </div>
                      );
                    }
                    return list.map((row) => {
                      const picked = libSelected.has(row.id);
                      return (
                        <button
                          key={row.id}
                          type="button"
                          onClick={() => {
                            setLibSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(row.id)) next.delete(row.id);
                              else next.add(row.id);
                              return next;
                            });
                          }}
                          className={`group relative overflow-hidden rounded-lg border text-left transition ${
                            picked ? "border-primary ring-2 ring-primary" : "border-border hover:border-primary/60"
                          }`}
                        >
                          <div className="relative aspect-square w-full bg-muted">
                            <SignedImage
                              bucket="frames"
                              path={row.storage_path}
                              alt={row.name}
                              className="h-full w-full object-cover"
                            />
                            {row.lat != null && row.lng != null && (
                              <span className="absolute left-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow ring-2 ring-emerald-500/20">
                                <MapPin className="h-3 w-3" />
                              </span>
                            )}
                          </div>

                          <div className="truncate p-1.5 text-[10px] text-muted-foreground">
                            {row.name}
                          </div>
                          {picked && (
                            <div className="absolute right-1.5 top-1.5 rounded-full bg-primary p-1 text-primary-foreground">
                              <Check className="h-3 w-3" />
                            </div>
                          )}
                        </button>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border p-4">
              <button
                onClick={() => setLibSelected(new Set())}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Clear selection
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setLibOpen(false)}
                  disabled={importing}
                  className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={importSelectedFromLibrary}
                  disabled={importing || libSelected.size === 0}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {importing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Importing…
                    </>
                  ) : (
                    <>Verify {libSelected.size} image{libSelected.size === 1 ? "" : "s"}</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>

  );
}

/* -------------------------------------------------------------------------- */
/* Per-image metadata editor with source badges                               */
/* -------------------------------------------------------------------------- */

const SOURCE_LABELS: Record<string, { label: string; hint: string }> = {
  XPTitle: { label: "XPTitle", hint: "Windows title tag" },
  ImageDescription: { label: "ImageDescription", hint: "Standard EXIF caption" },
  XPComment: { label: "XPComment", hint: "Windows comment tag" },
  XPSubject: { label: "XPSubject", hint: "Windows subject tag (used as description)" },
  XPKeywords: { label: "XPKeywords", hint: "Windows keywords tag" },
};

function SourceBadge({ source }: { source: string | null | undefined }) {
  if (!source) {
    return (
      <span
        className="inline-flex items-center rounded border border-dashed border-border px-1 py-px text-[9px] font-medium text-muted-foreground"
        title="No EXIF tag found — value was entered manually"
      >
        manual
      </span>
    );
  }
  const info = SOURCE_LABELS[source] ?? { label: source, hint: source };
  return (
    <span
      className="inline-flex items-center rounded bg-primary/10 px-1 py-px text-[9px] font-medium text-primary"
      title={`Detected from EXIF ${info.hint}`}
    >
      {info.label}
    </span>
  );
}

function MetaFields({
  img,
  updateImageMeta,
}: {
  img: LocalImage;
  updateImageMeta: (
    id: string,
    patch: Partial<Pick<LocalImage, "title" | "description" | "keywords">>,
  ) => void;
}) {
  const sources = img.metaSources;
  const raw = img.metaRaw;

  // Build "use this instead" candidates for each field. Skip the value that's
  // already active and skip anything empty.
  const titleAlts = raw
    ? (["XPTitle", "XPSubject"] as const)
        .filter((tag) => raw[tag] && raw[tag] !== img.title)
        .map((tag) => ({ tag, value: raw[tag] }))
    : [];
  const descAlts = raw
    ? (["ImageDescription", "XPComment", "XPSubject", "UserComment"] as const)
        .filter((tag) => raw[tag] && raw[tag] !== img.description)
        .map((tag) => ({ tag, value: raw[tag] }))
    : [];

  // Keyword source candidates: canonical (XPKeywords) and fallback
  // (UserComment) both split into individual keywords for chip-swap.
  const keywordAlts: { tag: "XPKeywords" | "UserComment"; keywords: string[] }[] = raw
    ? (["XPKeywords", "UserComment"] as const)
        .map((tag) => ({
          tag,
          keywords: raw[tag]
            ? raw[tag].split(/;\s*|,\s*/).map((k) => k.trim()).filter(Boolean)
            : [],
        }))
        .filter(({ keywords }) => keywords.length > 0)
    : [];

  return (
    <div className="mt-1 space-y-1.5">
      <div>
        <div className="mb-0.5 flex items-center gap-1 text-[9px] uppercase tracking-wide text-muted-foreground">
          <span>Title</span>
          <SourceBadge source={sources?.title ?? null} />
        </div>
        <input
          value={img.title}
          onChange={(e) => updateImageMeta(img.id, { title: e.target.value })}
          placeholder="Title"
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-[11px] outline-none focus:ring-2 focus:ring-ring"
        />
        {titleAlts.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {titleAlts.map((alt) => (
              <button
                key={alt.tag}
                type="button"
                onClick={() => updateImageMeta(img.id, { title: alt.value })}
                title={`Replace title with value from ${alt.tag}: ${alt.value}`}
                className="inline-flex max-w-full items-center gap-1 rounded border border-border px-1 py-px text-[9px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <span className="font-medium text-primary">{alt.tag}</span>
                <span className="truncate">{alt.value}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-0.5 flex items-center gap-1 text-[9px] uppercase tracking-wide text-muted-foreground">
          <span>Description</span>
          <SourceBadge source={sources?.description ?? null} />
        </div>
        <textarea
          value={img.description}
          onChange={(e) => updateImageMeta(img.id, { description: e.target.value })}
          placeholder="Description"
          rows={2}
          className="w-full resize-none rounded-md border border-input bg-background px-2 py-1 text-[11px] outline-none focus:ring-2 focus:ring-ring"
        />
        {descAlts.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {descAlts.map((alt) => (
              <button
                key={alt.tag}
                type="button"
                onClick={() => updateImageMeta(img.id, { description: alt.value })}
                title={`Replace description with value from ${alt.tag}: ${alt.value}`}
                className="inline-flex max-w-full items-center gap-1 rounded border border-border px-1 py-px text-[9px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <span className="font-medium text-primary">{alt.tag}</span>
                <span className="truncate">{alt.value}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <KeywordsField
        img={img}
        sources={sources}
        keywordAlts={keywordAlts}
        updateImageMeta={updateImageMeta}
      />

      {(img.title || img.description || img.keywords.length > 0) && img.hasExistingMeta && (
        <button
          type="button"
          onClick={() =>
            updateImageMeta(img.id, { title: "", description: "", keywords: [] })
          }
          className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
        >
          Clear all detected fields
        </button>
      )}
    </div>
  );
}

function KeywordsField({
  img,
  sources,
  keywordAlts,
  updateImageMeta,
}: {
  img: LocalImage;
  sources: LocalImage["metaSources"];
  keywordAlts: { tag: "XPKeywords" | "UserComment"; keywords: string[] }[];
  updateImageMeta: (
    id: string,
    patch: Partial<Pick<LocalImage, "title" | "description" | "keywords">>,
  ) => void;
}) {
  const [draft, setDraft] = useState("");

  const addKeyword = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    const exists = img.keywords.some((k) => k.toLowerCase() === v.toLowerCase());
    if (exists) return;
    updateImageMeta(img.id, { keywords: [...img.keywords, v] });
  };

  const removeKeyword = (kw: string) => {
    updateImageMeta(img.id, {
      keywords: img.keywords.filter((k) => k !== kw),
    });
  };

  const activeSet = new Set(img.keywords.map((k) => k.toLowerCase()));

  return (
    <div>
      <div className="mb-0.5 flex items-center gap-1 text-[9px] uppercase tracking-wide text-muted-foreground">
        <span>Keywords</span>
        <SourceBadge source={sources?.keywords ?? null} />
      </div>
      <div className="flex flex-wrap gap-1 rounded-md border border-input bg-background px-1.5 py-1">
        {img.keywords.map((kw) => (
          <span
            key={kw}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
          >
            {kw}
            <button
              type="button"
              onClick={() => removeKeyword(kw)}
              className="text-primary/70 hover:text-primary"
              aria-label={`Remove keyword ${kw}`}
              title={`Remove ${kw}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addKeyword(draft);
              setDraft("");
            } else if (e.key === "Backspace" && !draft && img.keywords.length > 0) {
              removeKeyword(img.keywords[img.keywords.length - 1]);
            }
          }}
          onBlur={() => {
            if (draft.trim()) {
              addKeyword(draft);
              setDraft("");
            }
          }}
          placeholder={img.keywords.length === 0 ? "Add keyword…" : ""}
          className="min-w-[80px] flex-1 bg-transparent px-1 py-0.5 text-[11px] outline-none placeholder:text-muted-foreground/60"
        />
      </div>
      {keywordAlts.length > 0 && (
        <div className="mt-0.5 flex flex-wrap gap-1">
          {keywordAlts.flatMap(({ tag, keywords }) =>
            keywords
              .filter((kw) => !activeSet.has(kw.toLowerCase()))
              .map((kw) => (
                <button
                  key={`${tag}:${kw}`}
                  type="button"
                  onClick={() => addKeyword(kw)}
                  title={`Add "${kw}" from ${tag}`}
                  className="inline-flex max-w-full items-center gap-1 rounded border border-border px-1 py-px text-[9px] text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <span className="font-medium text-primary">{tag}</span>
                  <span className="truncate">{kw}</span>
                </button>
              )),
          )}
        </div>
      )}
    </div>
  );
}
