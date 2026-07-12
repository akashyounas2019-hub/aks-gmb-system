## Overview

Full-stack CMS on Lovable Cloud that lets users upload videos, extracts the sharpest frames in the browser with ffmpeg.wasm, and manages the resulting images with rename, tag, and Dubai-venue geotag controls. AI suggests tags from image content; venues come from a curated Dubai list backed by Google Maps Platform.

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                    │
│  ┌──────────────┐   ┌──────────────────┐   ┌────────────┐   │
│  │ Video upload │──▶│ ffmpeg.wasm       │──▶│ Sharpness │   │
│  │ (drag/drop)  │   │ extract N frames  │   │ score      │   │
│  └──────────────┘   └──────────────────┘   └─────┬──────┘   │
│                                                   │          │
│                              ┌────────────────────▼───────┐  │
│                              │ Upload top-K JPEGs to      │  │
│                              │ Storage; insert image rows │  │
│                              └────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
             │                                    │
             ▼                                    ▼
┌────────────────────────┐         ┌────────────────────────────┐
│ Lovable Cloud          │         │ Server functions           │
│ - Postgres (videos,    │◀────────│ - suggestTags(image)       │
│   images, tags,        │         │   Gemini vision via        │
│   image_tags, venues)  │         │   Lovable AI Gateway       │
│ - Storage: videos/     │         │ - seedVenuesFromGoogle()   │
│   frames buckets       │         │   Places API (New) via     │
│ - Auth (email/Google)  │         │   Google Maps connector    │
└────────────────────────┘         └────────────────────────────┘
```

## Tables (all with RLS, `auth.uid()` scoping)

- `videos` — id, owner_id, storage_path, duration, status, created_at
- `images` — id, owner_id, video_id, storage_path, name, sharpness_score, venue_id (nullable), lat, lng, created_at
- `tags` — id, slug, label, category (predefined starter set)
- `image_tags` — image_id, tag_id (join)
- `venues` — id, name, address, lat, lng, place_id, category (mall / hotel / landmark / restaurant / district), seeded with ~40 popular Dubai venues

## Buckets

- `videos` (private) — originals, only owner reads
- `frames` (private, signed URLs) — extracted JPEGs

## Pages

- `/` — landing (feature summary + CTA)
- `/auth` — email + Google sign-in
- `/_authenticated/upload` — drag-drop uploader, live progress: upload → extract → score → save
- `/_authenticated/library` — grid of images with filters (venue, tag, video), rename inline, multi-select bulk actions
- `/_authenticated/library/$imageId` — detail: full image, rename, tag chips with AI-suggested chips, venue picker (searchable dropdown of Dubai venues)
- `/_authenticated/videos` — list of uploaded videos with thumbnails and frame counts

## Frame-extraction algorithm (client)

1. Load video into `ffmpeg.wasm` (single-threaded build to avoid COOP/COEP requirements).
2. Sample every 1s (configurable). For each candidate: decode to canvas, compute Laplacian variance as sharpness score.
3. Cluster by time window (5s buckets); pick the single sharpest frame per bucket.
4. Cap at 20 frames per video by default; user can adjust in a settings panel.
5. Encode selected frames as JPEG (quality 0.92), upload to `frames` bucket, insert `images` rows with sharpness scores.

## AI tag suggestions

- Server fn `suggestTagsForImage({ imageId })` — signs a short-lived URL, sends the image to `google/gemini-3-flash-preview` via Lovable AI Gateway with a structured-output prompt: "Pick 3–6 tags from this list that describe the image: [predefined tag list]". Returns tag slugs; UI shows them as suggested chips the user can accept.
- Predefined tag list (seeded): architecture, skyline, interior, exterior, food, people, night, day, luxury, beach, desert, marina, souq, fountain, gold, art, event, sports, aerial.

## Venue seed + geotag

- On first admin visit, `seedDubaiVenues()` server fn runs once: calls Google Places (New) `places:searchText` through the connector gateway for each seed query ("Dubai Mall", "Burj Khalifa", "Palm Jumeirah", …) and upserts into `venues`.
- Library UI has a "Set venue" combobox per image (or bulk-selected). Selecting a venue copies its lat/lng onto the image row. That's the geotag.
- Optional export: a "Download tagged JPEG" action calls a client-side EXIF writer (piexifjs) to embed GPS tags into the JPEG before download — no server needed.

## Connectors used

- **Google Maps Platform** — Places API (New) via `places/v1/places:searchText` for the venue seeder. Uses Lovable's managed key (free on `*.lovable.app`).

## Cost summary

| Item | Cost |
|---|---|
| Cloud (DB + storage + auth) | Free tier |
| AI Gateway (Gemini 3 Flash for tags) | Metered; ~$0 at low volume |
| Google Maps (Places New) | Free through managed connector on `*.lovable.app`. Custom domain = user's own Google key ($200/mo free credit) |
| ffmpeg.wasm | $0, runs in browser |

## What I'll build in the first pass

1. Enable Lovable Cloud; set up auth (email + Google).
2. Create schema (`videos`, `images`, `tags`, `image_tags`, `venues`) + RLS + GRANTs; seed tag list.
3. Storage buckets + policies.
4. Google Maps connector link + venue seeder server fn (runs once, upserts ~40 Dubai venues).
5. Uploader page with ffmpeg.wasm pipeline (extract → score → upload → insert).
6. Library page (grid, filters, rename, tag, venue picker) + detail view with AI-suggested tags.
7. Design system: dark theme evoking Dubai skyline (deep navy + gold accent), Inter for UI, custom display font for hero.

## Out of scope for the first pass (call out if desired)

- Server-side ffmpeg (would need external worker — separate discussion).
- EXIF GPS-embedded downloads (small addition; ship after core CMS is working).
- Sharing / public gallery links.
- Bulk CSV import of venues.

Ready to build once you confirm.