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
    let existing: { "0th"?: Record<number, unknown>; Exif?: Record<number, unknown> } & Record<
      string,
      unknown
    > = {};
    try {
      existing = piexif.load(dataUrl) as typeof existing;
    } catch {
      existing = {};
    }
    const zeroth: Record<number, unknown> = { ...(existing["0th"] ?? {}) };
    const exifIfd: Record<number, unknown> = { ...(existing.Exif ?? {}) };

    let title = meta.title?.trim() ?? "";
    const description = meta.description?.trim() ?? "";
    const keywords = (meta.keywords ?? []).map((k) => k.trim()).filter((k) => k.length > 0);

    // Write-side consistency check: refuse to persist a title that equals the
    // description. Description wins because it is what geoimgr/Windows/
    // Lightroom surface as the caption; keeping both would create the same
    // ambiguity that readMeta has to unwind on the next round-trip.
    if (title && description && title === description) {
      title = "";
    }

    if (title) {
      // Windows-aware title tag (what File Explorer / geoimgr call "Title").
      // NEVER also write XPSubject — geoimgr and some readers surface
      // XPSubject as the Description, which would clobber the real
      // description with the title.
      zeroth[piexif.ImageIFD.XPTitle] = toXpBytes(title);
    } else {
      // No title provided — actively strip any stale XPTitle from the source
      // file so a re-tag can never leave an outdated title behind.
      delete zeroth[piexif.ImageIFD.XPTitle];
    }
    if (description) {
      // Standard EXIF "ImageDescription" is what geoimgr and most readers
      // surface as the Description field. Keep this reserved for the
      // description — never overload it with the title.
      zeroth[piexif.ImageIFD.ImageDescription] = description;
      zeroth[piexif.ImageIFD.XPComment] = toXpBytes(description);
      // Some readers surface XPSubject as description; keep it in sync so
      // description stays consistent across every viewer.
      zeroth[0x9c9f] = toXpBytes(description);
      // UserComment is prefixed with an 8-byte character-code header.
      const prefix = [0x55, 0x4e, 0x49, 0x43, 0x4f, 0x44, 0x45, 0x00]; // "UNICODE\0"
      const body: number[] = [];
      for (const ch of description) {
        const code = ch.charCodeAt(0);
        body.push(code & 0xff, (code >> 8) & 0xff);
      }
      exifIfd[piexif.ExifIFD.UserComment] = [...prefix, ...body];
    } else {
      // No description provided — strip stale description-family tags so a
      // re-tag can't leave an outdated caption behind or let an old value
      // bleed back into the title on the next read.
      delete zeroth[piexif.ImageIFD.ImageDescription];
      delete zeroth[piexif.ImageIFD.XPComment];
      delete zeroth[0x9c9f];
      delete exifIfd[piexif.ExifIFD.UserComment];
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
      [[number, number], [number, number], [number, number]] | undefined;
    const lng = gps[piexif.GPSIFD.GPSLongitude] as
      [[number, number], [number, number], [number, number]] | undefined;
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

/**
 * Decode a Windows XP* UTF-16LE byte array (XPTitle/XPComment/XPKeywords/XPSubject)
 * back to a JS string. Accepts number[], Uint8Array, or an already-decoded string.
 */
function fromXpBytes(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  const bytes = Array.isArray(raw) ? (raw as number[]) : Array.from(raw as ArrayLike<number>);
  const out: string[] = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = bytes[i] | (bytes[i + 1] << 8);
    if (code === 0) break;
    out.push(String.fromCharCode(code));
  }
  return out.join("");
}

export type ExifMetaSource =
  "XPTitle" | "ImageDescription" | "XPComment" | "XPSubject" | "XPKeywords" | "UserComment" | null;

export type ExifMetaResult = {
  title: string;
  description: string;
  keywords: string[];
  /** Which EXIF tag each field was read from (null when field is empty). */
  sources: {
    title: ExifMetaSource;
    description: ExifMetaSource;
    keywords: ExifMetaSource;
  };
  /** Raw per-tag values, so the UI can show alternatives when remapping. */
  raw: {
    XPTitle: string;
    ImageDescription: string;
    XPComment: string;
    XPSubject: string;
    XPKeywords: string;
    UserComment: string;
  };
  /** Diagnostic notes from the consistency check. */
  warnings: string[];
};

/**
 * Decode a UserComment byte array. The tag has an 8-byte character-code
 * prefix (ASCII "ASCII\0\0\0", "UNICODE\0", "JIS\0\0\0\0\0", or all-zero
 * for undefined). Only ASCII and UNICODE (UTF-16LE) are common in the wild.
 */
function fromUserComment(raw: unknown): string {
  if (raw == null) return "";
  const bytes = Array.isArray(raw)
    ? (raw as number[])
    : typeof raw === "string"
      ? Array.from(raw, (c) => c.charCodeAt(0))
      : Array.from(raw as ArrayLike<number>);
  if (bytes.length <= 8) return "";
  const prefix = String.fromCharCode(...bytes.slice(0, 8));
  const body = bytes.slice(8);
  if (prefix.startsWith("UNICODE")) {
    const out: string[] = [];
    for (let i = 0; i + 1 < body.length; i += 2) {
      const code = body[i] | (body[i + 1] << 8);
      if (code === 0) break;
      out.push(String.fromCharCode(code));
    }
    return out.join("").trim();
  }
  if (prefix.startsWith("ASCII")) {
    return String.fromCharCode(...body)
      .replace(/\0+$/g, "")
      .trim();
  }
  // Undefined / JIS — best-effort: try ASCII interpretation of printable bytes.
  const ascii = body.filter((b) => b >= 0x20 && b < 0x7f);
  return ascii.length > body.length / 2 ? String.fromCharCode(...ascii).trim() : "";
}

function splitKeywordString(s: string): string[] {
  return s
    .split(/;\s*|,\s*/)
    .map((k) => k.trim())
    .filter(Boolean);
}

/**
 * Read title/description/keywords from a JPEG with source tracking.
 * Canonical mapping: title←XPTitle, description←ImageDescription→XPComment→XPSubject.
 * See consistency rules in comments below.
 */
export async function readMeta(file: File | Blob): Promise<ExifMetaResult> {
  const empty: ExifMetaResult = {
    title: "",
    description: "",
    keywords: [],
    sources: { title: null, description: null, keywords: null },
    raw: {
      XPTitle: "",
      ImageDescription: "",
      XPComment: "",
      XPSubject: "",
      XPKeywords: "",
      UserComment: "",
    },
    warnings: [],
  };
  if (!isJpeg(file)) return empty;
  try {
    const dataUrl = await fileToDataUrl(file);
    const exif = piexif.load(dataUrl) as {
      "0th"?: Record<number, unknown>;
      Exif?: Record<number, unknown>;
    };
    const zeroth = exif["0th"] ?? {};
    const exifIfd = exif.Exif ?? {};
    const XPSubjectTag = 0x9c9f;

    const XPTitle = fromXpBytes(zeroth[piexif.ImageIFD.XPTitle]).trim();
    const imgDescRaw = zeroth[piexif.ImageIFD.ImageDescription];
    const ImageDescription = typeof imgDescRaw === "string" ? imgDescRaw.trim() : "";
    const XPComment = fromXpBytes(zeroth[piexif.ImageIFD.XPComment]).trim();
    const XPSubject = fromXpBytes(zeroth[XPSubjectTag]).trim();
    const XPKeywords = fromXpBytes(zeroth[piexif.ImageIFD.XPKeywords]).trim();
    const UserComment = fromUserComment(exifIfd[piexif.ExifIFD.UserComment]);

    const raw = { XPTitle, ImageDescription, XPComment, XPSubject, XPKeywords, UserComment };

    let title = XPTitle;
    let titleSource: ExifMetaSource = XPTitle ? "XPTitle" : null;

    let description = "";
    let descriptionSource: ExifMetaSource = null;
    if (ImageDescription) {
      description = ImageDescription;
      descriptionSource = "ImageDescription";
    } else if (XPComment) {
      description = XPComment;
      descriptionSource = "XPComment";
    }

    const warnings: string[] = [];

    // Rule 1: XPSubject is a description tag in geoimgr / Windows.
    if (!description && XPSubject) {
      description = XPSubject;
      descriptionSource = "XPSubject";
      warnings.push(
        "Description recovered from XPSubject (no ImageDescription/XPComment present).",
      );
    }

    // Rule 2: never let the same string live in both fields.
    if (title && description && title === description) {
      title = "";
      titleSource = null;
      warnings.push("Title and description held the same value; kept it as description only.");
    }

    // Rule 3: never promote XPSubject into title.
    if (!title && XPSubject && XPSubject !== description) {
      warnings.push(
        "Text found in XPSubject but no XPTitle — left title blank to avoid mislabelling a description as a title.",
      );
    }

    // Keywords: XPKeywords is canonical. Fall back to UserComment if it looks
    // like a delimited list (multiple items separated by ; or ,) and isn't
    // just the description echoed back.
    let keywords: string[] = [];
    let keywordsSource: ExifMetaSource = null;
    if (XPKeywords) {
      keywords = splitKeywordString(XPKeywords);
      if (keywords.length > 0) keywordsSource = "XPKeywords";
    }
    if (keywords.length === 0 && UserComment) {
      const uc = splitKeywordString(UserComment);
      const looksLikeList = uc.length > 1 && UserComment !== description;
      if (looksLikeList) {
        keywords = uc;
        keywordsSource = "UserComment";
        warnings.push("Keywords recovered from UserComment (no XPKeywords present).");
      }
    }

    return {
      title,
      description,
      keywords,
      sources: { title: titleSource, description: descriptionSource, keywords: keywordsSource },
      raw,
      warnings,
    };
  } catch {
    return empty;
  }
}
