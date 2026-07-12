import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
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
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { LocationPicker, type PickedLocation } from "@/components/LocationPicker";

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
  status: "pending" | "saving" | "saved" | "error";
  error?: string;
};

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

function GeotaggingPage() {
  const inputRef = useRef<HTMLInputElement>(null);
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
        const ext = img.file.name.split(".").pop() || "jpg";
        const path = `${userId}/geotag/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("frames")
          .upload(path, img.file, { contentType: img.file.type, upsert: false });
        if (upErr) throw upErr;

        const { error: dbErr } = await supabase.from("images").insert({
          owner_id: userId,
          storage_path: path,
          name: img.file.name,
          lat: img.lat,
          lng: img.lng,
        });
        if (dbErr) throw dbErr;

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
  };

  /* --------------------------------- UI --------------------------------- */

  const stats = {
    total: images.length,
    tagged: images.filter((i) => i.lat !== null).length,
    saved: images.filter((i) => i.status === "saved").length,
  };

  const expandedCoords = typeFilter === "home" || typeFilter === "office";

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
            <MapPin className="h-3.5 w-3.5" /> Geotagging
          </div>
          <h1 className="font-display text-3xl leading-tight">
            Bulk image geotagging
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Upload photos in bulk, pick a location from the curated library or the map,
            and apply GPS coordinates to single images or the entire batch.
          </p>
        </div>
        <div className="flex gap-2">
          <StatChip label="Uploaded" value={stats.total} />
          <StatChip label="Tagged" value={stats.tagged} tone="primary" />
          <StatChip label="Saved" value={stats.saved} tone="success" />
        </div>
      </header>

      {/* Home / Office coordinate picker */}
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        {([
          { kind: "home" as const, list: homePlaces, pickId: homePickId, setPickId: setHomePickId },
          { kind: "office" as const, list: officePlaces, pickId: officePickId, setPickId: setOfficePickId },
        ]).map(({ kind, list, pickId, setPickId }) => {
          const meta = TYPE_META[kind];
          const Icon = meta.icon;
          const place = list.find((p) => p.id === pickId) ?? list[0];
          const isPinned =
            pinnedCoord?.kind === kind &&
            place &&
            pinnedCoord.lat === place.lat &&
            pinnedCoord.lng === place.lng;
          return (
            <div key={kind} className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`grid h-9 w-9 place-items-center rounded-md ${meta.tone}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-sm font-medium">{meta.label} coordinate</div>
                    <div className="text-[11px] text-muted-foreground">
                      Pick one, then pin it to auto-tag new uploads.
                    </div>
                  </div>
                </div>
                {isPinned && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                    <Pin className="h-3 w-3" /> Pinned
                  </span>
                )}
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
              <div className="mt-3 flex flex-wrap gap-2">
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
                      toast.success(`Unpinned ${meta.label.toLowerCase()} coordinate.`);
                    } else {
                      setPinnedCoord({
                        lat: place.lat,
                        lng: place.lng,
                        label: `${place.name}, ${place.area}`,
                        kind,
                      });
                      setActivePlace(place);
                      setCustomLocation(null);
                      toast.success(
                        `Pinned ${meta.label.toLowerCase()} coordinate — new uploads will be auto-tagged.`,
                      );
                    }
                  }}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                    isPinned
                      ? "border border-border hover:bg-accent"
                      : "bg-primary text-primary-foreground hover:opacity-90"
                  }`}
                >
                  <Pin className="h-3.5 w-3.5" />
                  {isPinned ? "Unpin" : "Pin for new uploads"}
                </button>
                <button
                  onClick={() => {
                    if (!place) return;
                    const ids = selected.size ? Array.from(selected) : images.map((i) => i.id);
                    if (ids.length === 0) {
                      toast.error("Upload some images first.");
                      return;
                    }
                    setImages((prev) =>
                      prev.map((img) =>
                        ids.includes(img.id)
                          ? {
                              ...img,
                              lat: place.lat,
                              lng: place.lng,
                              locationLabel: `${place.name}, ${place.area}`,
                            }
                          : img,
                      ),
                    );
                    toast.success(
                      `Applied to ${ids.length} image${ids.length === 1 ? "" : "s"}.`,
                    );
                  }}
                  className="rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent"
                >
                  Apply now
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pinned banner */}
      {pinnedCoord && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 px-4 py-2.5">
          <Pin className="h-4 w-4 text-primary" />
          <div className="min-w-0 flex-1 text-xs">
            <span className="font-medium">New uploads auto-tag:</span>{" "}
            <span className="text-muted-foreground">{pinnedCoord.label}</span>{" "}
            <span className="font-mono text-muted-foreground/80">
              ({pinnedCoord.lat.toFixed(5)}, {pinnedCoord.lng.toFixed(5)})
            </span>
          </div>
          <button
            onClick={() => setPinnedCoord(null)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-accent"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        </div>
      )}

      {/* Active coordinate strip */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
          <Crosshair className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {activeCoord?.label ?? "No location selected"}
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            {activeCoord
              ? `${activeCoord.lat.toFixed(6)}, ${activeCoord.lng.toFixed(6)}`
              : "Pick a location to see coordinates"}
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
        <button
          onClick={() => {
            if (!activeCoord) return;
            setPinnedCoord({
              lat: activeCoord.lat,
              lng: activeCoord.lng,
              label: activeCoord.label,
              kind: "custom",
            });
            toast.success("Pinned — new uploads will auto-tag with this coordinate.");
          }}
          disabled={!activeCoord}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-40"
        >
          <Pin className="h-3.5 w-3.5" />
          Pin
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

      {/* Horizontal location library */}
      <div className="mb-6 rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-base">Location library</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {filteredPlaces.length}
            </span>
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={placeSearch}
              onChange={(e) => setPlaceSearch(e.target.value)}
              placeholder="Search Al Qusais, Marina…"
              className="w-full rounded-md border border-input bg-background py-2 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Property type tabs (horizontal) */}
        <div className="mb-3 flex flex-wrap gap-2">
          {(["All", "home", "office", "commercial"] as const).map((t) => {
            const active = typeFilter === t;
            const Icon = t === "All" ? MapPin : TYPE_META[t as PlaceType].icon;
            return (
              <button
                key={t}
                onClick={() => setTypeFilter(t as typeof typeFilter)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t === "All" ? "All" : TYPE_META[t as PlaceType].label}
              </button>
            );
          })}
        </div>

        {/* Area filter */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(["All", ...AREAS] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAreaFilter(a)}
              className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
                areaFilter === a
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {a}
            </button>
          ))}
        </div>

        {/* Place list — expanded coord layout when Home/Office filter active */}
        {filteredPlaces.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            No locations match your filters.
          </div>
        ) : expandedCoords ? (
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
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
                    {p.address && (
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/80">
                        {p.address}
                      </span>
                    )}
                    <span className="mt-1 block rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                      {p.lat.toFixed(6)}, {p.lng.toFixed(6)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
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
                  className={`flex min-w-[220px] shrink-0 items-start gap-2 rounded-lg border p-2.5 text-left transition ${
                    active
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${meta.tone}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {p.area} · {meta.label}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground/80">
                      {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Custom location picker */}
        <details className="mt-4 rounded-lg border border-border">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
            Or pick anywhere on the map
            {customLocation && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setCustomLocation(null);
                }}
                className="ml-3 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </summary>
          <div className="border-t border-border p-3">
            <LocationPicker value={customLocation} onChange={setCustomLocation} compact />
          </div>
        </details>
      </div>

      {/* Images section */}
      <section className="space-y-4">
        {/* Dropzone */}
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
          <UploadCloud className="h-8 w-8 text-muted-foreground" />
          <div className="text-sm font-medium">Drop images here or click to browse</div>
          <div className="text-xs text-muted-foreground">
            JPG, PNG, WEBP — bulk upload supported
          </div>
        </div>

        {/* Toolbar */}
        {images.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-2.5">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>
                <b className="text-foreground">{images.length}</b> image
                {images.length === 1 ? "" : "s"}
              </span>
              {selected.size > 0 && (
                <span>
                  <b className="text-foreground">{selected.size}</b> selected
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={selected.size === images.length ? clearSelection : selectAll}
                className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent"
              >
                {selected.size === images.length ? "Clear selection" : "Select all"}
              </button>
              <button
                onClick={saveAll}
                disabled={savingBulk || readyToSave.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
              >
                {savingBulk ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UploadCloud className="h-3.5 w-3.5" />
                )}
                Save {readyToSave.length > 0 ? `${readyToSave.length} ` : ""}to cloud
              </button>
            </div>
          </div>
        )}

        {/* Image grid */}
        {images.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            <ImageIcon className="mx-auto mb-2 h-8 w-8 opacity-40" />
            No images yet. Upload some to start geotagging.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
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
                    {img.status === "saved" && (
                      <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-medium text-white">
                        <Check className="h-3 w-3" /> Saved
                      </span>
                    )}
                    {img.status === "saving" && (
                      <span className="absolute inset-0 grid place-items-center bg-black/40">
                        <Loader2 className="h-6 w-6 animate-spin text-white" />
                      </span>
                    )}
                    {isSelected && (
                      <span className="absolute inset-0 ring-2 ring-inset ring-primary" />
                    )}
                  </button>
                  <div className="space-y-1.5 p-2.5">
                    <div className="truncate text-xs font-medium" title={img.file.name}>
                      {img.file.name}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {img.locationLabel ?? "Not tagged"}
                    </div>
                    {img.lat !== null && (
                      <div className="font-mono text-[10px] text-muted-foreground/80">
                        {img.lat.toFixed(4)}, {img.lng!.toFixed(4)}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        onClick={() => applyToTargets([img.id])}
                        disabled={!activeCoord}
                        className="flex-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-40"
                      >
                        Tag
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
      </section>
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
