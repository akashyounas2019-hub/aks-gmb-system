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
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { LocationPicker, type PickedLocation } from "@/components/LocationPicker";
import { SignedImage, useSignedUrl } from "@/components/SignedImage";
import { embedGps, readGps, type GpsReadResult } from "@/lib/exif-geotag";

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

// Curated Dubai locations — grouped by area, tagged by property type.
const PLACES: Place[] = [
  // Al Qusais
  { id: "alq-1", name: "Al Qusais Residential Villa", area: "Al Qusais", type: "home", lat: 25.2867, lng: 55.3873, address: "Al Qusais 2, Dubai" },
  { id: "alq-2", name: "Al Qusais Family Apartment", area: "Al Qusais", type: "home", lat: 25.2921, lng: 55.3944, address: "Al Qusais 3, Dubai" },
  { id: "alq-3", name: "Al Qusais Business Center", area: "Al Qusais", type: "office", lat: 25.2841, lng: 55.3805, address: "Damascus St, Al Qusais" },
  { id: "alq-4", name: "Al Nahda Office Tower", area: "Al Qusais", type: "office", lat: 25.2887, lng: 55.3688, address: "Al Nahda 1, Dubai" },
  { id: "alq-5", name: "Al Bustan Centre", area: "Al Qusais", type: "commercial", lat: 25.2795, lng: 55.3777, address: "Al Qusais 1, Dubai" },
  { id: "alq-6", name: "Grand Mall Al Qusais", area: "Al Qusais", type: "commercial", lat: 25.2934, lng: 55.3891 },
  // Deira
  { id: "der-1", name: "Deira Heritage Villa", area: "Deira", type: "home", lat: 25.2701, lng: 55.3160 },
  { id: "der-2", name: "Deira Corporate Plaza", area: "Deira", type: "office", lat: 25.2650, lng: 55.3200 },
  { id: "der-3", name: "Deira City Centre", area: "Deira", type: "commercial", lat: 25.2528, lng: 55.3319 },
  // Business Bay
  { id: "bb-1", name: "Executive Towers Residence", area: "Business Bay", type: "home", lat: 25.1867, lng: 55.2704 },
  { id: "bb-2", name: "Bay Square Offices", area: "Business Bay", type: "office", lat: 25.1889, lng: 55.2650 },
  { id: "bb-3", name: "Bay Avenue Mall", area: "Business Bay", type: "commercial", lat: 25.1874, lng: 55.2622 },
  // Downtown Dubai
  { id: "dt-1", name: "Burj Views Apartment", area: "Downtown Dubai", type: "home", lat: 25.1934, lng: 55.2751 },
  { id: "dt-2", name: "Emaar Square Offices", area: "Downtown Dubai", type: "office", lat: 25.1963, lng: 55.2789 },
  { id: "dt-3", name: "The Dubai Mall", area: "Downtown Dubai", type: "commercial", lat: 25.1972, lng: 55.2796 },
  // Dubai Marina
  { id: "dm-1", name: "Marina Residence", area: "Dubai Marina", type: "home", lat: 25.0805, lng: 55.1403 },
  { id: "dm-2", name: "Marina Plaza Office", area: "Dubai Marina", type: "office", lat: 25.0764, lng: 55.1400 },
  { id: "dm-3", name: "Marina Mall", area: "Dubai Marina", type: "commercial", lat: 25.0781, lng: 55.1416 },
  // Al Barsha
  { id: "ab-1", name: "Al Barsha South Villa", area: "Al Barsha", type: "home", lat: 25.1041, lng: 55.1936 },
  { id: "ab-2", name: "Al Barsha Business Hub", area: "Al Barsha", type: "office", lat: 25.1105, lng: 55.2000 },
  { id: "ab-3", name: "Mall of the Emirates", area: "Al Barsha", type: "commercial", lat: 25.1183, lng: 55.2000 },
  // Jumeirah
  { id: "jm-1", name: "Jumeirah Beach Villa", area: "Jumeirah", type: "home", lat: 25.2048, lng: 55.2708 },
  { id: "jm-2", name: "Jumeirah Corporate Centre", area: "Jumeirah", type: "office", lat: 25.2144, lng: 55.2555 },
  { id: "jm-3", name: "Mercato Shopping Mall", area: "Jumeirah", type: "commercial", lat: 25.2211, lng: 55.2544 },
  // JLT
  { id: "jlt-1", name: "JLT Cluster Residence", area: "JLT", type: "home", lat: 25.0705, lng: 55.1443 },
  { id: "jlt-2", name: "JLT Tower Offices", area: "JLT", type: "office", lat: 25.0691, lng: 55.1421 },
  { id: "jlt-3", name: "JLT Retail Plaza", area: "JLT", type: "commercial", lat: 25.0718, lng: 55.1462 },
];

const TYPE_META: Record<PlaceType, { label: string; icon: typeof Home; tone: string }> = {
  home: { label: "Home", icon: Home, tone: "bg-emerald-500/15 text-emerald-500" },
  office: { label: "Office", icon: Briefcase, tone: "bg-sky-500/15 text-sky-500" },
  commercial: { label: "Commercial", icon: Store, tone: "bg-amber-500/15 text-amber-500" },
};

const AREAS = Array.from(new Set(PLACES.map((p) => p.area))).sort();

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
  status: "pending" | "saving" | "saved" | "error";
  error?: string;
  // When the image was added from the user's library, we track the DB row so
  // saveAll updates that row (and re-uploads to the same storage path) instead
  // of creating a duplicate.
  libraryId?: string;
  libraryStoragePath?: string;
};

type LibraryImage = {
  id: string;
  name: string;
  storage_path: string;
  lat: number | null;
  lng: number | null;
  title: string | null;
  description: string | null;
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
  const [activePlace, setActivePlace] = useState<Place | null>(PLACES[0]);
  const [customLocation, setCustomLocation] = useState<PickedLocation | null>(null);
  const [copied, setCopied] = useState(false);
  const [savingBulk, setSavingBulk] = useState(false);

  // Pinned coordinate (auto-applied to newly uploaded images)
  const [pinnedCoord, setPinnedCoord] = useState<
    { lat: number; lng: number; label: string; kind: "home" | "office" | "custom" } | null
  >(null);

  // Dedicated Home/Office quick pickers
  const homePlaces = useMemo(() => PLACES.filter((p) => p.type === "home"), []);
  const officePlaces = useMemo(() => PLACES.filter((p) => p.type === "office"), []);
  const [homePickId, setHomePickId] = useState<string>(homePlaces[0]?.id ?? "");
  const [officePickId, setOfficePickId] = useState<string>(officePlaces[0]?.id ?? "");

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
      .select("id,name,storage_path,lat,lng,title,description")
      .order("created_at", { ascending: false })
      .limit(500);
    setLibrary((data ?? []) as LibraryImage[]);
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
            title: row.title ?? "",
            description: row.description ?? "",
            status: "pending",
            libraryId: row.id,
            libraryStoragePath: row.storage_path,
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
    (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (list.length === 0) {
        toast.error("Please choose image files.");
        return;
      }
      setImages((prev) => [
        ...prev,
        ...list.map((f) => ({
          id: crypto.randomUUID(),
          file: f,
          previewUrl: URL.createObjectURL(f),
          lat: pinnedCoord?.lat ?? null,
          lng: pinnedCoord?.lng ?? null,
          locationLabel: pinnedCoord?.label ?? null,
          title: "",
          description: "",
          status: "pending" as const,
        })),
      ]);
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
    return PLACES.filter((p) => {
      if (areaFilter !== "All" && p.area !== areaFilter) return false;
      if (typeFilter !== "All" && p.type !== typeFilter) return false;
      if (
        q &&
        !`${p.name} ${p.area} ${p.address ?? ""}`.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [areaFilter, typeFilter, placeSearch]);

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

  const updateImageMeta = (id: string, patch: Partial<Pick<LocalImage, "title" | "description">>) => {
    setImages((prev) => prev.map((img) => (img.id === id ? { ...img, ...patch } : img)));
  };

  const applyMetaToTargets = (
    ids: string[],
    patch: Partial<Pick<LocalImage, "title" | "description">>,
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
        const tagged = await embedGps(img.file, img.lat!, img.lng!);

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
      const tagged = await embedGps(img.file, img.lat, img.lng);
      const url = URL.createObjectURL(tagged);
      const a = document.createElement("a");
      a.href = url;
      const base = img.file.name.replace(/\.[^.]+$/, "");
      const ext = tagged.name.split(".").pop() || "jpg";
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
        <GeoTagImager />
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
        <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-full bg-primary/85 px-1.5 py-0.5 text-[9px] font-medium text-primary-foreground">
          <MapPin className="h-2.5 w-2.5" />
        </span>
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
  } = props;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Choose a location</h2>
        <p className="text-sm text-muted-foreground">
          Pick from a quick preset, browse the library, or drop a pin on the map.
        </p>
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

      {/* Collapsible: quick home/office */}
      <Collapsible
        title="Quick pick — Home / Office"
        subtitle="One-tap presets. Pin one to auto-tag new uploads."
        open={openSection === "quick"}
        onToggle={() => setOpenSection("quick")}
        badge={
          pinnedCoord && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
              <Pin className="h-3 w-3" /> Pinned
            </span>
          )
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          {(
            [
              { kind: "home" as const, list: homePlaces, pickId: homePickId, setPickId: setHomePickId },
              { kind: "office" as const, list: officePlaces, pickId: officePickId, setPickId: setOfficePickId },
            ]
          ).map(({ kind, list, pickId, setPickId }) => {
            const meta = TYPE_META[kind];
            const Icon = meta.icon;
            const place = list.find((p) => p.id === pickId) ?? list[0];
            const isPinned =
              pinnedCoord?.kind === kind &&
              place &&
              pinnedCoord.lat === place.lat &&
              pinnedCoord.lng === place.lng;
            return (
              <div key={kind} className="rounded-lg border border-border p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className={`grid h-8 w-8 place-items-center rounded-md ${meta.tone}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="text-sm font-medium">{meta.label} coordinate</div>
                </div>
                <select
                  value={pickId}
                  onChange={(e) => setPickId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  {list.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.area}
                    </option>
                  ))}
                </select>
                {place && (
                  <div className="mt-2 rounded-md bg-muted/60 px-2 py-1.5 font-mono text-[11px]">
                    {place.lat.toFixed(6)}, {place.lng.toFixed(6)}
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => {
                      if (!place) return;
                      setActivePlace(place);
                      setCustomLocation(null);
                    }}
                    className="flex-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent"
                  >
                    Use as active
                  </button>
                  <button
                    onClick={() => {
                      if (!place) return;
                      if (isPinned) {
                        setPinnedCoord(null);
                      } else {
                        setPinnedCoord({
                          lat: place.lat,
                          lng: place.lng,
                          label: `${place.name}, ${place.area}`,
                          kind,
                        });
                        setActivePlace(place);
                        setCustomLocation(null);
                      }
                    }}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                      isPinned
                        ? "border border-border hover:bg-accent"
                        : "bg-primary text-primary-foreground hover:opacity-90"
                    }`}
                  >
                    <Pin className="h-3.5 w-3.5" />
                    {isPinned ? "Unpin" : "Pin"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Collapsible>

      {/* Collapsible: library */}
      <Collapsible
        title="Location library"
        subtitle={`${filteredPlaces.length} curated places · filter by area & type`}
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

        {filteredPlaces.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            No locations match your filters.
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
        <LocationPicker value={customLocation} onChange={setCustomLocation} compact />
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
}) {
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
                  {img.lat !== null && (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                      <MapPin className="h-3 w-3" />
                      Tagged
                    </span>
                  )}
                  {isSelected && <span className="absolute inset-0 ring-2 ring-inset ring-primary" />}
                </button>
                <div className="space-y-1 p-2.5">
                  <div className="truncate text-xs font-medium" title={img.file.name}>
                    {img.file.name}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {img.locationLabel ?? "Not tagged"}
                  </div>
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
  saveAll,
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

      <button
        onClick={saveAll}
        disabled={savingBulk || readyToSave.length === 0}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
      >
        {savingBulk ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <UploadCloud className="h-4 w-4" />
        )}
        Save {readyToSave.length > 0 ? readyToSave.length : ""} image
        {readyToSave.length === 1 ? "" : "s"} to cloud
      </button>
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
};

function GeoTagImager() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<VerifyRow[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) {
      toast.error("Choose image files to verify.");
      return;
    }
    const newRows: VerifyRow[] = list.map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      previewUrl: URL.createObjectURL(f),
      result: null,
      loading: true,
    }));
    setRows((prev) => [...newRows, ...prev]);
    for (const row of newRows) {
      const result = await readGps(row.file);
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, result, loading: false } : r)),
      );
    }
  }, []);

  const clearAll = () => {
    rows.forEach((r) => URL.revokeObjectURL(r.previewUrl));
    setRows([]);
  };

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
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
            >
              <img
                src={r.previewUrl}
                alt={r.file.name}
                className="h-16 w-16 rounded-md object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{r.file.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {(r.file.size / 1024).toFixed(1)} KB · {r.file.type || "unknown"}
                </div>
                {r.loading && (
                  <div className="mt-1 text-xs text-muted-foreground">Reading EXIF…</div>
                )}
                {r.result?.hasGps && (
                  <div className="mt-1 font-mono text-xs text-emerald-600 dark:text-emerald-400">
                    {r.result.lat!.toFixed(6)}, {r.result.lng!.toFixed(6)}
                  </div>
                )}
                {r.result && !r.result.hasGps && (
                  <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    {r.result.reason ?? "No GPS EXIF"}
                  </div>
                )}
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
              {r.result?.hasGps && (
                <a
                  href={`https://www.google.com/maps?q=${r.result.lat},${r.result.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-xs text-primary hover:underline"
                >
                  Open map →
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
