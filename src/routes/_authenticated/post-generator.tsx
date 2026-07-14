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
  LayoutTemplate,
  Trash2,
  BarChart3,
  MapPin,
  TrendingUp,
} from "lucide-react";
import { PostStoragePanel } from "@/routes/_authenticated/post-storage";
import { upsertDraft } from "@/lib/post-drafts.functions";

import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { SignedImage } from "@/components/SignedImage";
import { GeoTaggedBadge } from "@/components/GeoTaggedBadge";
import {
  type PickedLocation,
} from "@/components/LocationPicker";
import {
  composePost,
  sendPostToSocialPlanner,
} from "@/lib/post-generator.functions";
import { readGps } from "@/lib/exif-geotag";
import { getPreferences } from "@/lib/user-preferences.functions";

export const Route = createFileRoute("/_authenticated/post-generator")({
  component: () => <PostGeneratorPage />,
});

export type SocialPlatform = "gmb" | "facebook" | "instagram" | "linkedin" | "twitter";

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

function isHttpsUrl(v: string): boolean {
  const s = v.trim();
  if (!s) return false;
  try {
    const u = new URL(s);
    return (
      (u.protocol === "https:" || u.protocol === "http:") &&
      !!u.hostname &&
      u.hostname.includes(".")
    );
  } catch {
    return false;
  }
}

function isValidPhone(v: string): boolean {
  const digits = v.replace(/[^\d]/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

function joinPath(base: string, path: string): string {
  const b = base.trim().replace(/\/+$/, "");
  if (!b) return "";
  return `${b}${path.startsWith("/") ? path : `/${path}`}`;
}


export function PostGeneratorPage({
  defaultPlatform,
  pageTitle,
}: { defaultPlatform?: SocialPlatform; pageTitle?: string } = {}) {
  const compose = useServerFn(composePost);
  const send = useServerFn(sendPostToSocialPlanner);
  const saveDraft = useServerFn(upsertDraft);
  const [tab, setTab] = useState<"compose" | "storage" | "history">("compose");
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
  const [networks, setNetworks] = useState<Array<SocialPlatform>>(defaultPlatform ? [defaultPlatform] : ["gmb"]);
  const isSocial = defaultPlatform === "facebook" || defaultPlatform === "instagram";
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const [mentionInput, setMentionInput] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  const [caption, setCaption] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);

  const [ctaType, setCtaType] = useState<
    "none" | "book" | "order" | "shop" | "learn_more" | "sign_up" | "call"
  >("none");
  const [ctaUrl, setCtaUrl] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessWebsite, setBusinessWebsite] = useState("");
  const [phoneManuallyEdited, setPhoneManuallyEdited] = useState(false);
  const [ctaManuallyEdited, setCtaManuallyEdited] = useState(false);
  const loadPrefs = useServerFn(getPreferences);
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const importPopupRef = useRef<HTMLDivElement>(null);

  // Post-body templates persisted in localStorage
  type PostTemplate = { id: string; name: string; body: string };
  const TEMPLATES_KEY = "post-generator:templates";
  const [templates, setTemplates] = useState<PostTemplate[]>([]);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const templatesPopupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TEMPLATES_KEY);
      if (raw) setTemplates(JSON.parse(raw) as PostTemplate[]);
    } catch {
      /* ignore */
    }
  }, []);

  function persistTemplates(next: PostTemplate[]) {
    setTemplates(next);
    try {
      localStorage.setItem(TEMPLATES_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  function saveCurrentAsTemplate() {
    const body = caption.trim();
    if (!body) {
      toast.error("Post body is empty");
      return;
    }
    const name = window.prompt("Template name", body.slice(0, 40))?.trim();
    if (!name) return;
    persistTemplates([{ id: crypto.randomUUID(), name, body }, ...templates]);
    toast.success("Template saved");
  }
  function applyTemplate(t: PostTemplate) {
    if (caption.trim() && !window.confirm("Replace current post body with this template?")) return;
    setCaption(t.body);
    setTemplatesOpen(false);
    toast.success(`Applied "${t.name}"`);
  }
  function deleteTemplate(id: string) {
    persistTemplates(templates.filter((t) => t.id !== id));
  }
  const templateImportRef = useRef<HTMLInputElement>(null);
  function exportTemplates() {
    if (!templates.length) {
      toast.error("No templates to export");
      return;
    }
    const payload = {
      kind: "post-generator-templates",
      version: 1,
      exportedAt: new Date().toISOString(),
      templates,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `post-templates-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${templates.length} template${templates.length === 1 ? "" : "s"}`);
  }
  async function importTemplatesFromFile(file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const incoming: unknown =
        Array.isArray(parsed) ? parsed : parsed?.templates;
      if (!Array.isArray(incoming)) throw new Error("Invalid template file");
      const valid: PostTemplate[] = [];
      for (const raw of incoming) {
        if (!raw || typeof raw !== "object") continue;
        const r = raw as Record<string, unknown>;
        const name = typeof r.name === "string" ? r.name.trim() : "";
        const body = typeof r.body === "string" ? r.body : "";
        if (!name || !body) continue;
        valid.push({ id: crypto.randomUUID(), name, body });
      }
      if (!valid.length) {
        toast.error("No valid templates found in file");
        return;
      }
      // Merge, skipping exact name+body duplicates
      const seen = new Set(templates.map((t) => `${t.name}::${t.body}`));
      const merged = [...templates];
      let added = 0;
      for (const t of valid) {
        const key = `${t.name}::${t.body}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.unshift(t);
        added++;
      }
      persistTemplates(merged);
      toast.success(
        added
          ? `Imported ${added} template${added === 1 ? "" : "s"}`
          : "Templates already present — nothing to import",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    }
  }


  // Close popups when clicking outside
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (importOpen && importPopupRef.current && !importPopupRef.current.contains(target)) {
        setImportOpen(false);
      }
      if (templatesOpen && templatesPopupRef.current && !templatesPopupRef.current.contains(target)) {
        setTemplatesOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [importOpen, templatesOpen]);


  // Load business phone + website from settings for CTA auto-populate.
  useEffect(() => {
    loadPrefs()
      .then((p) => {
        const g = (p?.general ?? {}) as { phone?: string; website?: string };
        if (g.phone) setBusinessPhone(g.phone);
        if (g.website) setBusinessWebsite(g.website);
      })
      .catch(() => {
        /* ignore — user may not have saved business settings yet */
      });
  }, [loadPrefs]);

  // CTA metadata — button label, help copy, placeholder, validator, and
  // suggested URL derived from business settings. Keeps the CTA input
  // aware of the "post type" (action) the user picked.
  const CTA_META: Record<
    typeof ctaType,
    {
      buttonLabel: string;
      help: string;
      placeholder: string;
      inputMode: "tel" | "url" | "text";
      validate: (v: string) => string | null;
      suggest: (ctx: { phone: string; website: string }) => string;
    }
  > = {
    none: {
      buttonLabel: "No button",
      help: "No action button will appear on the post.",
      placeholder: "",
      inputMode: "text",
      validate: () => null,
      suggest: () => "",
    },
    book: {
      buttonLabel: "Book",
      help: "Sends customers to a booking or reservation page.",
      placeholder: "https://example.com/book",
      inputMode: "url",
      validate: (v) => (isHttpsUrl(v) ? null : "Enter a full https:// booking link."),
      suggest: ({ website }) => (website ? joinPath(website, "/book") : ""),
    },
    order: {
      buttonLabel: "Order online",
      help: "Links to your online-ordering page.",
      placeholder: "https://example.com/order",
      inputMode: "url",
      validate: (v) => (isHttpsUrl(v) ? null : "Enter a full https:// ordering link."),
      suggest: ({ website }) => (website ? joinPath(website, "/order") : ""),
    },
    shop: {
      buttonLabel: "Buy",
      help: "Links to a product or storefront page.",
      placeholder: "https://example.com/product",
      inputMode: "url",
      validate: (v) => (isHttpsUrl(v) ? null : "Enter a full https:// product or shop link."),
      suggest: ({ website }) => (website ? joinPath(website, "/shop") : ""),
    },
    learn_more: {
      buttonLabel: "Learn more",
      help: "Sends customers to a landing or info page.",
      placeholder: "https://example.com/services",
      inputMode: "url",
      validate: (v) => (isHttpsUrl(v) ? null : "Enter a full https:// link."),
      suggest: ({ website }) => website || "",
    },
    sign_up: {
      buttonLabel: "Sign up",
      help: "Links to a newsletter, waitlist, or account sign-up page.",
      placeholder: "https://example.com/signup",
      inputMode: "url",
      validate: (v) => (isHttpsUrl(v) ? null : "Enter a full https:// sign-up link."),
      suggest: ({ website }) => (website ? joinPath(website, "/signup") : ""),
    },
    call: {
      buttonLabel: "Call now",
      help: "Dials your business phone from the customer's device.",
      placeholder: "+971 50 000 0000",
      inputMode: "tel",
      validate: (v) =>
        isValidPhone(v)
          ? null
          : "Enter a phone number with at least 7 digits (international format recommended).",
      suggest: ({ phone }) => phone,
    },
  };

  const ctaMeta = CTA_META[ctaType];
  const ctaSuggestion =
    ctaType === "none" ? "" : ctaMeta.suggest({ phone: businessPhone, website: businessWebsite });
  const ctaError =
    ctaType === "none" || !ctaUrl.trim() ? null : ctaMeta.validate(ctaUrl.trim());
  const ctaMissing = ctaType !== "none" && !ctaUrl.trim();

  // Auto-populate the CTA value when the action changes and the user hasn't
  // manually edited it. Works for phone (Call) and URL (all others).
  useEffect(() => {
    if (ctaType === "none") return;
    const suggestion = CTA_META[ctaType].suggest({
      phone: businessPhone,
      website: businessWebsite,
    });
    if (!suggestion) return;
    if (ctaType === "call") {
      if (!phoneManuallyEdited && !ctaUrl) setCtaUrl(suggestion);
    } else {
      if (!ctaManuallyEdited && !ctaUrl) setCtaUrl(suggestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctaType, businessPhone, businessWebsite]);


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

  function addHashtag(raw: string) {
    const parts = raw
      .split(/[,\s\n]/)
      .map((p) => p.trim().replace(/^#+/, ""))
      .filter(Boolean);
    if (!parts.length) return;
    setHashtags((prev) => {
      const seen = new Set(prev.map((k) => k.toLowerCase()));
      const next = [...prev];
      for (const p of parts) if (!seen.has(p.toLowerCase())) { next.push(p); seen.add(p.toLowerCase()); }
      return next;
    });
    setHashtagInput("");
  }
  function removeHashtag(h: string) {
    setHashtags((prev) => prev.filter((k) => k !== h));
  }
  function addMention(raw: string) {
    const parts = raw
      .split(/[,\s\n]/)
      .map((p) => p.trim().replace(/^@+/, ""))
      .filter(Boolean);
    if (!parts.length) return;
    setMentions((prev) => {
      const seen = new Set(prev.map((k) => k.toLowerCase()));
      const next = [...prev];
      for (const p of parts) if (!seen.has(p.toLowerCase())) { next.push(p); seen.add(p.toLowerCase()); }
      return next;
    });
    setMentionInput("");
  }
  function removeMention(m: string) {
    setMentions((prev) => prev.filter((k) => k !== m));
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
    if (!isSocial && !manualKw.length) {
      toast.error("Add at least one keyword");
      return;
    }
    if (isSocial && !manualKw.length && hashtags.length === 0 && mentions.length === 0) {
      toast.error("Add a keyword, hashtag, or mention to guide the post");
      return;
    }
    setGenerating(true);
    try {
      // On social, seed the composer with hashtags/mentions when no keywords —
      // gives the AI something to anchor the copy to.
      const seedKeywords = manualKw.length
        ? manualKw
        : [...hashtags, ...mentions.map((m) => `@${m}`)];
      const res = await compose({
        data: {
          keywords: seedKeywords,
          imageIds: Array.from(selectedImages),
          locationLabel: location?.label,
          language,
          tone,
          businessName: businessName || undefined,
          callToAction: cta || undefined,
        },
      });
      // Append hashtags and @mentions to the generated caption for social posts.
      let out = res.caption;
      if (isSocial) {
        const mentionLine = mentions.map((m) => `@${m}`).join(" ");
        const hashtagLine = hashtags.map((h) => `#${h}`).join(" ");
        const trailer = [mentionLine, hashtagLine].filter(Boolean).join("\n");
        if (trailer) out = `${out.trimEnd()}\n\n${trailer}`;
      }
      setCaption(out);
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
    if (ctaMissing) {
      toast.error(
        ctaType === "call"
          ? "Add a phone number for the Call CTA"
          : `Add a destination for the "${ctaMeta.buttonLabel}" button`,
      );
      return;
    }
    if (ctaError) {
      toast.error(`${ctaMeta.buttonLabel} button: ${ctaError}`);
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
    let detectedGps: { lat: number; lng: number } | null = null;
    for (const file of list) {
      try {
        // Try reading GPS EXIF before uploading so we can auto-fill the
        // location field beneath the image with the first geotag we find.
        if (!detectedGps) {
          try {
            const gps = await readGps(file);
            if (gps.hasGps && gps.lat != null && gps.lng != null) {
              detectedGps = { lat: gps.lat, lng: gps.lng };
            }
          } catch {
            /* ignore EXIF errors */
          }
        }
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${userId}/post-generator/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("frames")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        const { error: dbErr } = await supabase
          .from("images")
          .insert({
            owner_id: userId,
            storage_path: path,
            name: file.name,
            lat: detectedGps?.lat ?? null,
            lng: detectedGps?.lng ?? null,
          } as any);
        if (dbErr) throw dbErr;
        ok++;
      } catch {
        fail++;
      }
    }
    setUploading(false);
    if (ok) toast.success(`Uploaded ${ok} image${ok === 1 ? "" : "s"}`);
    if (fail) toast.error(`${fail} upload${fail === 1 ? "" : "s"} failed`);

    // Auto-populate the Post Generator location field from the first geotag
    // found, but only when the user hasn't already picked a location.
    if (detectedGps && !location) {
      let label = `${detectedGps.lat.toFixed(5)}, ${detectedGps.lng.toFixed(5)}`;
      try {
        const g = (window as any).google;
        if (g?.maps?.Geocoder) {
          const geocoder = new g.maps.Geocoder();
          const res: any = await geocoder.geocode({
            location: { lat: detectedGps.lat, lng: detectedGps.lng },
          });
          const first = res?.results?.[0];
          if (first?.formatted_address) label = first.formatted_address;
        }
      } catch {
        /* keep coordinate label */
      }
      setLocation({ label, lat: detectedGps.lat, lng: detectedGps.lng });
      toast.message(`Location auto-detected: ${label}`);
    }

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
          <h1 className="text-3xl">{pageTitle ?? "Post Generator"}</h1>
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
            { id: "history" as const, label: "History", icon: BarChart3 },
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
      ) : tab === "history" ? (
        <div className="mt-6">
          <PostHistoryPanel />
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
                {isSocial && (
                  <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                    Optional
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  ({manualKw.length} added)
                </span>
              </div>
              <div className="relative" ref={importPopupRef}>
                <button
                  onClick={() => setImportOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-gradient-to-br from-primary/15 to-primary/5 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm transition hover:border-primary hover:from-primary/25 hover:to-primary/10 hover:shadow"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Import from Semrush
                  <ChevronDown className="h-3 w-3 opacity-70" />
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

          {/* Hashtags & Mentions — social platforms only */}
          {isSocial && (
            <section className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                Hashtags &amp; mentions
                <span className="text-xs text-muted-foreground">
                  ({hashtags.length} tags · {mentions.length} mentions)
                </span>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Hashtags</label>
                  <div className="flex gap-2">
                    <input
                      value={hashtagInput}
                      onChange={(e) => setHashtagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " " || e.key === ",") {
                          e.preventDefault();
                          addHashtag(hashtagInput);
                        }
                      }}
                      placeholder="marketing, socialmedia (Enter or space to add)"
                      className="flex-1 rounded border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    <button
                      onClick={() => addHashtag(hashtagInput)}
                      className="inline-flex items-center gap-1 rounded bg-primary px-3 py-2 text-xs text-primary-foreground hover:opacity-90"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add
                    </button>
                  </div>
                  {hashtags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {hashtags.map((h) => (
                        <span
                          key={h}
                          className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-xs text-sky-600 dark:text-sky-400"
                        >
                          #{h}
                          <button
                            onClick={() => removeHashtag(h)}
                            className="ml-0.5 rounded-full hover:bg-sky-500/20"
                            aria-label={`Remove #${h}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Mentions</label>
                  <div className="flex gap-2">
                    <input
                      value={mentionInput}
                      onChange={(e) => setMentionInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " " || e.key === ",") {
                          e.preventDefault();
                          addMention(mentionInput);
                        }
                      }}
                      placeholder={`@handle (${defaultPlatform === "instagram" ? "Instagram" : "Facebook"} account)`}
                      className="flex-1 rounded border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    <button
                      onClick={() => addMention(mentionInput)}
                      className="inline-flex items-center gap-1 rounded bg-primary px-3 py-2 text-xs text-primary-foreground hover:opacity-90"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add
                    </button>
                  </div>
                  {mentions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {mentions.map((m) => (
                        <span
                          key={m}
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-600 dark:text-emerald-400"
                        >
                          @{m}
                          <button
                            onClick={() => removeMention(m)}
                            className="ml-0.5 rounded-full hover:bg-emerald-500/20"
                            aria-label={`Remove @${m}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Hashtags and mentions are appended to the generated post automatically.
              </p>
            </section>
          )}



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
            </div>
          </section>


          {/* GMB Call-to-action — hidden on Facebook/Instagram */}
          {!isSocial && (
            <section className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium">GMB call-to-action</div>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Google standard
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <label className="block">
                  <span className="text-xs text-muted-foreground">Post type / action</span>
                  <select
                    value={ctaType}
                    onChange={(e) => {
                      setCtaType(e.target.value as typeof ctaType);
                      // Reset "manually edited" flags so auto-suggest kicks in
                      // for the newly selected action.
                      setCtaUrl("");
                      setPhoneManuallyEdited(false);
                      setCtaManuallyEdited(false);
                    }}
                    className="mt-1 w-full rounded border border-border bg-background p-2 text-sm"
                  >
                    <option value="none">No button</option>
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
                    <span className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{ctaType === "call" ? "Phone number" : "Destination URL"}</span>
                      {ctaSuggestion && ctaUrl === ctaSuggestion && (
                        <span className="text-[10px] uppercase tracking-widest text-primary">
                          From settings
                        </span>
                      )}
                    </span>
                    <div className="relative mt-1">
                      <input
                        value={ctaUrl}
                        onChange={(e) => {
                          setCtaUrl(e.target.value);
                          if (ctaType === "call") setPhoneManuallyEdited(true);
                          else setCtaManuallyEdited(true);
                        }}
                        placeholder={ctaMeta.placeholder}
                        inputMode={ctaMeta.inputMode}
                        aria-invalid={!!ctaError}
                        className={`w-full rounded border bg-background p-2 pr-9 text-sm outline-none transition ${
                          ctaError
                            ? "border-red-500 focus:ring-2 focus:ring-red-500/40"
                            : "border-border focus:ring-2 focus:ring-primary/40"
                        }`}
                      />
                      {ctaUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setCtaUrl("");
                            if (ctaType === "call") setPhoneManuallyEdited(true);
                            else setCtaManuallyEdited(true);
                          }}
                          aria-label="Clear"
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </label>
                )}
              </div>

              {ctaType !== "none" && (
                <div className="mt-2 space-y-1.5">
                  <p className="text-[11px] text-muted-foreground">{ctaMeta.help}</p>
                  {/* Live button preview */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Button
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium ${
                        ctaError || ctaMissing
                          ? "border-red-500/40 bg-red-500/10 text-red-500"
                          : "border-primary/40 bg-primary/10 text-primary"
                      }`}
                    >
                      {ctaMeta.buttonLabel}
                    </span>
                  </div>
                  {/* Suggestion chips */}
                  {ctaSuggestion && ctaUrl !== ctaSuggestion && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] text-muted-foreground">Suggested:</span>
                      <button
                        type="button"
                        onClick={() => {
                          setCtaUrl(ctaSuggestion);
                          if (ctaType === "call") setPhoneManuallyEdited(false);
                          else setCtaManuallyEdited(false);
                        }}
                        className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[11px] text-primary hover:bg-primary/20"
                      >
                        {ctaSuggestion}
                      </button>
                    </div>
                  )}
                  {/* Inline validation */}
                  {ctaError && (
                    <p className="text-[11px] font-medium text-red-500">{ctaError}</p>
                  )}
                  {!ctaError && ctaMissing && (
                    <p className="text-[11px] text-amber-500">
                      Add a {ctaType === "call" ? "phone number" : "URL"} — the button will be
                      hidden until you do.
                    </p>
                  )}
                </div>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">
                These map to Google Business Profile's standard action buttons (Book, Order, Buy,
                Learn more, Sign up, Call).
              </p>
            </section>
          )}


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
              <div className="flex items-center gap-1.5">
                <div className="relative" ref={templatesPopupRef}>
                  <button
                    onClick={() => setTemplatesOpen((v) => !v)}
                    className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-accent"
                  >
                    <LayoutTemplate className="h-3 w-3" /> Templates
                    <ChevronDown className="h-3 w-3 opacity-70" />
                  </button>
                  {templatesOpen && (
                    <div className="absolute right-0 z-20 mt-1 w-80 rounded-lg border border-border bg-popover p-2 shadow-lg">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-xs font-medium">Post templates</div>
                        <div className="flex items-center gap-1">
                          <input
                            ref={templateImportRef}
                            type="file"
                            accept="application/json,.json"
                            hidden
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) importTemplatesFromFile(f);
                              if (templateImportRef.current) templateImportRef.current.value = "";
                            }}
                          />
                          <button
                            onClick={() => templateImportRef.current?.click()}
                            title="Import templates from JSON"
                            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] font-medium hover:bg-accent"
                          >
                            Import
                          </button>
                          <button
                            onClick={exportTemplates}
                            disabled={!templates.length}
                            title="Export templates as JSON"
                            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] font-medium hover:bg-accent disabled:opacity-40"
                          >
                            Export
                          </button>
                          <button
                            onClick={saveCurrentAsTemplate}
                            className="inline-flex items-center gap-1 rounded bg-primary/15 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/25"
                          >
                            <Plus className="h-3 w-3" /> Save current
                          </button>
                        </div>
                      </div>
                      <div className="max-h-64 overflow-auto">
                        {templates.length === 0 ? (
                          <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                            No templates yet. Paste content into the post body,
                            then click "Save current".
                          </div>
                        ) : (
                          templates.map((t) => (
                            <div
                              key={t.id}
                              className="group flex items-start gap-2 rounded px-2 py-1.5 hover:bg-accent"
                            >
                              <button
                                onClick={() => applyTemplate(t)}
                                className="flex-1 text-left"
                              >
                                <div className="truncate text-xs font-medium">{t.name}</div>
                                <div className="truncate text-[11px] text-muted-foreground">
                                  {t.body.slice(0, 60)}
                                  {t.body.length > 60 ? "…" : ""}
                                </div>
                              </button>
                              <button
                                onClick={() => deleteTemplate(t.id)}
                                aria-label="Delete template"
                                className="rounded p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-destructive/15 hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={copyOut}
                  disabled={!caption}
                  className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-40"
                >
                  <Copy className="h-3 w-3" /> Copy
                </button>
              </div>
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

          {/* Live GMB preview */}
          {(() => {
            const GMB_TRUNCATE = 100;
            const GMB_SWEET_MIN = 150;
            const GMB_SWEET_MAX = 300;
            const len = captionLen;
            const pct = Math.min(100, (len / CAPTION_LIMIT) * 100);
            const status =
              len === 0
                ? { label: "Start typing to see a live preview", tone: "text-muted-foreground" }
                : len < GMB_TRUNCATE
                  ? {
                      label: `Short — add ${GMB_TRUNCATE - len} more chars so it isn't truncated on mobile.`,
                      tone: "text-amber-500",
                    }
                  : len <= GMB_SWEET_MAX
                    ? { label: "Optimal length for Google Business Profile.", tone: "text-emerald-600 dark:text-emerald-400" }
                    : len <= CAPTION_LIMIT
                      ? { label: "Longer than recommended — Google trims to ~100 chars on mobile feeds.", tone: "text-amber-500" }
                      : { label: `Over the ${CAPTION_LIMIT}-char limit.`, tone: "text-red-500" };
            const truncated =
              len > GMB_TRUNCATE ? caption.slice(0, GMB_TRUNCATE).trimEnd() + "…" : caption;
            const previewImgs = Array.from(selectedImages)
              .map((id) => images.find((i) => i.id === id))
              .filter((i): i is ImageRow => !!i)
              .slice(0, 4);
            return (
              <section className="rounded-xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Live Google Business preview</div>
                    <div className="text-[11px] text-muted-foreground">
                      Updates as you type. Ideal length {GMB_SWEET_MIN}–{GMB_SWEET_MAX} characters.
                    </div>
                  </div>
                  <span className={`text-[11px] font-medium ${status.tone}`}>{status.label}</span>
                </div>

                {/* Segmented length meter */}
                <div className="mb-4">
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                    {/* sweet-spot band */}
                    <div
                      className="absolute inset-y-0 bg-emerald-500/20"
                      style={{
                        left: `${(GMB_SWEET_MIN / CAPTION_LIMIT) * 100}%`,
                        width: `${((GMB_SWEET_MAX - GMB_SWEET_MIN) / CAPTION_LIMIT) * 100}%`,
                      }}
                    />
                    {/* progress */}
                    <div
                      className={`absolute inset-y-0 left-0 transition-all ${
                        len > CAPTION_LIMIT
                          ? "bg-red-500"
                          : len >= GMB_SWEET_MIN && len <= GMB_SWEET_MAX
                            ? "bg-emerald-500"
                            : "bg-primary"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                    {/* truncation marker */}
                    <div
                      className="absolute inset-y-0 w-px bg-foreground/40"
                      style={{ left: `${(GMB_TRUNCATE / CAPTION_LIMIT) * 100}%` }}
                      title="Mobile truncation (~100 chars)"
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                    <span>0</span>
                    <span>~{GMB_TRUNCATE} (mobile cut-off)</span>
                    <span>
                      {GMB_SWEET_MIN}–{GMB_SWEET_MAX} ideal
                    </span>
                    <span>{CAPTION_LIMIT}</span>
                  </div>
                </div>

                {/* Mock GMB card */}
                <div className="rounded-lg border border-border bg-background p-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                      {(businessName || "B").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">
                        {businessName || "Your Business"}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {location?.label ?? "No location set"} · now
                      </div>
                    </div>
                    <div className="text-muted-foreground/60">⋯</div>
                  </div>

                  {previewImgs.length > 0 && (
                    <div
                      className={`mt-3 grid gap-1 overflow-hidden rounded ${
                        previewImgs.length === 1
                          ? "grid-cols-1"
                          : previewImgs.length === 2
                            ? "grid-cols-2"
                            : "grid-cols-2"
                      }`}
                    >
                      {previewImgs.map((img) => (
                        <SignedImage
                          key={img.id}
                          bucket="frames"
                          path={img.storage_path}
                          alt={img.name}
                          className="aspect-video w-full object-cover"
                        />
                      ))}
                    </div>
                  )}

                  <div
                    className="mt-3 whitespace-pre-wrap text-sm leading-relaxed"
                    dir={language === "ar" ? "rtl" : "ltr"}
                  >
                    {caption ? (
                      <>
                        {truncated}
                        {len > GMB_TRUNCATE && (
                          <button
                            type="button"
                            className="ml-1 text-primary hover:underline"
                            tabIndex={-1}
                          >
                            Read more
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="italic text-muted-foreground">
                        Your post preview will appear here…
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex items-center gap-4 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
                    <span>👍 Like</span>
                    <span>💬 Comment</span>
                    <span>↗ Share</span>
                  </div>
                </div>
              </section>
            );
          })()}

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

type HistoryPost = {
  id: string;
  caption: string;
  status: string;
  created_at: string;
  scheduled_at: string | null;
  location_label: string | null;
  primary_keyword_id: string | null;
  keywords: { phrase: string } | null;
};

function PostHistoryPanel() {
  const [range, setRange] = useState<7 | 14 | 28>(28);
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<HistoryPost[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const since = new Date(Date.now() - range * 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from("social_posts")
      .select(
        "id,caption,status,created_at,scheduled_at,location_label,primary_keyword_id,keywords:primary_keyword_id(phrase)",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        setPosts((data ?? []) as unknown as HistoryPost[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const totalPosts = posts.length;
  const sentCount = posts.filter((p) => p.status === "sent" || p.status === "queued").length;
  const failedCount = posts.filter((p) => p.status === "failed").length;

  const topicCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of posts) {
      const phrase = p.keywords?.phrase?.trim();
      const key = phrase && phrase.length ? phrase : "Untagged";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [posts]);

  const cityCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of posts) {
      const label = (p.location_label ?? "").trim();
      if (!label) continue;
      // Take the first component before a comma as the "city/area" name
      const city = label.split(",")[0].trim();
      if (!city) continue;
      map.set(city, (map.get(city) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [posts]);

  const topicMax = topicCounts[0]?.[1] ?? 1;
  const cityMax = cityCounts[0]?.[1] ?? 1;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <BarChart3 className="h-4 w-4 text-primary" /> Post history
            </div>
            <div className="text-xs text-muted-foreground">
              Track how many posts you've published, by topic and by area.
            </div>
          </div>
          <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
            {([7, 14, 28] as const).map((d) => {
              const active = range === d;
              return (
                <button
                  key={d}
                  onClick={() => setRange(d)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Last {d} days
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total posts" value={totalPosts} icon={TrendingUp} />
          <StatCard label="Sent / queued" value={sentCount} tone="ok" />
          <StatCard label="Failed" value={failedCount} tone={failedCount ? "bad" : "muted"} />
          <StatCard label="Unique cities" value={cityCounts.length} icon={MapPin} />
        </div>
      </section>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium">Topics</div>
            <div className="text-[11px] text-muted-foreground">
              {topicCounts.length} unique
            </div>
          </div>
          {loading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>
          ) : topicCounts.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              No posts in this window.
            </div>
          ) : (
            <ul className="space-y-2">
              {topicCounts.map(([topic, count]) => (
                <li key={topic} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{topic}</span>
                    <span className="tabular-nums text-muted-foreground">{count}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${(count / topicMax) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="h-4 w-4 text-primary" /> Locations
            </div>
            <div className="text-[11px] text-muted-foreground">
              {cityCounts.length} unique
            </div>
          </div>
          {loading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>
          ) : cityCounts.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              No location-tagged posts in this window.
            </div>
          ) : (
            <ul className="space-y-2">
              {cityCounts.map(([city, count]) => (
                <li key={city} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{city}</span>
                    <span className="tabular-nums text-muted-foreground">{count}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${(count / cityMax) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 text-sm font-medium">Recent posts</div>
        {loading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>
        ) : posts.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Nothing yet in the last {range} days.
          </div>
        ) : (
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Topic</th>
                  <th className="py-2 pr-3">City</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {posts.slice(0, 100).map((p) => {
                  const city = (p.location_label ?? "").split(",")[0].trim();
                  return (
                    <tr key={p.id} className="border-t border-border/60">
                      <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-2 pr-3">{p.keywords?.phrase ?? "—"}</td>
                      <td className="py-2 pr-3">{city || "—"}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            p.status === "sent"
                              ? "bg-emerald-500/15 text-emerald-500"
                              : p.status === "queued"
                                ? "bg-sky-500/15 text-sky-500"
                                : p.status === "failed"
                                  ? "bg-destructive/15 text-destructive"
                                  : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "default" | "ok" | "bad" | "muted";
}) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-500"
      : tone === "bad"
        ? "text-destructive"
        : tone === "muted"
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {label}
        </div>
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}
