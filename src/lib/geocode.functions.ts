import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Geocode an address via the Google Maps connector gateway.
 * The browser key is NOT authorized for the Geocoding API, so this
 * must run server-side using the server-side connector key.
 */
export const geocodeAddress = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ address: z.string().min(3).max(500) }).parse(data))
  .handler(async ({ data }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const gmKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!lovableKey || !gmKey) {
      throw new Error("Google Maps connector not configured");
    }
    const url = `https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json?address=${encodeURIComponent(data.address)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gmKey,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Geocoding failed [${res.status}]: ${body}`);
    }
    const json = (await res.json()) as {
      status: string;
      results: Array<{
        geometry: { location: { lat: number; lng: number } };
        formatted_address: string;
      }>;
      error_message?: string;
    };
    if (json.status !== "OK" || !json.results[0]) {
      throw new Error(
        `Could not resolve address (${json.status}${json.error_message ? `: ${json.error_message}` : ""})`,
      );
    }
    const loc = json.results[0].geometry.location;
    return {
      lat: loc.lat,
      lng: loc.lng,
      formattedAddress: json.results[0].formatted_address,
    };
  });
