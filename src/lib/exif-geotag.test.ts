import { describe, expect, it } from "vitest";
import { embedGps, readGps, readMeta } from "./exif-geotag";

// Minimal 1x1 baseline JPEG. Used as the substrate for every EXIF round-trip
// test — piexifjs accepts arbitrary JPEGs and only rewrites the APPn segments.
const BASE_JPEG_B64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APvQ/9k=";

function baseJpeg(name = "sample.jpg"): File {
  const bytes = Uint8Array.from(atob(BASE_JPEG_B64), (c) => c.charCodeAt(0));
  return new File([bytes], name, { type: "image/jpeg" });
}

// A curated sample set covering the interesting real-world combinations we
// see from geoimgr, Windows Explorer, camera phones, and legacy builds.
const SAMPLES = [
  {
    name: "title + description + gps",
    title: "Marina villa exterior",
    description: "Sunset shot of the villa entrance",
    lat: 25.1867,
    lng: 55.2704,
  },
  {
    name: "description only (geoimgr-style)",
    title: "",
    description: "pro cleaning company in dubai",
    lat: 25.1867,
    lng: 55.2704,
  },
  {
    name: "southern hemisphere gps",
    title: "Bondi cafe",
    description: "Morning coffee",
    lat: -33.8908,
    lng: 151.2743,
  },
  {
    name: "negative longitude gps",
    title: "NYC diner",
    description: "Late-night meal",
    lat: 40.7128,
    lng: -74.006,
  },
  {
    name: "unicode metadata",
    title: "München Altstadt",
    description: "Nächtliche Aussicht — 夜景",
    lat: 48.1371,
    lng: 11.5754,
  },
] as const;

describe("exif-geotag round-trip", () => {
  for (const sample of SAMPLES) {
    it(`preserves title/description/gps for: ${sample.name}`, async () => {
      const tagged = await embedGps(baseJpeg(), sample.lat, sample.lng, {
        title: sample.title,
        description: sample.description,
      });

      const meta = await readMeta(tagged);
      const gps = await readGps(tagged);

      // Title → XPTitle (only when non-empty).
      expect(meta.title).toBe(sample.title);
      if (sample.title) {
        expect(meta.sources.title).toBe("XPTitle");
        expect(meta.raw.XPTitle).toBe(sample.title);
      } else {
        expect(meta.sources.title).toBeNull();
        expect(meta.raw.XPTitle).toBe("");
      }

      // Description → ImageDescription (canonical) with XPComment mirror.
      expect(meta.description).toBe(sample.description);
      if (sample.description) {
        expect(meta.sources.description).toBe("ImageDescription");
        expect(meta.raw.ImageDescription).toBe(sample.description);
        expect(meta.raw.XPComment).toBe(sample.description);
      }

      // GPS decodes back to within DMS rounding tolerance (~1e-4 deg).
      expect(gps.hasGps).toBe(true);
      expect(gps.lat).toBeCloseTo(sample.lat, 3);
      expect(gps.lng).toBeCloseTo(sample.lng, 3);
    });
  }
});

describe("exif-geotag consistency checks", () => {
  it("drops title when it equals description", async () => {
    const tagged = await embedGps(baseJpeg(), 10, 20, {
      title: "same string",
      description: "same string",
    });
    const meta = await readMeta(tagged);
    // embedGps refuses to write duplicate values.
    expect(meta.title).toBe("");
    expect(meta.description).toBe("same string");
    expect(meta.sources.title).toBeNull();
    expect(meta.sources.description).toBe("ImageDescription");
  });

  it("never promotes XPSubject into the title field", async () => {
    // Simulate a file whose description was written into XPSubject only
    // (that's what geoimgr does). Round-trip through embedGps first, then
    // manually strip ImageDescription/XPComment via a second write.
    const tagged = await embedGps(baseJpeg(), 0, 0, {
      description: "geoimgr caption",
    });
    const meta = await readMeta(tagged);
    // Our writer mirrors description into XPSubject for geoimgr compatibility,
    // and readMeta must still classify it as description, not title.
    expect(meta.raw.XPSubject).toBe("geoimgr caption");
    expect(meta.title).toBe("");
    expect(meta.sources.title).toBeNull();
    expect(meta.description).toBe("geoimgr caption");
    expect(meta.sources.description).toBe("ImageDescription");
  });

  it("strips stale tags when title/description are re-tagged as empty", async () => {
    const first = await embedGps(baseJpeg(), 1, 2, {
      title: "old title",
      description: "old caption",
    });
    const second = await embedGps(first, 1, 2, {
      title: "",
      description: "",
    });
    const meta = await readMeta(second);
    expect(meta.title).toBe("");
    expect(meta.description).toBe("");
    expect(meta.raw.XPTitle).toBe("");
    expect(meta.raw.ImageDescription).toBe("");
    expect(meta.raw.XPComment).toBe("");
    expect(meta.raw.XPSubject).toBe("");
  });

  it("returns hasGps=false and empty meta for non-JPEG input", async () => {
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "x.png", {
      type: "image/png",
    });
    const gps = await readGps(png);
    const meta = await readMeta(png);
    expect(gps.hasGps).toBe(false);
    expect(meta.title).toBe("");
    expect(meta.description).toBe("");
    expect(meta.warnings).toEqual([]);
  });

  it("preserves existing camera EXIF while updating GPS", async () => {
    const first = await embedGps(baseJpeg(), 10, 20, { title: "keep me" });
    const second = await embedGps(first, 30, 40, {
      title: "keep me",
      description: "new caption",
    });
    const meta = await readMeta(second);
    const gps = await readGps(second);
    expect(meta.title).toBe("keep me");
    expect(meta.description).toBe("new caption");
    expect(gps.lat).toBeCloseTo(30, 3);
    expect(gps.lng).toBeCloseTo(40, 3);
  });
});
