import { useEffect, useRef, useState } from "react";
import { MapPin, Clock, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type PickedLocation = {
  label: string;
  lat: number;
  lng: number;
  place_id?: string | null;
};

type HistoryRow = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  place_id: string | null;
  used_count?: number;
};

const MAPS_KEY = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as
  | string
  | undefined;
const CHANNEL = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as
  | string
  | undefined;

let mapsPromise: Promise<void> | null = null;
function loadMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).google?.maps?.importLibrary) return Promise.resolve();
  if (mapsPromise) return mapsPromise;
  if (!MAPS_KEY) return Promise.reject(new Error("Google Maps key missing"));
  mapsPromise = new Promise<void>((resolve, reject) => {
    (window as any).__initMaps = () => resolve();
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&v=weekly&libraries=places&loading=async&callback=__initMaps${
      CHANNEL ? `&channel=${CHANNEL}` : ""
    }`;
    s.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(s);
  });
  return mapsPromise;
}

export function LocationPicker({
  value,
  onChange,
  compact = false,
}: {
  value: PickedLocation | null;
  onChange: (loc: PickedLocation | null) => void;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<
    { text: string; placeId: string }[]
  >([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionTokenRef = useRef<any>(null);

  useEffect(() => {
    loadMaps().then(() => setReady(true)).catch((e) => setError(e.message));
    supabase
      .from("location_history")
      .select("id,label,lat,lng,place_id,used_count")
      .order("last_used_at", { ascending: false })
      .limit(8)
      .then(({ data }) => setHistory((data ?? []) as HistoryRow[]));
  }, []);

  useEffect(() => {
    if (!ready || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { AutocompleteSessionToken, AutocompleteSuggestion } =
          (await (window as any).google.maps.importLibrary("places")) as any;
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new AutocompleteSessionToken();
        }
        const { suggestions: raw } =
          await AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: query,
            sessionToken: sessionTokenRef.current,
            // bias towards UAE — most users are Dubai
            includedRegionCodes: ["ae"],
          });
        if (cancelled) return;
        const list = (raw ?? [])
          .map((s: any) => s.placePrediction)
          .filter(Boolean)
          .map((p: any) => ({
            text: p.text?.toString() ?? "",
            placeId: p.placeId,
          }));
        setSuggestions(list);
      } catch (e) {
        if (!cancelled) setSuggestions([]);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, ready]);

  async function selectSuggestion(placeId: string, fallbackText: string) {
    try {
      const { Place } = (await (window as any).google.maps.importLibrary(
        "places",
      )) as any;
      const place = new Place({ id: placeId });
      await place.fetchFields({
        fields: ["displayName", "formattedAddress", "location"],
      });
      const label =
        place.formattedAddress ||
        place.displayName?.text ||
        place.displayName ||
        fallbackText;
      const loc = place.location;
      const lat = typeof loc?.lat === "function" ? loc.lat() : loc?.lat;
      const lng = typeof loc?.lng === "function" ? loc.lng() : loc?.lng;
      if (typeof lat !== "number" || typeof lng !== "number") return;
      await commit({ label, lat, lng, place_id: placeId });
      sessionTokenRef.current = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Place lookup failed");
    }
  }

  async function commit(loc: PickedLocation) {
    onChange(loc);
    setQuery("");
    setSuggestions([]);
    // Upsert into location_history (MRU)
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;
    const existing = history.find(
      (h) => h.place_id === loc.place_id || h.label === loc.label,
    );
    if (existing) {
      await supabase
        .from("location_history")
        .update({
          last_used_at: new Date().toISOString(),
          used_count: (history.find((h) => h.id === existing.id)?.used_count ??
            0) + 1,
        } as any)
        .eq("id", existing.id);
    } else {
      await supabase.from("location_history").insert({
        owner_id: uid,
        label: loc.label,
        lat: loc.lat,
        lng: loc.lng,
        place_id: loc.place_id ?? null,
      });
    }
    const { data } = await supabase
      .from("location_history")
      .select("id,label,lat,lng,place_id")
      .order("last_used_at", { ascending: false })
      .limit(8);
    setHistory((data ?? []) as HistoryRow[]);
  }

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
        <MapPin className="h-4 w-4 text-primary" />
        <div className="min-w-0 flex-1 truncate">{value.label}</div>
        <span className="font-mono text-xs text-muted-foreground">
          {value.lat.toFixed(4)}, {value.lng.toFixed(4)}
        </span>
        <button
          onClick={() => onChange(null)}
          className="rounded p-1 text-muted-foreground hover:bg-accent"
          aria-label="Clear location"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className={compact ? "" : "space-y-2"}>
      <div className="relative">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              ready
                ? "Search a location, e.g. Al Qusais, Dubai"
                : "Loading Google Maps…"
            }
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        {suggestions.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-lg border border-border bg-popover shadow-lg">
            {suggestions.map((s) => (
              <li key={s.placeId}>
                <button
                  onClick={() => selectSuggestion(s.placeId, s.text)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  {s.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <div className="text-xs text-destructive">{error}</div>}
      {history.length > 0 && !compact && (
        <div>
          <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" /> Recent
          </div>
          <div className="flex flex-wrap gap-1.5">
            {history.map((h) => (
              <button
                key={h.id}
                onClick={() =>
                  commit({
                    label: h.label,
                    lat: Number(h.lat),
                    lng: Number(h.lng),
                    place_id: h.place_id,
                  })
                }
                className="rounded-full border border-border bg-card px-2.5 py-1 text-xs hover:border-primary hover:text-primary"
              >
                {h.label.length > 40 ? h.label.slice(0, 40) + "…" : h.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
