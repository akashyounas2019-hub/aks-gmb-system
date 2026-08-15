/// <reference types="google.maps" />

// Shared browser-side Google Maps JS API loader for Lovable projects.
// Uses the referrer-restricted browser key exposed by the Google Maps
// connector, and includes the Places library.

declare global {
  interface Window {
    google?: typeof google;
    __lovableMapsPromise?: Promise<typeof google>;
    __lovableMapsCb?: () => void;
  }
}

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps is browser-only"));
  }
  if (window.google?.maps) return Promise.resolve(window.google);
  if (window.__lovableMapsPromise) return window.__lovableMapsPromise;

  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as
    string | undefined;
  if (!key) return Promise.reject(new Error("Google Maps key not configured"));

  const p = new Promise<typeof google>((resolve, reject) => {
    window.__lovableMapsCb = () => {
      if (window.google?.maps) resolve(window.google);
      else reject(new Error("Google Maps failed to load"));
    };
    const s = document.createElement("script");
    const params = new URLSearchParams({
      key,
      loading: "async",
      callback: "__lovableMapsCb",
      libraries: "places",
    });
    if (channel) params.set("channel", channel);
    s.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    s.async = true;
    s.onerror = () => reject(new Error("Google Maps script failed to load"));
    document.head.appendChild(s);
  });
  window.__lovableMapsPromise = p;
  return p;
}
