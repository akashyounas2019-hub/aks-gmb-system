// Browser-safe EXIF GPS helpers using piexifjs.
// piexifjs operates on JPEG "binary strings" (each byte as a char code).
// PNG/WEBP do NOT have a standardised EXIF GPS block that consumer viewers
// respect, so we only embed for JPEG. For other formats we fall back to the
// original file — the DB row still records lat/lng, but third-party viewers
// will report "no GPS" until the user re-exports the image as JPEG.

import piexif from "piexifjs";

export type GpsReadResult = {
  hasGps: boolean;
  lat: number | null;
  lng: number | null;
  format: string;
  reason?: string;
};

function isJpeg(file: File | Blob): boolean {
  const t = (file as File).type || "";
  return t === "image/jpeg" || t === "image/jpg";
}

function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl: string, mime: string): Blob {
  const [, b64] = dataUrl.split(",");
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// Convert signed decimal degrees to piexif rational triple [deg, min, sec].
function toDmsRational(deg: number): [[number, number], [number, number], [number, number]] {
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const minFloat = (abs - d) * 60;
  const m = Math.floor(minFloat);
  const s = Math.round((minFloat - m) * 60 * 10000);
  return [
    [d, 1],
    [m, 1],
    [s, 10000],
  ];
}

function rationalToDeg(
  dms: [[number, number], [number, number], [number, number]],
  ref: string,
): number {
  const d = dms[0][0] / dms[0][1];
  const m = dms[1][0] / dms[1][1];
  const s = dms[2][0] / dms[2][1];
  const val = d + m / 60 + s / 3600;
  return ref === "S" || ref === "W" ? -val : val;
}

/**
 * Windows XP EXIF tags (XPTitle/XPComment/XPKeywords) are stored as
 * UTF-16LE byte arrays with a trailing null terminator. This is the format
 * geoimager2.geoimager.com and most Windows-aware EXIF readers expect.
 */
function toXpBytes(value: string): number[] {
  const bytes: number[] = [];
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    bytes.push(code & 0xff, (code >> 8) & 0xff);
  }
  bytes.push(0, 0);
  return bytes;
}

export interface ImageMetadata {
  title?: string | null;
  description?: string | null;
  keywords?: string[] | null;
}

/**
 * Return a new File with GPS EXIF plus optional title/description/keywords
 * embedded. Non-JPEG inputs are returned unchanged (piexif cannot write
 * PNG/WEBP EXIF reliably). Metadata is written into both the standard
 * ImageDescription tag AND the Windows XPTitle/XPComment/XPKeywords tags so
 * platforms like geoimager2.geoimager.com pick them up.
 */
export async function embedGps(
  file: File,
  lat: number,
  lng: number,
  meta: ImageMetadata = {},
): Promise<File> {
  if (!isJpeg(file)) return file;
  try {
    const dataUrl = await fileToDataUrl(file);
    const latRef = lat >= 0 ? "N" : "S";
    const lngRef = lng >= 0 ? "E" : "W";
    const gps: Record<number, unknown> = {
      [piexif.GPSIFD.GPSVersionID]: [2, 3, 0, 0],
      [piexif.GPSIFD.GPSLatitudeRef]: latRef,
      [piexif.GPSIFD.GPSLatitude]: toDmsRational(lat),
      [piexif.GPSIFD.GPSLongitudeRef]: lngRef,
      [piexif.GPSIFD.GPSLongitude]: toDmsRational(lng),
      [piexif.GPSIFD.GPSMapDatum]: "WGS-84",
      [piexif.GPSIFD.GPSDateStamp]: new Date().toISOString().slice(0, 10).replace(/-/g, ":"),
    };
    // Preserve any existing EXIF (camera, dates, etc.) and replace GPS block.
    let existing: { "0th"?: Record<number, unknown>; Exif?: Record<number, unknown> } & Record<string, unknown> = {};
    try {
      existing = piexif.load(dataUrl) as typeof existing;
    } catch {
      existing = {};
    }
    const zeroth: Record<number, unknown> = { ...(existing["0th"] ?? {}) };
    const exifIfd: Record<number, unknown> = { ...(existing.Exif ?? {}) };

    const title = meta.title?.trim();
    const description = meta.description?.trim();
    const keywords = (meta.keywords ?? [])
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    if (title) {
      zeroth[piexif.ImageIFD.XPTitle] = toXpBytes(title);
      // ImageDescription is ASCII-only per EXIF spec; piexif tolerates UTF-8
      // bytes but non-ASCII may render as garbled in strict readers. We still
      // write it since geoimager2 reads this field.
      zeroth[piexif.ImageIFD.ImageDescription] = title;
    }
    if (description) {
      zeroth[piexif.ImageIFD.XPComment] = toXpBytes(description);
      // UserComment is prefixed with an 8-byte character-code header.
      const prefix = [0x55, 0x4e, 0x49, 0x43, 0x4f, 0x44, 0x45, 0x00]; // "UNICODE\0"
      const body: number[] = [];
      for (const ch of description) {
        const code = ch.charCodeAt(0);
        body.push(code & 0xff, (code >> 8) & 0xff);
      }
      exifIfd[piexif.ExifIFD.UserComment] = [...prefix, ...body];
    }
    if (keywords.length > 0) {
      // Windows convention: keywords joined by "; ".
      zeroth[piexif.ImageIFD.XPKeywords] = toXpBytes(keywords.join("; "));
    }

    const exifObj: Record<string, unknown> = {
      ...existing,
      "0th": zeroth,
      Exif: exifIfd,
      GPS: gps,
    };
    const exifBytes = piexif.dump(exifObj);
    const newDataUrl = piexif.insert(exifBytes, dataUrl);
    const blob = dataUrlToBlob(newDataUrl, "image/jpeg");
    return new File([blob], file.name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    // If anything goes wrong we return the original file rather than block the upload.
    return file;
  }
}

/**
 * Read GPS EXIF from a JPEG. Returns hasGps=false for non-JPEG or when
 * the file has no GPS block.
 */
export async function readGps(file: File | Blob): Promise<GpsReadResult> {
  const format = (file as File).type || "unknown";
  if (!isJpeg(file)) {
    return {
      hasGps: false,
      lat: null,
      lng: null,
      format,
      reason: "GPS EXIF is only reliable in JPEG. This file is " + (format || "not a JPEG") + ".",
    };
  }
  try {
    const dataUrl = await fileToDataUrl(file);
    const exif = piexif.load(dataUrl) as { GPS?: Record<number, unknown> };
    const gps = exif.GPS ?? {};
    const lat = gps[piexif.GPSIFD.GPSLatitude] as
      | [[number, number], [number, number], [number, number]]
      | undefined;
    const lng = gps[piexif.GPSIFD.GPSLongitude] as
      | [[number, number], [number, number], [number, number]]
      | undefined;
    const latRef = gps[piexif.GPSIFD.GPSLatitudeRef] as string | undefined;
    const lngRef = gps[piexif.GPSIFD.GPSLongitudeRef] as string | undefined;
    if (!lat || !lng || !latRef || !lngRef) {
      return { hasGps: false, lat: null, lng: null, format, reason: "No GPS EXIF block found." };
    }
    return {
      hasGps: true,
      lat: rationalToDeg(lat, latRef),
      lng: rationalToDeg(lng, lngRef),
      format,
    };
  } catch (e) {
    return {
      hasGps: false,
      lat: null,
      lng: null,
      format,
      reason: e instanceof Error ? e.message : "EXIF read failed",
    };
  }
}
