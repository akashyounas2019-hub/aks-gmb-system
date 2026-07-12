import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  Send,
  Sparkles,
  Calendar,
  X,
  Loader2,
  ImageIcon,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { SignedImage } from "@/components/SignedImage";
import {
  LocationPicker,
  type PickedLocation,
} from "@/components/LocationPicker";
import {
  composePost,
  sendPostToSocialPlanner,
} from "@/lib/post-generator.functions";

export const Route = createFileRoute("/_authenticated/post-generator")({
  component: PostGeneratorPage,
});

type KeywordRow = {
  id: string;
  phrase: string;
  cluster: string | null;
  volume: number | null;
};
type ImageRow = { id: string; name: string; storage_path: string };

function PostGeneratorPage() {
  const compose = useServerFn(composePost);
  const send = useServerFn(sendPostToSocialPlanner);

  const [keywordsAll, setKeywordsAll] = useState<KeywordRow[]>([]);
  const [selectedKw, setSelectedKw] = useState<Set<string>>(new Set());
  const [kwFilter, setKwFilter] = useState("");

  const [images, setImages] = useState<ImageRow[]>([]);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());

  const [location, setLocation] = useState<PickedLocation | null>(null);
  const [language, setLanguage] = useState<"en" | "ar" | "both">("en");
  const [tone, setTone] = useState<
    "friendly" | "premium" | "urgent" | "informative"
  >("premium");
  const [businessName, setBusinessName] = useState("");
  const [cta, setCta] = useState("");
  const [ghlLocationId, setGhlLocationId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  const [caption, setCaption] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    supabase
      .from("keywords")
      .select("id,phrase,cluster,volume")
      .order("volume", { ascending: false, nullsFirst: false })
      .limit(500)
      .then(({ data }) => setKeywordsAll((data ?? []) as KeywordRow[]));
    supabase
      .from("images")
      .select("id,name,storage_path")
      .order("created_at", { ascending: false })
      .limit(48)
      .then(({ data }) => setImages((data ?? []) as ImageRow[]));
  }, []);

  const filteredKw = useMemo(() => {
    const q = kwFilter.trim().toLowerCase();
    if (!q) return keywordsAll.slice(0, 200);
    return keywordsAll.filter(
      (k) =>
        k.phrase.toLowerCase().includes(q) ||
        (k.cluster ?? "").toLowerCase().includes(q),
    );
  }, [kwFilter, keywordsAll]);

  const selectedKwPhrases = useMemo(
    () => keywordsAll.filter((k) => selectedKw.has(k.id)).map((k) => k.phrase),
    [keywordsAll, selectedKw],
  );

  function toggleKw(id: string) {
    setSelectedKw((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function toggleImage(id: string) {
    setSelectedImages((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else if (n.size < 4) n.add(id);
      else toast.info("Max 4 images per post");
      return n;
    });
  }

  async function handleGenerate() {
    if (!selectedKwPhrases.length) {
      toast.error("Pick at least one keyword");
      return;
    }
    setGenerating(true);
    try {
      const res = await compose({
        data: {
          keywords: selectedKwPhrases,
          imageIds: Array.from(selectedImages),
          locationLabel: location?.label,
          language,
          tone,
          businessName: businessName || undefined,
          callToAction: cta || undefined,
        },
      });
      setCaption(res.caption);
      toast.success("Draft generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSend() {
    if (!caption.trim()) {
      toast.error("Nothing to send");
      return;
    }
    setSending(true);
    try {
      const res = await send({
        data: {
          caption,
          imageIds: Array.from(selectedImages),
          locationLabel: location?.label,
          lat: location?.lat,
          lng: location?.lng,
          primaryKeyword: selectedKwPhrases[0],
          ghlLocationId: ghlLocationId || undefined,
          scheduledAt: scheduledAt
            ? new Date(scheduledAt).toISOString()
            : undefined,
          networks: ["gmb"],
        },
      });
      toast.success(
        res.status === "queued" ? "Scheduled in GHL Social Planner" : "Sent to GHL Social Planner",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  async function copyOut() {
    await navigator.clipboard.writeText(caption);
    toast.success("Copied");
  }

  return (
    <div className="w-full py-6 pl-6 md:py-10 md:pl-10" style={{ paddingRight: 50 }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">Post Generator</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick keywords + images + location, generate with AI, then push to
            GHL Social Planner.
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Left column — inputs */}
        <div className="space-y-6">
          {/* Keywords picker */}
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <KeyRound className="h-4 w-4 text-primary" /> Keywords
                <span className="text-xs text-muted-foreground">
                  ({selectedKw.size} selected)
                </span>
              </div>
              <input
                value={kwFilter}
                onChange={(e) => setKwFilter(e.target.value)}
                placeholder="Filter…"
                className="w-40 rounded border border-border bg-background px-2 py-1 text-xs outline-none"
              />
            </div>
            {keywordsAll.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                No keywords yet. Import a Semrush CSV in the Keywords tab.
              </div>
            ) : (
              <div className="flex max-h-52 flex-wrap gap-1.5 overflow-auto">
                {filteredKw.map((k) => {
                  const active = selectedKw.has(k.id);
                  return (
                    <button
                      key={k.id}
                      onClick={() => toggleKw(k.id)}
                      className={`rounded-full border px-2.5 py-1 text-xs ${
                        active
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      {k.phrase}
                      {k.volume ? (
                        <span className="ml-1 opacity-60">
                          · {k.volume.toLocaleString()}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Images picker */}
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <ImageIcon className="h-4 w-4 text-primary" /> Images
              <span className="text-xs text-muted-foreground">
                ({selectedImages.size}/4)
              </span>
            </div>
            {images.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                No images yet. Extract frames from a video first.
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {images.map((img) => {
                  const active = selectedImages.has(img.id);
                  return (
                    <button
                      key={img.id}
                      onClick={() => toggleImage(img.id)}
                      className={`relative overflow-hidden rounded-md border transition ${
                        active
                          ? "border-primary ring-2 ring-primary"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <SignedImage
                        bucket="frames"
                        path={img.storage_path}
                        alt={img.name}
                        className="aspect-square w-full object-cover"
                      />
                      {active && (
                        <div className="absolute right-1 top-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                          ✓
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Location */}
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 text-sm font-medium">Location</div>
            <LocationPicker value={location} onChange={setLocation} />
          </section>

          {/* Settings */}
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 text-sm font-medium">Voice</div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="block">
                <span className="text-xs text-muted-foreground">Language</span>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as any)}
                  className="mt-1 w-full rounded border border-border bg-background p-2 text-sm"
                >
                  <option value="en">English</option>
                  <option value="ar">Arabic (العربية)</option>
                  <option value="both">Both (EN + AR)</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">Tone</span>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value as any)}
                  className="mt-1 w-full rounded border border-border bg-background p-2 text-sm"
                >
                  <option value="premium">Premium</option>
                  <option value="friendly">Friendly</option>
                  <option value="urgent">Urgent</option>
                  <option value="informative">Informative</option>
                </select>
              </label>
              <label className="col-span-2 block">
                <span className="text-xs text-muted-foreground">
                  Business name (optional)
                </span>
                <input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Pearl Home Cleaning Dubai"
                  className="mt-1 w-full rounded border border-border bg-background p-2 text-sm"
                />
              </label>
              <label className="col-span-2 block">
                <span className="text-xs text-muted-foreground">
                  Call-to-action (optional)
                </span>
                <input
                  value={cta}
                  onChange={(e) => setCta(e.target.value)}
                  placeholder="e.g. Book on WhatsApp +971…"
                  className="mt-1 w-full rounded border border-border bg-background p-2 text-sm"
                />
              </label>
            </div>
          </section>

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {generating ? "Generating…" : "Generate with AI"}
          </button>
        </div>

        {/* Right column — output + send */}
        <div className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-medium">Caption</div>
              <button
                onClick={copyOut}
                disabled={!caption}
                className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-40"
              >
                <Copy className="h-3 w-3" /> Copy
              </button>
            </div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={16}
              dir={language === "ar" ? "rtl" : "ltr"}
              placeholder="Click Generate with AI to draft a post, then edit here."
              className="w-full rounded border border-border bg-background p-3 text-sm"
            />
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 text-sm font-medium">Publish</div>
            <div className="space-y-3 text-sm">
              <label className="block">
                <span className="text-xs text-muted-foreground">
                  GHL Location ID
                </span>
                <input
                  value={ghlLocationId}
                  onChange={(e) => setGhlLocationId(e.target.value)}
                  placeholder="e.g. abc123XYZ (from your GHL account)"
                  className="mt-1 w-full rounded border border-border bg-background p-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">
                  Schedule at (leave empty = send now)
                </span>
                <div className="mt-1 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="flex-1 rounded border border-border bg-background p-2 text-sm"
                  />
                  {scheduledAt && (
                    <button
                      onClick={() => setScheduledAt("")}
                      className="rounded p-1 text-muted-foreground hover:bg-accent"
                      aria-label="Clear"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </label>
              <button
                onClick={handleSend}
                disabled={sending || !caption.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {scheduledAt
                  ? "Schedule in GHL Social Planner"
                  : "Send to GHL Social Planner now"}
              </button>
              <p className="text-xs text-muted-foreground">
                Sends to your <code>N8N_WEBHOOK_URL</code> (falls back to{" "}
                <code>GHL_WEBHOOK_URL</code>). Configure your n8n workflow to
                receive this payload and post to GHL's{" "}
                <code>/social-media-posting/{"{locationId}"}/posts</code>.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
