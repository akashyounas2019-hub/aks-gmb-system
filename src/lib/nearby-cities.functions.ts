import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Fetch nearby cities/localities via the Google Places connector gateway,
 * then bucket them by distance from the origin.
 */
export const getNearbyCities = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z
      .object({
        lat: z.number(),
        lng: z.number(),
        radiusKm: z.number().min(1).max(50).default(20),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const gmKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!lovableKey || !gmKey) {
      throw new Error("Google Maps connector not configured");
    }
    const radiusM = Math.round(data.radiusKm * 1000);

    // Text search returns localities well when queried for "cities" biased by location.
    const url =
      `https://connector-gateway.lovable.dev/google_maps/maps/api/place/textsearch/json` +
      `?query=cities&location=${data.lat},${data.lng}&radius=${radiusM}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gmKey,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Places search failed [${res.status}]: ${body}`);
    }
    const json = (await res.json()) as {
      status: string;
      results: Array<{
        name: string;
        formatted_address?: string;
        geometry: { location: { lat: number; lng: number } };
        types?: string[];
      }>;
      error_message?: string;
    };
    if (json.status !== "OK" && json.status !== "ZERO_RESULTS") {
      throw new Error(
        `Nearby cities failed (${json.status}${json.error_message ? `: ${json.error_message}` : ""})`,
      );
    }

    const seen = new Set<string>();
    const cities = (json.results ?? [])
      .filter((r) => {
        const t = r.types ?? [];
        // Keep place-like results (cities, sublocalities, neighborhoods).
        return (
          t.includes("locality") ||
          t.includes("sublocality") ||
          t.includes("neighborhood") ||
          t.includes("administrative_area_level_2") ||
          t.includes("administrative_area_level_3")
        );
      })
      .map((r) => {
        const d = haversineKm(data.lat, data.lng, r.geometry.location.lat, r.geometry.location.lng);
        return { name: r.name, distanceKm: d };
      })
      .filter((c) => c.distanceKm <= data.radiusKm)
      .filter((c) => {
        const key = c.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return { cities };
  });

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
