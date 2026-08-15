// Reads GPS coordinates embedded by phone cameras directly in a video file's
// container metadata — the same location data readGps() already reads from
// still-image EXIF, but for MP4/MOV/QuickTime video. Runs entirely in the
// browser; only reads box headers and the small metadata atom, never the
// full video, so it stays fast even on large files.
//
// Most phones write location as an ISO-6709 string inside a QuickTime
// "©xyz" user-data atom, e.g. "+25.2867+055.3873/" (lat, lng, optional alt).
// This does not cover every camera/app — if nothing is found, callers should
// fall back to the manual location picker exactly as before.

export type VideoGpsResult = {
  hasGps: boolean;
  lat: number | null;
  lng: number | null;
  reason?: string;
};

const NOT_FOUND: VideoGpsResult = {
  hasGps: false,
  lat: null,
  lng: null,
  reason: "No GPS atom found",
};

/** Parses an ISO-6709 location string like "+25.2867+055.3873/" or "+25.2867-055.3873+015.000/". */
function parseIso6709(s: string): { lat: number; lng: number } | null {
  // Matches two signed decimal numbers back-to-back (no separator between them, as ISO-6709 mandates).
  const m = s.match(/^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/**
 * Reads only the box headers of an MP4/MOV container to locate `moov`, then
 * `udta`, then a `©xyz` (or `xyz `) atom containing the ISO-6709 string.
 * Reads at most a few MB via `file.slice()` — never the whole file.
 */
export async function readVideoGps(file: File): Promise<VideoGpsResult> {
  try {
    // moov can appear late in some files (especially non-"fast start" exports),
    // so scan the whole file's box structure rather than assuming an offset —
    // but cap how much we actually read into memory at once.
    const MAX_SCAN_BYTES = 32 * 1024 * 1024; // 32MB ceiling across all box reads
    let scanned = 0;
    let offset = 0;
    const fileSize = file.size;

    async function readBoxHeader(
      pos: number,
    ): Promise<{ size: number; type: string; headerSize: number } | null> {
      if (pos + 8 > fileSize) return null;
      const buf = await file.slice(pos, pos + 16).arrayBuffer();
      const view = new DataView(buf);
      let size = view.getUint32(0);
      const type = String.fromCharCode(
        view.getUint8(4),
        view.getUint8(5),
        view.getUint8(6),
        view.getUint8(7),
      );
      let headerSize = 8;
      if (size === 1) {
        // 64-bit extended size
        const hi = view.getUint32(8);
        const lo = view.getUint32(12);
        size = hi * 2 ** 32 + lo;
        headerSize = 16;
      } else if (size === 0) {
        size = fileSize - pos; // box extends to EOF
      }
      return { size, type, headerSize };
    }

    // Walk top-level boxes to find `moov`.
    let moovStart = -1;
    let moovEnd = -1;
    while (offset < fileSize && scanned < MAX_SCAN_BYTES) {
      const box = await readBoxHeader(offset);
      if (!box || box.size <= 0) break;
      scanned += 16;
      if (box.type === "moov") {
        moovStart = offset + box.headerSize;
        moovEnd = offset + box.size;
        break;
      }
      offset += box.size;
    }
    if (moovStart < 0) return NOT_FOUND;

    // Walk inside `moov` to find `udta`.
    let udtaStart = -1;
    let udtaEnd = -1;
    let pos = moovStart;
    while (pos < moovEnd && scanned < MAX_SCAN_BYTES) {
      const box = await readBoxHeader(pos);
      if (!box || box.size <= 0) break;
      scanned += 16;
      if (box.type === "udta") {
        udtaStart = pos + box.headerSize;
        udtaEnd = pos + box.size;
        break;
      }
      pos += box.size;
    }
    if (udtaStart < 0) return NOT_FOUND;

    // Walk inside `udta` looking for a `©xyz` (QuickTime GPS) atom.
    pos = udtaStart;
    while (pos < udtaEnd && scanned < MAX_SCAN_BYTES) {
      const box = await readBoxHeader(pos);
      if (!box || box.size <= 0) break;
      scanned += 16;
      if (box.type === "©xyz" || box.type === "xyz ") {
        const dataStart = pos + box.headerSize;
        const dataLen = box.size - box.headerSize;
        if (dataLen <= 0 || dataLen > 256) return NOT_FOUND;
        const buf = await file.slice(dataStart, dataStart + dataLen).arrayBuffer();
        // QuickTime "©xyz" atoms are prefixed with a 2-byte length + 2-byte
        // language code before the actual ISO-6709 text.
        const bytes = new Uint8Array(buf);
        const text = new TextDecoder("utf-8", { fatal: false }).decode(
          bytes.length > 4 ? bytes.slice(4) : bytes,
        );
        const parsed = parseIso6709(text) ?? parseIso6709(new TextDecoder().decode(bytes));
        if (parsed) return { hasGps: true, lat: parsed.lat, lng: parsed.lng };
        return NOT_FOUND;
      }
      pos += box.size;
    }
    return NOT_FOUND;
  } catch (e) {
    return {
      hasGps: false,
      lat: null,
      lng: null,
      reason: e instanceof Error ? e.message : "Read failed",
    };
  }
}
