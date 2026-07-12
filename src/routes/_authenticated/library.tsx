import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MapPin, Tag as TagIcon } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { SignedImage } from "@/components/SignedImage";

export const Route = createFileRoute("/_authenticated/library")({
  component: LibraryPage,
});

async function fetchLibrary() {
  const { data: images, error } = await supabase
    .from("images")
    .select("id, name, storage_path, sharpness_score, venue_id, lat, lng, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const { data: venues } = await supabase.from("venues").select("id, name");
  const { data: tagRows } = await supabase
    .from("image_tags")
    .select("image_id, tag_id, tags(slug,label)");

  const venueMap = new Map(venues?.map((v) => [v.id, v.name]) ?? []);
  const tagMap = new Map<string, { slug: string; label: string }[]>();
  for (const row of tagRows ?? []) {
    const t = (row as { tags?: { slug: string; label: string } }).tags;
    if (!t) continue;
    const arr = tagMap.get(row.image_id) ?? [];
    arr.push(t);
    tagMap.set(row.image_id, arr);
  }
  return { images: images ?? [], venueMap, tagMap };
}

function LibraryPage() {
  const { data, isLoading } = useQuery({ queryKey: ["library"], queryFn: fetchLibrary });
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = filter.toLowerCase();
    return data.images.filter((i) => {
      if (!q) return true;
      if (i.name.toLowerCase().includes(q)) return true;
      const venue = i.venue_id ? data.venueMap.get(i.venue_id) : undefined;
      if (venue?.toLowerCase().includes(q)) return true;
      const tags = data.tagMap.get(i.id);
      if (tags?.some((t) => t.slug.includes(q) || t.label.toLowerCase().includes(q)))
        return true;
      return false;
    });
  }, [data, filter]);

  return (
    <div className="p-6 md:p-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl">Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data?.images.length ?? 0} extracted frames
          </p>
        </div>
        <input
          type="search"
          placeholder="Search name, tag, or venue"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-64 rounded-md border border-input bg-background/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {isLoading ? (
        <div className="mt-10 text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="mt-16 rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="text-muted-foreground">No frames yet.</p>
          <Link
            to="/upload"
            className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Upload a video
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((img) => {
            const tags = data!.tagMap.get(img.id) ?? [];
            const venue = img.venue_id ? data!.venueMap.get(img.venue_id) : null;
            return (
              <Link
                key={img.id}
                to="/library/$imageId"
                params={{ imageId: img.id }}
                className="group overflow-hidden rounded-xl border border-border bg-card transition hover:border-primary/50"
              >
                <div className="relative aspect-video overflow-hidden">
                  <SignedImage
                    bucket="frames"
                    path={img.storage_path}
                    alt={img.name}
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                </div>
                <div className="p-3">
                  <div className="truncate text-sm font-medium">{img.name}</div>
                  <div className="mt-2 flex flex-wrap gap-1 text-xs text-muted-foreground">
                    {venue && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                        <MapPin className="h-3 w-3" /> {venue}
                      </span>
                    )}
                    {tags.slice(0, 3).map((t) => (
                      <span
                        key={t.slug}
                        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"
                      >
                        <TagIcon className="h-3 w-3" />
                        {t.label}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
