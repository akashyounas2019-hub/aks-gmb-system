/** Approximate centre points for Dubai areas / communities. */
export const DUBAI_AREA_CENTERS: Record<string, { lat: number; lng: number }> = {
  "Abu Hail": { lat: 25.2857, lng: 55.3335 },
  "Al Barsha": { lat: 25.1041, lng: 55.1936 },
  "Al Barsha Heights": { lat: 25.0985, lng: 55.1758 },
  "Al Furjan": { lat: 25.0263, lng: 55.1442 },
  "Al Jadaf": { lat: 25.2246, lng: 55.3325 },
  "Al Khalil Gate": { lat: 25.1876, lng: 55.2622 },
  "Al Mamzar": { lat: 25.3007, lng: 55.3441 },
  "Al Nahda": { lat: 25.2939, lng: 55.3691 },
  "Al Qusais": { lat: 25.2867, lng: 55.3873 },
  "Al Rigga": { lat: 25.2646, lng: 55.3243 },
  "Al Warqa": { lat: 25.2062, lng: 55.3903 },
  "Al Wasl": { lat: 25.1963, lng: 55.2534 },
  Akoya: { lat: 24.9297, lng: 55.2611 },
  "Arabian Ranches": { lat: 25.0432, lng: 55.2703 },
  Arjaan: { lat: 25.0995, lng: 55.174 },
  Boulevard: { lat: 25.193, lng: 55.276 },
  "Burj Khalifa": { lat: 25.1972, lng: 55.2744 },
  "Business Bay": { lat: 25.1867, lng: 55.2704 },
  DIFC: { lat: 25.211, lng: 55.2796 },
  "Discovery Gardens": { lat: 25.043, lng: 55.1385 },
  "Dubai Downtown": { lat: 25.1934, lng: 55.2751 },
  "Dubai Falcon City": { lat: 25.1183, lng: 55.3216 },
  "Dubai Festival City": { lat: 25.2216, lng: 55.3536 },
  "Dubai Health Care City": { lat: 25.232, lng: 55.3234 },
  "Dubai Investment Park": { lat: 24.9857, lng: 55.177 },
  "Dubai Land": { lat: 25.1, lng: 55.32 },
  "Dubai Marina": { lat: 25.0805, lng: 55.1403 },
  "Emirates Hills": { lat: 25.0682, lng: 55.1657 },
  IMPZ: { lat: 25.0299, lng: 55.2088 },
  "International City": { lat: 25.1615, lng: 55.4098 },
  "Internet City": { lat: 25.0937, lng: 55.1626 },
  JLT: { lat: 25.0705, lng: 55.1443 },
  JVC: { lat: 25.0587, lng: 55.2094 },
  Jumeirah: { lat: 25.2048, lng: 55.2708 },
  "Jumeirah Beach Residence": { lat: 25.0784, lng: 55.1336 },
  "Jumeirah Park": { lat: 25.0447, lng: 55.1583 },
  "Layan Community": { lat: 25.064, lng: 55.317 },
  Meadows: { lat: 25.0575, lng: 55.1745 },
  Meydan: { lat: 25.1571, lng: 55.3006 },
  Mirdiff: { lat: 25.2168, lng: 55.4183 },
  "Mirdiff Hills": { lat: 25.211, lng: 55.4231 },
  "Motor City": { lat: 25.0475, lng: 55.2385 },
  Mudon: { lat: 25.0027, lng: 55.2646 },
  "Nad Al Hammar": { lat: 25.2166, lng: 55.367 },
  "Nad Al Sheba": { lat: 25.1567, lng: 55.32 },
  "Palm Jumeirah": { lat: 25.1124, lng: 55.139 },
  Rashidiya: { lat: 25.24, lng: 55.3897 },
  "Sheikh Zayed Road": { lat: 25.211, lng: 55.274 },
  "Sport City": { lat: 25.0388, lng: 55.2226 },
  "Studio City": { lat: 25.0342, lng: 55.2418 },
  "Umm Suqeim": { lat: 25.1413, lng: 55.1994 },
  "Uptown Mirdiff": { lat: 25.2247, lng: 55.4149 },
  Deira: { lat: 25.2701, lng: 55.316 },
};

/** Great-circle distance in km. */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Closest known Dubai area within maxKm of the point, or null. */
export function nearestDubaiArea(lat: number, lng: number, maxKm = 6): string | null {
  let best: { name: string; km: number } | null = null;
  for (const [name, c] of Object.entries(DUBAI_AREA_CENTERS)) {
    const km = haversineKm(lat, lng, c.lat, c.lng);
    if (!best || km < best.km) best = { name, km };
  }
  return best && best.km <= maxKm ? best.name : null;
}
