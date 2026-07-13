/// <reference types="google.maps" />
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Loader2, ExternalLink, Star } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { getPreferences } from "@/lib/user-preferences.functions";
import { listCompetitors } from "@/lib/competitors.functions";
import { loadGoogleMaps } from "@/lib/google-maps";

type Competitor = {
  id: string;
  name: string;
  gbp_url: string | null;
  place_id: string | null;
  notes: string | null;
};

type Located = Competitor & {
  lat: number;
  lng: number;
  rating?: number;
  ratingCount?: number;
  address?: string;
};

type General = {
  businessName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

export function DashboardCompetitorMap() {
  const loadPrefs = useServerFn(getPreferences);
  const fetchCompetitors = useServerFn(listCompetitors);
  const [general, setGeneral] = useState<General | null>(null);
  const [businessCoords, setBusinessCoords] =
    useState<{ lat: number; lng: number } | null>(null);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [located, setLocated] = useState<Located[]>([]);
  const [status, setStatus] = useState<
    "idle" | "loading" | "ready" | "no-address" | "error"
  >("loading");
  const [error, setError] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  // Load prefs + competitors in parallel.
  useEffect(() => {
    (async () => {
      try {
        const [p, c] = await Promise.all([
          loadPrefs().catch(() => null),
          fetchCompetitors().catch(() => []),
        ]);
        const g = (p?.general ?? {}) as General;
        setGeneral(g);
        setCompetitors((c ?? []) as Competitor[]);
      } catch (e) {
        setStatus("error");
        setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
  }, [loadPrefs, fetchCompetitors]);

  const fullAddress = useMemo(() => {
    if (!general) return "";
    return [
      general.addressLine1,
      general.addressLine2,
      general.city,
      general.state,
      general.postalCode,
      general.country,
    ]
      .filter(Boolean)
      .join(", ");
  }, [general]);

  // Geocode business + resolve competitor coordinates.
  useEffect(() => {
    if (!general) return;
    if (!fullAddress) {
      setStatus("no-address");
      return;
    }
    let cancelled = false;
    setStatus("loading");

    loadGoogleMaps()
      .then(async (google) => {
        if (cancelled) return;
        const geocoder = new google.maps.Geocoder();
        const businessLoc = await new Promise<{ lat: number; lng: number } | null>(
          (resolve) => {
            geocoder.geocode({ address: fullAddress }, (results, s) => {
              if (s === "OK" && results && results[0]) {
                const loc = results[0].geometry.location;
                resolve({ lat: loc.lat(), lng: loc.lng() });
              } else resolve(null);
            });
          },
        );
        if (cancelled) return;
        if (!businessLoc) {
          setStatus("error");
          setError("Could not resolve your business address.");
          return;
        }
        setBusinessCoords(businessLoc);

        // Resolve competitor coordinates via Places API (New).
        // Only place IDs that look canonical (ChIJ…) are used.
        const withPlace = competitors.filter(
          (c) => c.place_id && /^ChIJ[A-Za-z0-9_-]{20,}$/.test(c.place_id),
        );
        const placesLib = (await google.maps.importLibrary(
          "places",
        )) as google.maps.PlacesLibrary;
        const resolved: Located[] = [];
        await Promise.all(
          withPlace.map(async (c) => {
            try {
              const place = new placesLib.Place({ id: c.place_id! });
              await place.fetchFields({
                fields: [
                  "location",
                  "displayName",
                  "formattedAddress",
                  "rating",
                  "userRatingCount",
                ],
              });
              if (place.location) {
                resolved.push({
                  ...c,
                  lat: place.location.lat(),
                  lng: place.location.lng(),
                  rating: place.rating ?? undefined,
                  ratingCount: place.userRatingCount ?? undefined,
                  address: place.formattedAddress ?? undefined,
                });
              }
            } catch {
              /* skip unresolvable competitor */
            }
          }),
        );
        if (cancelled) return;
        setLocated(resolved);
        setStatus("ready");
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setStatus("error");
        setError(e.message);
      });

    return () => {
      cancelled = true;
    };
  }, [general, fullAddress, competitors]);

  // Render map once we have business coords.
  useEffect(() => {
    if (!businessCoords || !mapRef.current) return;
    let cancelled = false;
    loadGoogleMaps().then((google) => {
      if (cancelled || !mapRef.current) return;
      const map = new google.maps.Map(mapRef.current, {
        center: businessCoords,
        zoom: 12,
        mapTypeControl: false,
        streetViewControl: false,
      });
      // Business pin — primary color.
      new google.maps.Marker({
        position: businessCoords,
        map,
        title: general?.businessName ?? "Your business",
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#2563eb",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
        zIndex: 1000,
      });
      // Competitor pins.
      const infoWindow = new google.maps.InfoWindow();
      located.forEach((c) => {
        const marker = new google.maps.Marker({
          position: { lat: c.lat, lng: c.lng },
          map,
          title: c.name,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: "#ef4444",
            fillOpacity: 0.9,
            strokeColor: "#ffffff",
            strokeWeight: 1.5,
          },
        });
        marker.addListener("click", () => {
          infoWindow.setContent(
            `<div style="font-family:system-ui;font-size:12px;max-width:220px">
              <div style="font-weight:600;margin-bottom:2px">${escapeHtml(c.name)}</div>
              ${c.address ? `<div style="color:#64748b">${escapeHtml(c.address)}</div>` : ""}
              ${
                c.rating
                  ? `<div style="margin-top:4px">★ ${c.rating.toFixed(1)} (${c.ratingCount ?? 0})</div>`
                  : ""
              }
            </div>`,
          );
          infoWindow.open({ map, anchor: marker });
        });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [businessCoords, located, general?.businessName]);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Local competitive map</h3>
        </div>
        <Link
          to="/competitors"
          className="text-xs text-primary hover:underline"
        >
          Manage competitors
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div
          ref={mapRef}
          className="h-72 w-full overflow-hidden rounded-md bg-muted lg:h-96"
        >
          {status !== "ready" && (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              {status === "loading" && (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading map…
                </>
              )}
              {status === "no-address" && (
                <span>
                  Add your business address in{" "}
                  <Link to="/settings/general" className="text-primary underline">
                    Settings → General
                  </Link>{" "}
                  to see the map.
                </span>
              )}
              {status === "error" && <span>{error ?? "Map failed to load."}</span>}
            </div>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Competitors
            </span>
            <span className="text-xs text-muted-foreground">
              {located.length}/{competitors.length} on map
            </span>
          </div>
          {competitors.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              No competitors added yet.
            </div>
          ) : (
            <ul className="space-y-2">
              {competitors.map((c) => {
                const loc = located.find((l) => l.id === c.id);
                return (
                  <li
                    key={c.id}
                    className="rounded-md border border-border bg-background p-3 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">{c.name}</span>
                      {c.gbp_url && (
                        <a
                          href={c.gbp_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground hover:text-primary"
                          aria-label="Open Google profile"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                    {loc?.address && (
                      <div className="mt-1 text-muted-foreground">{loc.address}</div>
                    )}
                    {loc?.rating && (
                      <div className="mt-1 inline-flex items-center gap-1 text-amber-500">
                        <Star className="h-3 w-3 fill-amber-500" />
                        {loc.rating.toFixed(1)}
                        <span className="text-muted-foreground">
                          ({loc.ratingCount ?? 0})
                        </span>
                      </div>
                    )}
                    {c.notes && (
                      <p className="mt-1 text-muted-foreground">{c.notes}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
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
