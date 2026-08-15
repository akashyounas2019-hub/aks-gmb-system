import { useEffect, useRef, useState } from "react";
import { MapPin, X, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadGoogleMaps } from "@/lib/google-maps";

export type PickedLocation = {
  label: string;
  lat: number;
  lng: number;
  place_id?: string | null;
};

const MAPS_KEY = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as
  string | undefined;
const CHANNEL = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as
  string | undefined;

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
  cityOptions,
  refreshKey = 0,
}: {
  value: PickedLocation | null;
  onChange: (loc: PickedLocation | null) => void;
  compact?: boolean;
  cityOptions?: { name: string; lat: number; lng: number }[];
  refreshKey?: number;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<{ text: string; placeId: string }[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCity, setExpandedCity] = useState<string | null>(null);
  const [cityPlaces, setCityPlaces] = useState<
    { placeId: string; label: string; lat: number; lng: number }[]
  >([]);
  const [cityPlacesLoading, setCityPlacesLoading] = useState(false);
  const [copiedPlaceId, setCopiedPlaceId] = useState<string | null>(null);
  // Area currently shown on the map — either a city chip or a typed area.
  const [searchArea, setSearchArea] = useState<{
    name: string;
    lat?: number;
    lng?: number;
  } | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const sessionTokenRef = useRef<any>(null);

  // Real nearby-places lookup around a city's centroid — replaces the old
  // fabricated "point 1..5" coordinates that were never real addresses.
  // When `type` is set, biases the search toward that property category
  // (Home / Office / Commercial / Villas) instead of returning anything
  // nearby.
  async function loadCityPlaces(
    city: { name: string; lat?: number; lng?: number },
    type: CityPlaceType | null,
  ) {
    setCityPlacesLoading(true);
    setCityPlaces([]);
    try {
      const { Place } = (await (window as any).google.maps.importLibrary("places")) as any;
      const hasCoords = typeof city.lat === "number" && typeof city.lng === "number";
      let found: any[];
      if (type || !hasCoords) {
        const term = type ? CITY_PLACE_TYPES.find((t) => t.key === type)!.term : "places";
        const res = await Place.searchByText({
          textQuery: `${term} in ${city.name}`,
          fields: ["displayName", "formattedAddress", "location", "id"],
          ...(hasCoords ? { locationBias: { lat: city.lat!, lng: city.lng!, radius: 5000 } } : {}),
          maxResultCount: 20,
        });
        found = res.places ?? [];
      } else {
        const res = await Place.searchNearby({
          fields: ["displayName", "formattedAddress", "location", "id"],
          locationRestriction: {
            center: { lat: city.lat!, lng: city.lng! },
            radius: 2500,
          },
          maxResultCount: 20,
        });
        found = res.places ?? [];
      }
      const mapped = (found ?? [])
        .map((p: any) => {
          const loc = p.location;
          const lat = typeof loc?.lat === "function" ? loc.lat() : loc?.lat;
          const lng = typeof loc?.lng === "function" ? loc.lng() : loc?.lng;
          if (typeof lat !== "number" || typeof lng !== "number") return null;
          return {
            placeId: p.id as string,
            label: (p.displayName?.text ??
              p.formattedAddress ??
              p.displayName ??
              "Unnamed place") as string,
            lat,
            lng,
          };
        })
        .filter(
          (
            p: { placeId: string; label: string; lat: number; lng: number } | null,
          ): p is {
            placeId: string;
            label: string;
            lat: number;
            lng: number;
          } => p !== null,
        );
      setCityPlaces(mapped);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nearby search failed");
    } finally {
      setCityPlacesLoading(false);
    }
  }

  // Re-run the nearby search for the currently expanded city when the
  // parent asks for a refresh (e.g. the page's "Refresh coordinates" button).
  useEffect(() => {
    if (refreshKey === 0 || !searchArea) return;
    loadCityPlaces(searchArea, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Render the map widget with a pin per result once results have loaded.
  useEffect(() => {
    if (cityPlaces.length === 0 || !mapRef.current) return;
    let cancelled = false;
    loadGoogleMaps().then((google) => {
      if (cancelled || !mapRef.current) return;
      const center = cityPlaces[0];
      const map = new google.maps.Map(mapRef.current, {
        center: { lat: center.lat, lng: center.lng },
        zoom: 14,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        clickableIcons: false,
      });
      const bounds = new google.maps.LatLngBounds();
      const infoWindow = new google.maps.InfoWindow();
      cityPlaces.forEach((p) => {
        const position = { lat: p.lat, lng: p.lng };
        bounds.extend(position);
        const marker = new google.maps.Marker({ position, map, title: p.label });
        // Left click a pin → select that place and continue.
        marker.addListener("click", () => {
          commit({ label: p.label, lat: p.lat, lng: p.lng, place_id: p.placeId });
        });
        // Right click a pin → copy its coordinates.
        marker.addListener("contextmenu", () => {
          copyCoords(p.placeId, p.lat, p.lng);
          infoWindow.setContent(
            `<div style="font-family:system-ui;font-size:12px;max-width:220px;color:#000">
              <div style="font-weight:600;margin-bottom:2px;color:#000">${escapeHtml(p.label)}</div>
              <div style="color:#000">Copied ${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}</div>
            </div>`,
          );
          infoWindow.open({ map, anchor: marker });
        });
      });
      // Click empty map → select that exact coordinate.
      map.addListener("click", (e: google.maps.MapMouseEvent) => {
        const lat = e.latLng?.lat();
        const lng = e.latLng?.lng();
        if (typeof lat !== "number" || typeof lng !== "number") return;
        commit({
          label: `Pinned ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          lat,
          lng,
          place_id: null,
        });
      });
      // Right click empty map → copy that coordinate.
      map.addListener("contextmenu", (e: google.maps.MapMouseEvent) => {
        const lat = e.latLng?.lat();
        const lng = e.latLng?.lng();
        if (typeof lat !== "number" || typeof lng !== "number") return;
        copyCoords("map", lat, lng);
        infoWindow.setPosition({ lat, lng });
        infoWindow.setContent(
          `<div style="font-family:system-ui;font-size:12px;color:#000">Copied ${lat.toFixed(6)}, ${lng.toFixed(6)}</div>`,
        );
        infoWindow.open({ map });
      });
      if (cityPlaces.length > 1) map.fitBounds(bounds);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityPlaces]);

  async function copyCoords(placeId: string, lat: number, lng: number) {
    try {
      await navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      setCopiedPlaceId(placeId);
      setTimeout(() => setCopiedPlaceId((cur) => (cur === placeId ? null : cur)), 1500);
    } catch {
      /* clipboard unavailable — ignore, coordinates are still visible as text */
    }
  }

  useEffect(() => {
    loadMaps()
      .then(() => setReady(true))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!ready || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { AutocompleteSessionToken, AutocompleteSuggestion } = (await (
          window as any
        ).google.maps.importLibrary("places")) as any;
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new AutocompleteSessionToken();
        }
        const { suggestions: raw } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
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

  // Typing a city/area name should show the map with pins automatically.
  useEffect(() => {
    const area = query.trim();
    if (!ready || area.length < 3) return;
    const timer = setTimeout(() => {
      setExpandedCity(null);
      const next = { name: area };
      setSearchArea(next);
      loadCityPlaces(next, null);
    }, 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, ready]);

  async function selectSuggestion(placeId: string, fallbackText: string) {
    try {
      const { Place } = (await (window as any).google.maps.importLibrary("places")) as any;
      const place = new Place({ id: placeId });
      await place.fetchFields({
        fields: ["displayName", "formattedAddress", "location"],
      });
      const label =
        place.formattedAddress || place.displayName?.text || place.displayName || fallbackText;
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
    // Keep a map visible after a selection: if nothing is plotted yet, plot
    // the picked point itself so the user can still see/adjust it.
    setSearchArea((cur) => cur ?? { name: loc.label, lat: loc.lat, lng: loc.lng });
    setCityPlaces((cur) =>
      cur.length > 0
        ? cur
        : [
            {
              placeId: loc.place_id ?? `picked-${loc.lat},${loc.lng}`,
              label: loc.label,
              lat: loc.lat,
              lng: loc.lng,
            },
          ],
    );

    // Upsert into location_history (MRU)
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;
    const existing = history.find((h) => h.place_id === loc.place_id || h.label === loc.label);
    if (existing) {
      await supabase
        .from("location_history")
        .update({
          last_used_at: new Date().toISOString(),
          used_count: (existing.used_count ?? 0) + 1,
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
      .select("id,label,lat,lng,place_id,used_count")
      .order("last_used_at", { ascending: false })
      .limit(8);
    setHistory((data ?? []) as HistoryRow[]);
  }

  return (
    <div className={compact ? "" : "space-y-2"}>
      {value && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <MapPin className="h-4 w-4 text-primary shrink-0" />
            <span className="truncate font-medium text-foreground">{value.label}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
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
        </div>
      )}
      {error && <div className="text-xs text-destructive">{error}</div>}

      {/* City shortcuts — clicking one runs a real Google Places search near
          that city's centroid, so results are actual places. */}
      {cityOptions && cityOptions.length > 0 && (
        <div className={compact ? "mt-2" : ""}>
          <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" /> Cities
          </div>
          <div className="flex flex-wrap gap-1.5">
            {cityOptions
              .filter((c) =>
                query.trim().length === 0
                  ? true
                  : c.name.toLowerCase().includes(query.trim().toLowerCase()),
              )
              .map((c) => {
                const active = expandedCity === c.name;
                return (
                  <button
                    key={c.name}
                    onClick={() => {
                      const next = active ? null : c.name;
                      setExpandedCity(next);
                      setCityPlaces([]);
                      if (next) {
                        setSearchArea(c);
                        loadCityPlaces(c, null);
                      } else {
                        setSearchArea(null);
                      }
                    }}
                    className={`rounded-full border px-2.5 py-1 text-xs transition ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card hover:border-primary hover:text-primary"
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Map widget with a pin per matching location, plus a copyable
          coordinate list. Shown for both city chips and typed areas. */}
      {searchArea && (
        <div className="mt-2">
          {cityPlacesLoading ? (
            <div className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
              Searching {searchArea.name}…
            </div>
          ) : cityPlaces.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
              No places found near {searchArea.name}.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-[11px] text-muted-foreground">
                {cityPlaces.length} results · click a pin or the map to use that location ·
                right-click anywhere to copy its coordinates.
              </div>
              <div
                ref={mapRef}
                className="h-[420px] w-full overflow-hidden rounded-md border border-border bg-muted md:h-[520px]"
              />

              <div className="grid gap-1.5 sm:grid-cols-2">
                {cityPlaces.map((v) => (
                  <div
                    key={v.placeId}
                    className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        commit({ label: v.label, lat: v.lat, lng: v.lng, place_id: v.placeId })
                      }
                      className="min-w-0 flex-1 truncate text-left hover:text-primary font-medium"
                      title="Use this location"
                    >
                      {v.label}
                    </button>
                    <button
                      type="button"
                      onClick={() => copyCoords(v.placeId, v.lat, v.lng)}
                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label="Copy coordinates"
                      title="Copy coordinates"
                    >
                      {copiedPlaceId === v.placeId ? (
                        <Check className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
