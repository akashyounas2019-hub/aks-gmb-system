import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Building2, MapPin, Phone, Mail, Globe, Loader2, ChevronDown } from "lucide-react";
import { getPreferences } from "@/lib/user-preferences.functions";
import { loadGoogleMaps } from "@/lib/google-maps";
import { geocodeAddress } from "@/lib/geocode.functions";
import { getNearbyCities } from "@/lib/nearby-cities.functions";

export const Route = createFileRoute("/_authenticated/settings/business-profile")({
  component: BusinessProfilePage,
});

type General = {
  businessName?: string;
  legalName?: string;
  tagline?: string;
  description?: string;
  industry?: string;
  businessType?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  email?: string;
  phone?: string;
  website?: string;
  bookingUrl?: string;
  hoursMonFri?: string;
  hoursSat?: string;
  hoursSun?: string;
};

const KEY = "settings_general_v2";

// 8 tiers up to 20 km, each 2.5 km wide.
const TIERS = Array.from({ length: 8 }, (_, i) => ({
  level: i + 1,
  from: i * 2.5,
  to: (i + 1) * 2.5,
}));

function BusinessProfilePage() {
  const load = useServerFn(getPreferences);
  const geocode = useServerFn(geocodeAddress);
  const fetchCities = useServerFn(getNearbyCities);
  const [general, setGeneral] = useState<General | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [cities, setCities] = useState<Array<{ name: string; distanceKm: number }>>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesError, setCitiesError] = useState<string | null>(null);
  const [openTier, setOpenTier] = useState<number | null>(null);

  // Load general settings — prefer server, fall back to localStorage cache.
  useEffect(() => {
    (async () => {
      try {
        const p = await load();
        const g = (p?.general ?? {}) as General;
        if (g && Object.keys(g).length > 0) {
          setGeneral(g);
          return;
        }
      } catch {
        /* fall back */
      }
      if (typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem(KEY);
          if (raw) setGeneral(JSON.parse(raw) as General);
        } catch {
          /* ignore */
        }
      }
    })();
  }, [load]);

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

  // Geocode the business address server-side via the Google Maps connector
  // gateway. The browser key is not authorized for the Geocoding API, so we
  // must not use window.google.maps.Geocoder here.
  useEffect(() => {
    if (!fullAddress) return;
    let cancelled = false;
    setGeocoding(true);
    setGeoError(null);
    geocode({ data: { address: fullAddress } })
      .then((res) => {
        if (cancelled) return;
        setGeocoding(false);
        setCoords({ lat: res.lat, lng: res.lng });
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setGeocoding(false);
        setGeoError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [fullAddress, geocode]);


  // Render map once coords resolve.
  useEffect(() => {
    if (!coords) return;
    let cancelled = false;
    loadGoogleMaps().then((google) => {
      if (cancelled) return;
      const el = document.getElementById("business-profile-map");
      if (!el) return;
      const map = new google.maps.Map(el, {
        center: coords,
        zoom: 11,
        mapTypeControl: false,
        streetViewControl: false,
      });
      new google.maps.Marker({
        position: coords,
        map,
        title: general?.businessName ?? "Business",
      });
      // Draw the 8 rings.
      const palette = [
        "#2563eb",
        "#3b82f6",
        "#60a5fa",
        "#93c5fd",
        "#bfdbfe",
        "#dbeafe",
        "#eff6ff",
        "#f1f5f9",
      ];
      TIERS.forEach((t, idx) => {
        new google.maps.Circle({
          strokeColor: palette[idx],
          strokeOpacity: 0.9,
          strokeWeight: 1,
          fillOpacity: 0,
          map,
          center: coords,
          radius: t.to * 1000,
        });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [coords, general?.businessName]);

  if (!general) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading business profile…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Business Profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Auto-generated from your General settings. Update it there and it will
          refresh here.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <ProfileCard
            icon={<Building2 className="h-5 w-5 text-primary" />}
            title={general.businessName || "Unnamed business"}
            subtitle={general.tagline || general.industry || undefined}
          >
            {general.description && (
              <p className="text-sm text-muted-foreground">{general.description}</p>
            )}
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <InfoRow label="Legal name" value={general.legalName} />
              <InfoRow label="Industry" value={general.industry} />
              <InfoRow label="Business type" value={general.businessType} />
              <InfoRow label="Website" value={general.website} icon={<Globe className="h-3.5 w-3.5" />} />
            </div>
          </ProfileCard>

          <ProfileCard
            icon={<MapPin className="h-5 w-5 text-primary" />}
            title="Location"
          >
            <p className="text-sm">
              {fullAddress || (
                <span className="text-muted-foreground">
                  Add your address in Settings → General.
                </span>
              )}
            </p>
            {coords && (
              <p className="text-xs text-muted-foreground">
                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </p>
            )}
          </ProfileCard>

          <ProfileCard
            icon={<Phone className="h-5 w-5 text-primary" />}
            title="Contact"
          >
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <InfoRow label="Phone" value={general.phone} icon={<Phone className="h-3.5 w-3.5" />} />
              <InfoRow label="Email" value={general.email} icon={<Mail className="h-3.5 w-3.5" />} />
            </div>
          </ProfileCard>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Service radius</h3>
            </div>
            <div
              id="business-profile-map"
              className="mb-3 h-56 w-full overflow-hidden rounded-md bg-muted"
            >
              {!coords && (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  {geocoding
                    ? "Locating business…"
                    : geoError ?? "Add an address to see the map."}
                </div>
              )}
            </div>
            <ul className="space-y-1.5">
              {TIERS.map((t) => (
                <li
                  key={t.level}
                  className="flex items-center justify-between rounded-md border border-border/60 bg-background px-3 py-1.5 text-xs"
                >
                  <span className="font-medium">Level {t.level}</span>
                  <span className="text-muted-foreground">
                    {t.from === 0 ? "0" : t.from} – {t.to} km
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-muted-foreground">
              20 km total service area, split into 8 concentric tiers of 2.5 km.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  icon,
}: {
  label: string;
  value?: string;
  icon?: React.ReactNode;
}) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-muted-foreground">{label}:</span>
      <span className="truncate">{value}</span>
    </div>
  );
}

