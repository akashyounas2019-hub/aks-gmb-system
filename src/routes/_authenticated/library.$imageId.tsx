import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Sparkles, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { SignedImage } from "@/components/SignedImage";
import { GeoTaggedBadge } from "@/components/GeoTaggedBadge";
import { suggestTagsForImage } from "@/lib/ai.functions";

export const Route = createFileRoute("/_authenticated/library/$imageId")({
  component: ImageDetail,
});

async function fetchImage(imageId: string) {
  const { data: image, error } = await supabase
    .from("images")
    .select(
      "id, name, storage_path, sharpness_score, timestamp_seconds, venue_id, lat, lng, video_id",
    )
    .eq("id", imageId)
    .single();
  if (error) throw error;

  const [{ data: tags }, { data: imageTags }, { data: venues }] = await Promise.all([
    supabase.from("tags").select("id, slug, label, category").order("label"),
    supabase.from("image_tags").select("tag_id").eq("image_id", imageId),
    supabase.from("venues").select("id, name, category, lat, lng").order("name"),
  ]);

  return {
    image,
    allTags: tags ?? [],
    selectedTagIds: new Set(imageTags?.map((t) => t.tag_id) ?? []),
    venues: venues ?? [],
  };
}

function ImageDetail() {
  const { imageId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["image", imageId],
    queryFn: () => fetchImage(imageId),
  });
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const suggestFn = useServerFn(suggestTagsForImage);

  if (isLoading || !data) {
    return <div className="p-10 text-muted-foreground">Loading…</div>;
  }
  const { image, allTags, selectedTagIds, venues } = data;

  async function rename(name: string) {
    const { error } = await supabase.from("images").update({ name }).eq("id", imageId);
    if (error) toast.error(error.message);
    else {
      qc.invalidateQueries({ queryKey: ["image", imageId] });
      qc.invalidateQueries({ queryKey: ["library"] });
    }
  }

  async function toggleTag(tagId: string, on: boolean) {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user!.id;
    if (on) {
      const { error } = await supabase
        .from("image_tags")
        .insert({ image_id: imageId, tag_id: tagId, owner_id: userId });
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase
        .from("image_tags")
        .delete()
        .eq("image_id", imageId)
        .eq("tag_id", tagId);
      if (error) return toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ["image", imageId] });
    qc.invalidateQueries({ queryKey: ["library"] });
  }

  async function setVenue(venueId: string) {
    const v = venues.find((x) => x.id === venueId);
    const { error } = await supabase
      .from("images")
      .update({
        venue_id: venueId || null,
        lat: v?.lat ?? null,
        lng: v?.lng ?? null,
      })
      .eq("id", imageId);
    if (error) return toast.error(error.message);
    toast.success(v ? `Geotagged to ${v.name}` : "Venue cleared");
    qc.invalidateQueries({ queryKey: ["image", imageId] });
    qc.invalidateQueries({ queryKey: ["library"] });
  }

  async function runSuggest() {
    setSuggesting(true);
    try {
      const res = await suggestFn({ data: { imageId } });
      setSuggestions(res.slugs);
      if (res.slugs.length === 0) toast.info("No confident tag suggestions.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Suggestion failed");
    } finally {
      setSuggesting(false);
    }
  }

  async function removeImage() {
    if (!confirm("Delete this image?")) return;
    await supabase.storage.from("frames").remove([image.storage_path]);
    await supabase.from("images").delete().eq("id", imageId);
    toast.success("Deleted");
    navigate({ to: "/library" });
  }

  async function acceptSuggestion(slug: string) {
    const tag = allTags.find((t) => t.slug === slug);
    if (!tag) return;
    await toggleTag(tag.id, true);
    setSuggestions((s) => s.filter((x) => x !== slug));
  }

  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      <Link
        to="/library"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to library
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
          <SignedImage
            bucket="frames"
            path={image.storage_path}
            alt={image.name}
            className="w-full object-contain"
          />
          {image.lat != null && image.lng != null && (
            <div className="absolute left-3 top-3">
              <GeoTaggedBadge lat={Number(image.lat)} lng={Number(image.lng)} />
            </div>
          )}
        </div>


        <div className="space-y-6">
          <section>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">
              Name
            </label>
            <input
              defaultValue={image.name}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== image.name)
                  rename(e.target.value.trim());
              }}
              className="mt-2 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Sharpness score: {Number(image.sharpness_score).toFixed(1)} · at{" "}
              {Number(image.timestamp_seconds ?? 0).toFixed(1)}s
            </p>
          </section>

          <section>
            <div className="flex items-center justify-between">
              <label className="text-xs uppercase tracking-widest text-muted-foreground">
                Venue (Dubai)
              </label>
              {image.venue_id && (
                <button
                  onClick={() => setVenue("")}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Clear
                </button>
              )}
            </div>
            <select
              value={image.venue_id ?? ""}
              onChange={(e) => setVenue(e.target.value)}
              className="mt-2 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">— No venue —</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <input
                type="number"
                step="any"
                placeholder="Latitude"
                defaultValue={image.lat ?? ""}
                onBlur={async (e) => {
                  const lat = e.target.value ? Number(e.target.value) : null;
                  await supabase.from("images").update({ lat }).eq("id", imageId);
                  qc.invalidateQueries({ queryKey: ["image", imageId] });
                }}
                className="rounded-md border border-input bg-background/50 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                type="number"
                step="any"
                placeholder="Longitude"
                defaultValue={image.lng ?? ""}
                onBlur={async (e) => {
                  const lng = e.target.value ? Number(e.target.value) : null;
                  await supabase.from("images").update({ lng }).eq("id", imageId);
                  qc.invalidateQueries({ queryKey: ["image", imageId] });
                }}
                className="rounded-md border border-input bg-background/50 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {image.lat && image.lng && (
              <div className="mt-3 space-y-2">
                <p className="flex items-center gap-1 text-xs text-primary">
                  <MapPin className="h-3 w-3" />
                  {Number(image.lat).toFixed(5)}, {Number(image.lng).toFixed(5)}
                </p>
                <div className="overflow-hidden rounded-md border border-border">
                  <iframe
                    title="Geotag map"
                    className="h-48 w-full"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(image.lng) - 0.005},${Number(image.lat) - 0.003},${Number(image.lng) + 0.005},${Number(image.lat) + 0.003}&layer=mapnik&marker=${image.lat},${image.lng}`}
                  />
                </div>
                <a
                  href={`https://www.google.com/maps?q=${image.lat},${image.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  Open in Google Maps →
                </a>
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between">
              <label className="text-xs uppercase tracking-widest text-muted-foreground">
                Tags
              </label>
              <button
                onClick={runSuggest}
                disabled={suggesting}
                className="inline-flex items-center gap-1 rounded-md border border-primary/50 bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20 disabled:opacity-50"
              >
                <Sparkles className="h-3 w-3" />
                {suggesting ? "Thinking…" : "Suggest with AI"}
              </button>
            </div>

            {suggestions.length > 0 && (
              <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3">
                <div className="text-xs text-muted-foreground">Suggestions:</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {suggestions.map((s) => {
                    const t = allTags.find((t) => t.slug === s);
                    return (
                      <button
                        key={s}
                        onClick={() => acceptSuggestion(s)}
                        className="rounded-full bg-primary/20 px-3 py-1 text-xs text-primary hover:bg-primary/30"
                      >
                        + {t?.label ?? s}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-1.5">
              {allTags.map((t) => {
                const on = selectedTagIds.has(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleTag(t.id, !on)}
                    className={`rounded-full px-3 py-1 text-xs transition ${
                      on
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </section>

          <button
            onClick={removeImage}
            className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
          >
            <Trash2 className="h-3 w-3" /> Delete image
          </button>
        </div>
      </div>
    </div>
  );
}
