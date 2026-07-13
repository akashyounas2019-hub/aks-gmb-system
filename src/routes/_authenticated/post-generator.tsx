import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  Send,
  Sparkles,
  Calendar,
  X,
  Loader2,
  ImageIcon,
  KeyRound,
  Plus,
  ChevronDown,
  CheckCircle2,
  Eye,
  PenSquare,
  Inbox,
  Save,
} from "lucide-react";
import { PostStoragePanel } from "@/routes/_authenticated/post-storage";
import { upsertDraft } from "@/lib/post-drafts.functions";

import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { SignedImage } from "@/components/SignedImage";
import { GeoTaggedBadge } from "@/components/GeoTaggedBadge";
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
type ImageRow = {
  id: string;
  name: string;
  storage_path: string;
  posted_at: string | null;
  lat: number | null;
  lng: number | null;
};

const PREVIEW_COUNT = 8;


function PostGeneratorPage() {
  const compose = useServerFn(composePost);
  const send = useServerFn(sendPostToSocialPlanner);
  const saveDraft = useServerFn(upsertDraft);
  const [tab, setTab] = useState<"compose" | "storage">("compose");
  const [saving, setSaving] = useState(false);


  // Keywords — manual list is primary; CSV imports come from the `keywords` table
  const [manualKw, setManualKw] = useState<string[]>([]);
  const [manualInput, setManualInput] = useState("");
  const [importedKw, setImportedKw] = useState<KeywordRow[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importFilter, setImportFilter] = useState("");

  const [images, setImages] = useState<ImageRow[]>([]);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [showPosted, setShowPosted] = useState(false);

  const [location, setLocation] = useState<PickedLocation | null>(null);
  const [language, setLanguage] = useState<"en" | "ar" | "both">("en");
  const [tone, setTone] = useState<
    "friendly" | "premium" | "urgent" | "informative"
  >("premium");
  const [businessName, setBusinessName] = useState("");
  const [cta, setCta] = useState("");
  const [ghlLocationId, setGhlLocationId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [networks, setNetworks] = useState<Array<"gmb" | "facebook" | "instagram" | "linkedin" | "twitter">>(["gmb"]);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [caption, setCaption] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);

  const [ctaType, setCtaType] = useState<
    "none" | "book" | "order" | "shop" | "learn_more" | "sign_up" | "call"
  >("none");
  const [ctaUrl, setCtaUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  const CAPTION_LIMIT = 1500;
  const captionLen = caption.length;
  const captionOver = captionLen > CAPTION_LIMIT;


  async function reloadImages() {
    const { data } = await supabase
      .from("images")
      .select("id,name,storage_path,posted_at,lat,lng")
      .order("created_at", { ascending: false })
      .limit(500);
    setImages((data ?? []) as ImageRow[]);
  }

  useEffect(() => {
    supabase
      .from("keywords")
      .select("id,phrase,cluster,volume")
      .order("volume", { ascending: false, nullsFirst: false })
      .limit(500)
      .then(({ data }) => setImportedKw((data ?? []) as KeywordRow[]));
    reloadImages();
  }, []);

  const visibleImages = useMemo(
    () =>
      showPosted ? images : images.filter((i) => !i.posted_at),
    [images, showPosted],
  );
  const previewImages = visibleImages.slice(0, PREVIEW_COUNT);

  const filteredImportKw = useMemo(() => {
    const q = importFilter.trim().toLowerCase();
    const already = new Set(manualKw.map((k) => k.toLowerCase()));
    return importedKw.filter(
      (k) =>
        !already.has(k.phrase.toLowerCase()) &&
        (!q ||
          k.phrase.toLowerCase().includes(q) ||
          (k.cluster ?? "").toLowerCase().includes(q)),
    );
  }, [importedKw, importFilter, manualKw]);

  function addManualKw(raw: string) {
    const parts = raw
      .split(/[,\n]/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setManualKw((prev) => {
      const seen = new Set(prev.map((k) => k.toLowerCase()));
      const next = [...prev];
      for (const p of parts) {
        if (!seen.has(p.toLowerCase())) {
          next.push(p);
          seen.add(p.toLowerCase());
        }
      }
      return next;
    });
    setManualInput("");
  }
  function removeManualKw(kw: string) {
    setManualKw((prev) => prev.filter((k) => k !== kw));
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
    if (!manualKw.length) {
      toast.error("Add at least one keyword");
      return;
    }
    setGenerating(true);
    try {
      const res = await compose({
        data: {
          keywords: manualKw,
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
    if (captionOver) {
      toast.error(`Post body exceeds ${CAPTION_LIMIT} characters (${captionLen}).`);
      return;
    }
    if (ctaType !== "none" && ctaType !== "call" && !ctaUrl.trim()) {
      toast.error("Add a URL for the selected call-to-action");
      return;
    }
    if (ctaType === "call" && !ctaUrl.trim()) {
      toast.error("Add a phone number for the Call CTA");
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
          primaryKeyword: manualKw[0],
          ghlLocationId: ghlLocationId || undefined,
          scheduledAt: scheduledAt
            ? new Date(scheduledAt).toISOString()
            : undefined,
          networks: networks.length ? networks : ["gmb"],
          ctaType,
          ctaUrl: ctaUrl.trim() || undefined,
        },
      });
      toast.success(
        res.status === "queued"
          ? "Scheduled in GHL Social Planner"
          : "Sent to GHL Social Planner",
      );
      setSelectedImages(new Set());
      reloadImages();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  async function handleSaveDraft() {
    if (!caption.trim()) {
      toast.error("Nothing to save");
      return;
    }
    setSaving(true);
    try {
      const title =
        (manualKw[0] ?? businessName ?? caption.slice(0, 60).trim()) || "Untitled draft";
      await saveDraft({
        data: {
          title,
          body: caption,
          status: "Draft",
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          tags: manualKw.slice(0, 8),
        },
      });
      toast.success("Draft saved to Post Storage");
      setCaption("");
      setSelectedImages(new Set());
      setTab("storage");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }


  async function uploadManualImages(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) {
      toast.error("Please choose image files");
      return;
    }
    setUploading(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setUploading(false);
      toast.error("Not signed in");
      return;
    }
    let ok = 0;
    let fail = 0;
    for (const file of list) {
      try {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${userId}/post-generator/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("frames")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        const { error: dbErr } = await supabase
          .from("images")
          .insert({ owner_id: userId, storage_path: path, name: file.name } as any);
        if (dbErr) throw dbErr;
        ok++;
      } catch {
        fail++;
      }
    }
    setUploading(false);
    if (ok) toast.success(`Uploaded ${ok} image${ok === 1 ? "" : "s"}`);
    if (fail) toast.error(`${fail} upload${fail === 1 ? "" : "s"} failed`);
    await reloadImages();
    if (uploadRef.current) uploadRef.current.value = "";
  }


  async function copyOut() {
    await navigator.clipboard.writeText(caption);
    toast.success("Copied");
  }

  return (
    <div
      className="w-full py-6 pl-6 md:py-10 md:pl-10"
      style={{ paddingRight: 50 }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">Post Generator</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your keywords, pick images + location, generate with AI, then
            push to GHL Social Planner.
          </p>
        </div>
      </div>

      {/* Top tabs */}
      <div className="mt-6 border-b border-border">
        <nav role="tablist" aria-label="Post generator sections" className="-mb-px flex flex-wrap gap-1 overflow-x-auto">
          {[
            { id: "compose" as const, label: "Compose", icon: PenSquare },
            { id: "storage" as const, label: "Post Storage", icon: Inbox },
          ].map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {tab === "storage" ? (
        <div className="mt-6">
          <PostStoragePanel />
        </div>
      ) : (
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">

        {/* Left column — inputs */}
        <div className="space-y-6">
          {/* Keywords — manual first, CSV import as dropdown */}
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <KeyRound className="h-4 w-4 text-primary" /> Keywords
                <span className="text-xs text-muted-foreground">
                  ({manualKw.length} added)
                </span>
              </div>
              <div className="relative">
                <button
                  onClick={() => setImportOpen((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs hover:border-primary/50"
                >
                  Import from Semrush
                  <ChevronDown className="h-3 w-3" />
                </button>
                {importOpen && (
                  <div className="absolute right-0 z-20 mt-1 w-80 rounded-lg border border-border bg-popover p-2 shadow-lg">
                    <input
                      autoFocus
                      value={importFilter}
                      onChange={(e) => setImportFilter(e.target.value)}
                      placeholder="Search imported keywords…"
                      className="mb-2 w-full rounded border border-border bg-background px-2 py-1.5 text-xs outline-none"
                    />
                    <div className="max-h-64 overflow-auto">
                      {filteredImportKw.length === 0 ? (
                        <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                          {importedKw.length === 0
                            ? "No CSV imported yet. Go to Keywords tab."
                            : "No matches."}
                        </div>
                      ) : (
                        filteredImportKw.slice(0, 100).map((k) => (
                          <button
                            key={k.id}
                            onClick={() => {
                              addManualKw(k.phrase);
                              setImportFilter("");
                            }}
                            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
                          >
                            <span>{k.phrase}</span>
                            {k.volume ? (
                              <span className="text-muted-foreground">
                                {k.volume.toLocaleString()}
                              </span>
                            ) : null}
                          </button>
                        ))
                      )}
                    </div>
                    <div className="mt-1 flex justify-end border-t border-border pt-2">
                      <button
                        onClick={() => setImportOpen(false)}
                        className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Manual entry */}
            <div className="flex gap-2">
              <input
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addManualKw(manualInput);
                  }
                }}
                placeholder="Type a keyword and press Enter (or paste comma-separated)"
                className="flex-1 rounded border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                onClick={() => addManualKw(manualInput)}
                className="inline-flex items-center gap-1 rounded bg-primary px-3 py-2 text-xs text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>

            {manualKw.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {manualKw.map((k) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs text-primary"
                  >
                    {k}
                    <button
                      onClick={() => removeManualKw(k)}
                      className="ml-0.5 rounded-full hover:bg-primary/20"
                      aria-label={`Remove ${k}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Images picker — preview + View all */}
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ImageIcon className="h-4 w-4 text-primary" /> Images
                <span className="text-xs text-muted-foreground">
                  ({selectedImages.size}/4 selected · {visibleImages.length}{" "}
                  available)
                </span>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={showPosted}
                    onChange={(e) => setShowPosted(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  Show posted
                </label>
                <input
                  ref={uploadRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => e.target.files && uploadManualImages(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => uploadRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  {uploading ? "Uploading…" : "Upload"}
                </button>
              </div>
            </div>

            {previewImages.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                {images.length === 0
                  ? "No images yet. Extract frames from a video first."
                  : "All available images have been posted. Toggle 'Show posted' to reuse."}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-2">
                  {previewImages.map((img) => (
                    <ImageThumb
                      key={img.id}
                      img={img}
                      active={selectedImages.has(img.id)}
                      onClick={() => toggleImage(img.id)}
                    />
                  ))}
                </div>
                {visibleImages.length > PREVIEW_COUNT && (
                  <button
                    onClick={() => setGalleryOpen(true)}
                    className="mt-3 w-full rounded-md border border-border py-2 text-xs font-medium hover:border-primary/50 hover:bg-accent"
                  >
                    View all {visibleImages.length} images →
                  </button>
                )}
              </>
            )}
          </section>

          {/* Location */}
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 text-sm font-medium">Location</div>
            <LocationPicker value={location} onChange={setLocation} />
          </section>

          {/* Voice */}
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
                  Call-to-action hint for AI (optional)
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

          {/* GMB Call-to-action */}
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium">GMB call-to-action</div>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Google standard
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="block">
                <span className="text-xs text-muted-foreground">Action</span>
                <select
                  value={ctaType}
                  onChange={(e) => setCtaType(e.target.value as typeof ctaType)}
                  className="mt-1 w-full rounded border border-border bg-background p-2 text-sm"
                >
                  <option value="none">None</option>
                  <option value="book">Book</option>
                  <option value="order">Order online</option>
                  <option value="shop">Buy</option>
                  <option value="learn_more">Learn more</option>
                  <option value="sign_up">Sign up</option>
                  <option value="call">Call now</option>
                </select>
              </label>
              {ctaType !== "none" && (
                <label className="block">
                  <span className="text-xs text-muted-foreground">
                    {ctaType === "call" ? "Phone number" : "Destination URL"}
                  </span>
                  <input
                    value={ctaUrl}
                    onChange={(e) => setCtaUrl(e.target.value)}
                    placeholder={
                      ctaType === "call"
                        ? "+971 50 000 0000"
                        : "https://example.com/book"
                    }
                    inputMode={ctaType === "call" ? "tel" : "url"}
                    className="mt-1 w-full rounded border border-border bg-background p-2 text-sm"
                  />
                </label>
              )}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              These map to Google Business Profile's standard actions (Book,
              Order, Buy, Learn more, Sign up, Call).
            </p>
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
              <div>
                <div className="text-sm font-medium">Post body</div>
                <div className="text-[11px] text-muted-foreground">
                  This is what will be posted. Max {CAPTION_LIMIT} characters.
                </div>
              </div>
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
              aria-invalid={captionOver}
              placeholder="Click Generate with AI to draft a post, then edit here."
              className={`w-full rounded border bg-background p-3 text-sm outline-none transition ${
                captionOver
                  ? "border-red-500 text-red-600 focus:ring-2 focus:ring-red-500/40"
                  : "border-border focus:ring-2 focus:ring-primary/40"
              }`}
            />
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className={captionOver ? "font-medium text-red-500" : "text-muted-foreground"}>
                {captionOver
                  ? `Post body exceeds the ${CAPTION_LIMIT}-character limit. Trim ${captionLen - CAPTION_LIMIT} character${captionLen - CAPTION_LIMIT === 1 ? "" : "s"} to send.`
                  : "Google Business Profile allows up to 1,500 characters per post."}
              </span>
              <span
                className={`font-mono tabular-nums ${
                  captionOver
                    ? "font-semibold text-red-500"
                    : captionLen > CAPTION_LIMIT - 100
                      ? "text-amber-500"
                      : "text-muted-foreground"
                }`}
              >
                {captionLen}/{CAPTION_LIMIT}
              </span>
            </div>
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

              {/* Multi-network selector */}
              <div>
                <div className="text-xs text-muted-foreground">Networks</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {(
                    [
                      { id: "gmb", label: "Google" },
                      { id: "facebook", label: "Facebook" },
                      { id: "instagram", label: "Instagram" },
                      { id: "linkedin", label: "LinkedIn" },
                      { id: "twitter", label: "X / Twitter" },
                    ] as const
                  ).map((n) => {
                    const on = networks.includes(n.id);
                    return (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() =>
                          setNetworks((prev) =>
                            on ? prev.filter((x) => x !== n.id) : [...prev, n.id],
                          )
                        }
                        className={`rounded-full border px-3 py-1 text-xs transition ${
                          on
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {n.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setPreviewOpen(true)}
                  disabled={!caption.trim() || captionOver}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-3 text-sm font-medium hover:bg-accent disabled:opacity-40"
                >
                  <Eye className="h-4 w-4" /> Preview
                </button>
                <button
                  onClick={handleSaveDraft}
                  disabled={saving || !caption.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-3 text-sm font-medium hover:bg-accent disabled:opacity-40"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save
                </button>
                <button
                  onClick={() => setPreviewOpen(true)}
                  disabled={sending || !caption.trim() || captionOver || networks.length === 0}

                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {scheduledAt ? "Schedule…" : "Send…"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Preview shows exactly what will post to each network before it
                leaves. On success, images are marked as posted.
              </p>

            </div>
          </section>
        </div>
      </div>
      )}



      {/* Full gallery modal */}
      {galleryOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setGalleryOpen(false)}
        >
          <div
            className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div>
                <div className="text-sm font-medium">All images</div>
                <div className="text-xs text-muted-foreground">
                  {selectedImages.size}/4 selected · {visibleImages.length}{" "}
                  available
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={showPosted}
                    onChange={(e) => setShowPosted(e.target.checked)}
                  />
                  Show posted
                </label>
                <button
                  onClick={() => setGalleryOpen(false)}
                  className="rounded p-1 hover:bg-accent"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                {visibleImages.map((img) => (
                  <ImageThumb
                    key={img.id}
                    img={img}
                    active={selectedImages.has(img.id)}
                    onClick={() => toggleImage(img.id)}
                  />
                ))}
              </div>
            </div>
            <div className="border-t border-border px-5 py-3 text-right">
              <button
                onClick={() => setGalleryOpen(false)}
                className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview & confirm modal */}
      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => !sending && setPreviewOpen(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div>
                <div className="text-sm font-medium">Preview & confirm</div>
                <div className="text-xs text-muted-foreground">
                  Exactly what will be sent to {networks.join(", ") || "no networks"}
                  {scheduledAt ? ` at ${new Date(scheduledAt).toLocaleString()}` : " right now"}.
                </div>
              </div>
              <button
                onClick={() => !sending && setPreviewOpen(false)}
                className="rounded p-1 hover:bg-accent disabled:opacity-40"
                disabled={sending}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {/* Mock GMB card */}
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/15" />
                  <div>
                    <div className="text-sm font-semibold">
                      {businessName || "Your Business"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {location?.label ?? "No location set"} · now
                    </div>
                  </div>
                </div>
                <div
                  className="mt-3 whitespace-pre-wrap text-sm leading-relaxed"
                  dir={language === "ar" ? "rtl" : "ltr"}
                >
                  {caption}
                </div>
                {Array.from(selectedImages).length > 0 && (
                  <div
                    className={`mt-3 grid gap-1 ${
                      selectedImages.size === 1
                        ? "grid-cols-1"
                        : selectedImages.size === 2
                          ? "grid-cols-2"
                          : "grid-cols-2 sm:grid-cols-3"
                    }`}
                  >
                    {Array.from(selectedImages).map((id) => {
                      const img = images.find((i) => i.id === id);
                      if (!img) return null;
                      return (
                        <SignedImage
                          key={id}
                          bucket="frames"
                          path={img.storage_path}
                          alt={img.name}
                          className="aspect-square w-full rounded object-cover"
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid gap-2 text-xs sm:grid-cols-2">
                <InfoRow label="Networks" value={networks.join(", ") || "—"} />
                <InfoRow
                  label="Schedule"
                  value={
                    scheduledAt
                      ? new Date(scheduledAt).toLocaleString()
                      : "Send immediately"
                  }
                />
                <InfoRow label="Primary keyword" value={manualKw[0] ?? "—"} />
                <InfoRow label="GHL Location" value={ghlLocationId || "default"} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <button
                onClick={() => setPreviewOpen(false)}
                disabled={sending}
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await handleSend();
                  setPreviewOpen(false);
                }}
                disabled={sending || !caption.trim() || captionOver || networks.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Confirm & {scheduledAt ? "schedule" : "send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card/50 p-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 truncate">{value}</div>
    </div>
  );
}

function ImageThumb({
  img,
  active,
  onClick,
}: {
  img: ImageRow;
  active: boolean;
  onClick: () => void;
}) {
  const posted = !!img.posted_at;
  return (
    <button
      onClick={onClick}
      className={`relative overflow-hidden rounded-md border transition ${
        active
          ? "border-primary ring-2 ring-primary"
          : "border-border hover:border-primary/50"
      } ${posted ? "opacity-70" : ""}`}
      title={
        posted
          ? `Posted ${new Date(img.posted_at!).toLocaleDateString()}`
          : img.name
      }
    >
      <SignedImage
        bucket="frames"
        path={img.storage_path}
        alt={img.name}
        className="aspect-square w-full object-cover"
      />
      {img.lat != null && img.lng != null && (
        <div className="absolute left-1 top-1">
          <GeoTaggedBadge lat={img.lat} lng={img.lng} compact />
        </div>
      )}
      {active && (
        <div className="absolute right-1 top-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
          ✓
        </div>
      )}

      {posted && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-emerald-600/85 py-0.5 text-[10px] font-medium text-white">
          <CheckCircle2 className="h-3 w-3" /> Posted
        </div>
      )}
    </button>
  );
}
