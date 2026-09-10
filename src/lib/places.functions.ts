import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Google Places lookups run server-side through the Lovable connector
 * gateway. The browser map key is no longer authorized for Places, so all
 * autocomplete / search / details calls must go through here.
 */

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

function creds() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const gmKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!lovableKey || !gmKey) throw new Error("Google Maps connector not configured");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": gmKey,
    "Content-Type": "application/json",
  } as Record<string, string>;
}

async function gatewayFetch(path: string, init: RequestInit & { fieldMask?: string }) {
  const { fieldMask, headers, ...rest } = init;
  const res = await fetch(`${GATEWAY}${path}`, {
    ...rest,
    headers: {
      ...creds(),
      ...(fieldMask ? { "X-Goog-FieldMask": fieldMask } : {}),
      ...(headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Places request failed [${res.status}]: ${body}`);
  }
  return res.json() as Promise<any>;
}

/* ------------------------------- geocoding ------------------------------- */

async function geocodeArea(area: string): Promise<{ lat: number; lng: number } | null> {
  const json = await gatewayFetch(
    `/maps/api/geocode/json?address=${encodeURIComponent(area)}`,
    { method: "GET" },
  );
  const loc = json?.results?.[0]?.geometry?.location;
  if (typeof loc?.lat !== "number" || typeof loc?.lng !== "number") return null;
  return { lat: loc.lat, lng: loc.lng };
}

/* ------------------------------ place search ----------------------------- */

// Place types (Places API New) that map to what a geo-tagging user wants to
// pin: homes, villas, apartment towers, and shops.
const RESIDENTIAL_TYPES = [
  "apartment_building",
  "apartment_complex",
  "condominium_complex",
  "housing_complex",
];
const SHOP_TYPES = [
  "shopping_mall",
  "supermarket",
  "convenience_store",
  "grocery_store",
  "clothing_store",
  "electronics_store",
  "furniture_store",
  "home_goods_store",
  "store",
];

const CATEGORY_QUERIES: Record<string, string[]> = {
  home: ["residential building", "apartment tower", "villa community", "townhouses"],
  office: ["office building", "business center"],
  commercial: ["shops", "shopping mall", "retail store"],
  villas: ["villa community", "villas", "gated residential community"],
  all: ["residential building", "apartment tower", "villas", "shops"],
};

export type AreaPlace = {
  placeId: string;
  label: string;
  address?: string;
  lat: number;
  lng: number;
  kind: "residential" | "shop" | "other";
};

function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(la1) * Math.cos(la2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function classify(types: string[] | undefined): AreaPlace["kind"] {
  const t = types ?? [];
  if (t.some((x) => RESIDENTIAL_TYPES.includes(x) || /lodging|real_estate/.test(x))) {
    return "residential";
  }
  if (t.some((x) => SHOP_TYPES.includes(x) || /store|shop|market/.test(x))) return "shop";
  return "other";
}

function mapPlace(p: any): AreaPlace | null {
  const lat = p?.location?.latitude;
  const lng = p?.location?.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return {
    placeId: p.id,
    label: p.displayName?.text ?? p.formattedAddress ?? "Unnamed place",
    address: p.formattedAddress ?? undefined,
    lat,
    lng,
    kind: classify(p.types),
  };
}

/**
 * Find real, pin-able places strictly inside the chosen area — residential
 * buildings, villas and apartment towers first, then shops.
 */
export const searchAreaPlaces = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        area: z.string().min(2).max(200),
        lat: z.number().optional(),
        lng: z.number().optional(),
        category: z.enum(["all", "home", "office", "commercial", "villas"]).default("all"),
        radius: z.number().min(500).max(20000).default(5000),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    let center =
      typeof data.lat === "number" && typeof data.lng === "number"
        ? { lat: data.lat, lng: data.lng }
        : null;
    if (!center) center = await geocodeArea(data.area);
    if (!center) throw new Error(`Couldn't locate "${data.area}"`);

    const searchMask =
      "places.id,places.displayName,places.formattedAddress,places.location,places.types";

    const tasks: Promise<any[]>[] = [];

    // Nearby search restricted to the area circle — guarantees relevance.
    const includedTypes =
      data.category === "commercial"
        ? SHOP_TYPES.slice(0, 8)
        : data.category === "office"
          ? ["corporate_office"]
          : RESIDENTIAL_TYPES;
    tasks.push(
      gatewayFetch("/places/v1/places:searchNearby", {
        method: "POST",
        fieldMask: searchMask,
        body: JSON.stringify({
          includedTypes,
          maxResultCount: 20,
          rankPreference: "DISTANCE",
          locationRestriction: {
            circle: { center: { latitude: center.lat, longitude: center.lng }, radius: data.radius },
          },
        }),
      })
        .then((j) => j.places ?? [])
        .catch(() => []),
    );

    if (data.category === "all") {
      tasks.push(
        gatewayFetch("/places/v1/places:searchNearby", {
          method: "POST",
          fieldMask: searchMask,
          body: JSON.stringify({
            includedTypes: SHOP_TYPES.slice(0, 8),
            maxResultCount: 15,
            rankPreference: "DISTANCE",
            locationRestriction: {
              circle: {
                center: { latitude: center.lat, longitude: center.lng },
                radius: data.radius,
              },
            },
          }),
        })
          .then((j) => j.places ?? [])
          .catch(() => []),
      );
    }

    // Text searches biased to the same circle catch villas / towers that
    // carry no structured place type.
    for (const q of CATEGORY_QUERIES[data.category] ?? CATEGORY_QUERIES.all) {
      tasks.push(
        gatewayFetch("/places/v1/places:searchText", {
          method: "POST",
          fieldMask: searchMask,
          body: JSON.stringify({
            textQuery: `${q} in ${data.area}`,
            pageSize: 10,
            locationBias: {
              circle: {
                center: { latitude: center.lat, longitude: center.lng },
                radius: data.radius,
              },
            },
          }),
        })
          .then((j) => j.places ?? [])
          .catch(() => []),
      );
    }

    const raw = (await Promise.all(tasks)).flat();

    const seen = new Set<string>();
    const places: (AreaPlace & { distance: number })[] = [];
    for (const p of raw) {
      const m = mapPlace(p);
      if (!m || seen.has(m.placeId)) continue;
      const distance = distanceMeters(center, m);
      // Strictly relevant: drop anything outside the chosen area radius.
      if (distance > data.radius) continue;
      seen.add(m.placeId);
      places.push({ ...m, distance });
    }

    const rank = (k: AreaPlace["kind"]) => (k === "residential" ? 0 : k === "shop" ? 1 : 2);
    places.sort((a, b) => rank(a.kind) - rank(b.kind) || a.distance - b.distance);

    return { center, places: places.slice(0, 40) };
  });

/* ------------------------------ autocomplete ----------------------------- */

export const placeAutocomplete = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        input: z.string().min(2).max(200),
        sessionToken: z.string().max(100).optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const json = await gatewayFetch("/places/v1/places:autocomplete", {
      method: "POST",
      fieldMask: "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
      body: JSON.stringify({
        input: data.input,
        ...(data.sessionToken ? { sessionToken: data.sessionToken } : {}),
        includedRegionCodes: ["ae"],
        ...(typeof data.lat === "number" && typeof data.lng === "number"
          ? {
              locationBias: {
                circle: {
                  center: { latitude: data.lat, longitude: data.lng },
                  radius: 50000,
                },
              },
            }
          : {}),
      }),
    });
    const suggestions = (json.suggestions ?? [])
      .map((s: any) => s.placePrediction)
      .filter(Boolean)
      .map((p: any) => ({ placeId: p.placeId as string, text: (p.text?.text ?? "") as string }));
    return { suggestions };
  });

export const placeDetails = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({ placeId: z.string().min(3).max(300), sessionToken: z.string().max(100).optional() })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const qs = data.sessionToken ? `?sessionToken=${encodeURIComponent(data.sessionToken)}` : "";
    const json = await gatewayFetch(`/places/v1/places/${encodeURIComponent(data.placeId)}${qs}`, {
      method: "GET",
      fieldMask: "id,displayName,formattedAddress,location,types",
    });
    const lat = json?.location?.latitude;
    const lng = json?.location?.longitude;
    if (typeof lat !== "number" || typeof lng !== "number") {
      throw new Error("Place has no coordinates");
    }
    return {
      placeId: json.id as string,
      label: (json.formattedAddress ?? json.displayName?.text ?? "Selected place") as string,
      lat,
      lng,
    };
  });
