// HeartBeat Helper integration.
//
// HeartBeat is a separate Lovable project that owns image generation for
// Facebook creatives. It has no backend of its own — images are served as
// static assets from its published URL under /offers/*.png and /photos/*.png.
// This project pulls that catalog live and imports selected images into the
// local Facebook Library (frames bucket + images table).

export type HeartbeatItem = {
  id: string;                     // stable id (path)
  src: string;                    // relative path on HeartBeat, e.g. /offers/house-01.png
  title: string;
  badge: "Ad" | "Photo" | "Story" | "Post";
  vertical?: boolean;
  group: "offer" | "photo";
  groupKey: string;
};

export const HB_OFFER_GROUPS = [
  { key: "house", title: "5 Hours House Cleaning", subtitle: "Only 99 AED · Selected Areas", count: 5 },
  { key: "ac", title: "AC Deep Cleaning", subtitle: "Only 100 AED per unit", count: 5 },
  { key: "sofa", title: "Sofa Deep Cleaning", subtitle: "3S · 80 · 4S · 90 · 5S · 99 AED", count: 5 },
] as const;

export const HB_PHOTO_CATEGORIES = [
  { key: "home", name: "Home & Villa Deep Cleaning", count: 10 },
  { key: "kitchen", name: "Kitchen Deep Cleaning", count: 8 },
  { key: "office", name: "Office & Commercial", count: 9 },
  { key: "postconstruction", name: "Post-Construction & Move-In", count: 8 },
  { key: "specialized", name: "Restaurant, Hospital, Warehouse", count: 9 },
  { key: "ac", name: "AC Maintenance & Duct Cleaning", count: 8 },
] as const;

export function buildHeartbeatCatalog(): HeartbeatItem[] {
  const items: HeartbeatItem[] = [];
  for (const g of HB_OFFER_GROUPS) {
    for (let i = 1; i <= g.count; i++) {
      const n = String(i).padStart(2, "0");
      const src = `/offers/${g.key}-${n}.png`;
      items.push({
        id: src,
        src,
        title: `${g.title} · ${n}`,
        badge: "Ad",
        group: "offer",
        groupKey: g.key,
      });
    }
  }
  for (const c of HB_PHOTO_CATEGORIES) {
    for (let i = 1; i <= c.count; i++) {
      const n = String(i).padStart(2, "0");
      const src = `/photos/${c.key}-${n}.png`;
      items.push({
        id: src,
        src,
        title: `${c.name} · ${n}`,
        badge: "Photo",
        group: "photo",
        groupKey: c.key,
      });
    }
  }
  return items;
}

const LS_BASE_URL = "heartbeat:baseUrl";

export function getHeartbeatBaseUrl(): string {
  if (typeof window === "undefined") return "";
  try {
    return (localStorage.getItem(LS_BASE_URL) ?? "").trim();
  } catch {
    return "";
  }
}

export function setHeartbeatBaseUrl(url: string) {
  const trimmed = url.trim().replace(/\/+$/, "");
  try {
    if (trimmed) localStorage.setItem(LS_BASE_URL, trimmed);
    else localStorage.removeItem(LS_BASE_URL);
  } catch {}
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("heartbeat-base-url-changed"));
  }
}

export function resolveHeartbeatUrl(baseUrl: string, src: string): string {
  const b = baseUrl.replace(/\/+$/, "");
  if (!b) return src;
  return `${b}${src.startsWith("/") ? "" : "/"}${src}`;
}

// Client-side URL validity check for the HeartBeat base URL.
export function validateHeartbeatBaseUrl(raw: string): { valid: boolean; message: string } {
  const value = raw.trim();
  if (!value) return { valid: false, message: "URL is required." };
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return { valid: false, message: "Not a valid URL. Include https://" };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return { valid: false, message: `Protocol must be http(s) (got ${u.protocol}).` };
  }
  if (!u.hostname.includes(".")) return { valid: false, message: "Host looks incomplete." };
  return { valid: true, message: "Looks good." };
}
