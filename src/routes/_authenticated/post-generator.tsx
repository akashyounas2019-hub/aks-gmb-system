import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  Send,
  Sparkles,
  X,
  Loader2,
  ImageIcon,
  KeyRound,
  Plus,
  ChevronDown,
  CheckCircle2,
  Eye,
  PenSquare,
  Pencil,
  ExternalLink,
  FileText,
  Inbox,
  Save,
  LayoutTemplate,
  Trash2,
  BarChart3,
  MapPin,
  TrendingUp,
  Smile,
  FolderOpen,
  Folder,
  Calendar,
  CalendarClock,
  Info,
} from "lucide-react";
import { PostStoragePanel } from "@/routes/_authenticated/post-storage";
import { upsertDraft } from "@/lib/post-drafts.functions";

import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { SignedImage, useSignedUrl } from "@/components/SignedImage";
import { openImagePreview } from "@/components/ImageLightbox";
import { GeoTaggedBadge } from "@/components/GeoTaggedBadge";
import { PublishedBadge } from "@/components/PublishedBadge";
import { LocationPicker, type PickedLocation } from "@/components/LocationPicker";
import { composePost, sendPostToSocialPlanner } from "@/lib/post-generator.functions";
import { readGps } from "@/lib/exif-geotag";

export const Route = createFileRoute("/_authenticated/post-generator")({
  component: () => <PostGeneratorPage />,
});

export type SocialPlatform = "gmb" | "facebook" | "instagram" | "linkedin" | "twitter";

type KeywordRow = {
  id: string;
  phrase: string;
  cluster: string | null;
  volume: number | null;
  folder_id: string | null;
  intent: string | null;
  created_at: string;
};
type KeywordFolder = {
  id: string;
  name: string;
  color: string | null;
  parent_id: string | null;
};
type ImageRow = {
  id: string;
  name: string;
  title?: string | null;
  description?: string | null;
  storage_path: string;
  posted_at: string | null;
  lat: number | null;
  lng: number | null;
  folder_id?: string | null;
  created_at?: string;
};
type ImageFolder = {
  id: string;
  name: string;
};

// Dubai-area names the business serves — 7-8 are randomly picked per
// generated post and mentioned as a "Serving:" line in the caption.
const SERVING_AREAS = [
  "Abu Hail",
  "Al Barsha",
  "Al Barsha Heights",
  "Al Furjan",
  "Al Jadaf",
  "Al Khalil Gate",
  "Al Mamzar",
  "Al Nahda",
  "Al Qusais",
  "Al Rigga",
  "Al Warqa",
  "Al Wasl",
  "Akoya",
  "Arabian Ranches",
  "Arjaan",
  "Boulevard",
  "Burj Khalifa",
  "Business Bay",
  "DIFC",
  "Discovery Gardens",
  "Dubai Downtown",
  "Dubai Falcon City",
  "Dubai Festival City",
  "Dubai Health Care City",
  "Dubai Investment Park",
  "Dubai Land",
  "Dubai Marina",
  "Emirates Hills",
  "IMPZ",
  "International City",
  "Internet City",
  "JLT",
  "JVC",
  "Jumeirah",
  "Jumeirah Beach Residence",
  "Jumeirah Park",
  "Layan Community",
  "Meadows",
  "Meydan",
  "Mirdiff",
  "Mirdiff Hills",
  "Motor City",
  "Mudon",
  "Nad Al Hammar",
  "Nad Al Sheba",
  "Palm Jumeirah",
  "Rashidiya",
  "Sheikh Zayed Road",
  "Sport City",
  "Studio City",
  "Umm Suqeim",
  "Uptown Mirdiff",
] as const;

function pickServingAreas(): string[] {
  const count = 7 + Math.round(Math.random());
  const pool = [...SERVING_AREAS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

/** Small selected-image thumb with an "i" button that opens the large preview. */
function SelectedImageChip({ img, onOpenDetails }: { img: ImageRow; onOpenDetails: () => void }) {
  const url = useSignedUrl("frames", img.storage_path);
  const label = img.title || img.name;
  return (
    <div className="relative h-10 w-10 shrink-0">
      <button
        type="button"
        onClick={onOpenDetails}
        title={`${label} — details`}
        className="h-full w-full overflow-hidden rounded-md border border-primary/50"
      >
        <SignedImage
          bucket="frames"
          path={img.storage_path}
          alt={img.name}
          expandable={false}
          className="h-full w-full object-cover"
        />
      </button>
      <button
        type="button"
        onClick={() => url && openImagePreview(url, label)}
        disabled={!url}
        aria-label={`Preview ${label}`}
        title="Preview"
        className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full bg-primary text-primary-foreground shadow ring-2 ring-card hover:opacity-90 disabled:opacity-50"
      >
        <Info className="h-3 w-3" />
      </button>
    </div>
  );
}

/** Date → value for <input type="datetime-local"> in local time. */
function toLocalInputValue(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function PostGeneratorPage({
  defaultPlatform,
  pageTitle,
}: { defaultPlatform?: SocialPlatform; pageTitle?: string } = {}) {
  const compose = useServerFn(composePost);
  const send = useServerFn(sendPostToSocialPlanner);
  const saveDraft = useServerFn(upsertDraft);
  const [tab, setTab] = useState<"compose" | "storage" | "history" | "templates">("compose");
  const [saving, setSaving] = useState(false);

  // Keywords — manual list is primary; CSV imports come from the `keywords` table
  const [manualKw, setManualKw] = useState<string[]>([]);
  const [manualInput, setManualInput] = useState("");
  const [importedKw, setImportedKw] = useState<KeywordRow[]>([]);
  const [keywordFolders, setKeywordFolders] = useState<KeywordFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>("all");
  const [importOpen, setImportOpen] = useState(false);
  const [importFilter, setImportFilter] = useState("");

  const [images, setImages] = useState<ImageRow[]>([]);
  const [imageFolders, setImageFolders] = useState<ImageFolder[]>([]);
  const [selectedImageFolderId, setSelectedImageFolderId] = useState<string>("all");
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [activeDetailId, setActiveDetailId] = useState<string | null>(null);
  const [editingImage, setEditingImage] = useState<ImageRow | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);

  const [location, setLocation] = useState<PickedLocation | null>(null);
  const [servingAreas, setServingAreas] = useState<string[]>(() => pickServingAreas());
  const [llm, setLlm] = useState<"gemini" | "chatgpt" | "anthropic" | "openrouter" | "aks">(
    "gemini",
  );
  const [businessName, setBusinessName] = useState("");

  const [scheduledAt, setScheduledAt] = useState("");
  const [networks, setNetworks] = useState<Array<SocialPlatform>>(
    defaultPlatform ? [defaultPlatform] : ["gmb"],
  );
  const isSocial = defaultPlatform === "facebook" || defaultPlatform === "instagram";
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const [mentionInput, setMentionInput] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  // Every time the Preview popup opens, start with the mobile-truncated view.
  useEffect(() => {
    if (previewOpen) setPreviewExpanded(false);
  }, [previewOpen]);

  const [caption, setCaption] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);

  const captionMirrorRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const [symbolsOpen, setSymbolsOpen] = useState(false);
  const symbolsPopupRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const importPopupRef = useRef<HTMLDivElement>(null);

  // Post-body templates persisted in localStorage
  type PostTemplate = { id: string; name: string; body: string; folder?: string };
  const TEMPLATES_KEY = "post-generator:templates";
  const TEMPLATE_FOLDERS_KEY = "post-generator:template-folders";
  const [templates, setTemplates] = useState<PostTemplate[]>([]);
  const [templateFolders, setTemplateFolders] = useState<string[]>([]);
  // Templates used to live in a modal; they are now a top-level tab. Keep the
  // old open/close API so every existing call site keeps working.
  const templatesOpen = tab === "templates";
  const setTemplatesOpen = (open: boolean) => setTab(open ? "templates" : "compose");
  // "__all" = every template; "" = uncategorized
  const [activeFolder, setActiveFolder] = useState<string>("__all");
  const [templateSearch, setTemplateSearch] = useState("");
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [previewingTemplate, setPreviewingTemplate] = useState<PostTemplate | null>(null);
  const [viewingTemplate, setViewingTemplate] = useState<PostTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<PostTemplate | null>(null);
  // Template used as a stylistic guide only — the AI generates a new caption
  // in that style. Set from the template preview modal, cleared with a button.
  const [styleTemplate, setStyleTemplate] = useState<PostTemplate | null>(null);
  const [newTplName, setNewTplName] = useState("");
  const [newTplBody, setNewTplBody] = useState("");
  const [newTplFolder, setNewTplFolder] = useState("");
  const [editTplName, setEditTplName] = useState("");
  const [editTplBody, setEditTplBody] = useState("");
  const [editTplFolder, setEditTplFolder] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TEMPLATES_KEY);
      if (raw) setTemplates(JSON.parse(raw) as PostTemplate[]);
      const rawF = localStorage.getItem(TEMPLATE_FOLDERS_KEY);
      if (rawF) setTemplateFolders(JSON.parse(rawF) as string[]);
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
  function persistFolders(next: string[]) {
    setTemplateFolders(next);
    try {
      localStorage.setItem(TEMPLATE_FOLDERS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  function openTemplatesModal() {
    setTemplatesOpen(true);
    setTemplateSearch("");
    setPreviewingTemplate(null);
    setViewingTemplate(null);
    setEditingTemplate(null);
    setCreatingTemplate(false);
  }
  function beginViewTemplate(t: PostTemplate) {
    setViewingTemplate(t);
    setEditingTemplate(null);
    setCreatingTemplate(false);
    setPreviewingTemplate(null);
  }
  function beginEditTemplate(t: PostTemplate) {
    setEditingTemplate(t);
    setEditTplName(t.name);
    setEditTplBody(t.body);
    setEditTplFolder(t.folder ?? "");
    setViewingTemplate(null);
    setCreatingTemplate(false);
    setPreviewingTemplate(null);
  }
  function saveEditedTemplate() {
    if (!editingTemplate) return;
    const name = editTplName.trim();
    const body = editTplBody.trim();
    if (!name) {
      toast.error("Give the template a name");
      return;
    }
    if (!body) {
      toast.error("Template body is empty");
      return;
    }
    const updated: PostTemplate = {
      ...editingTemplate,
      name,
      body,
      folder: editTplFolder || undefined,
    };
    persistTemplates(templates.map((t) => (t.id === editingTemplate.id ? updated : t)));
    if (styleTemplate?.id === editingTemplate.id) {
      setStyleTemplate(updated);
    }
    setEditingTemplate(null);
    toast.success("Template updated");
  }
  function beginCreateTemplate(seedFromCaption: boolean) {
    setCreatingTemplate(true);
    setEditingTemplate(null);
    setViewingTemplate(null);
    setPreviewingTemplate(null);
    setNewTplName("");
    setNewTplBody(seedFromCaption ? caption : "");
    setNewTplFolder(activeFolder === "__all" ? "" : activeFolder);
  }
  function saveNewTemplate() {
    const name = newTplName.trim();
    const body = newTplBody.trim();
    if (!name) {
      toast.error("Give the template a name");
      return;
    }
    if (!body) {
      toast.error("Template body is empty");
      return;
    }
    persistTemplates([
      { id: crypto.randomUUID(), name, body, folder: newTplFolder || undefined },
      ...templates,
    ]);
    setCreatingTemplate(false);
    setNewTplName("");
    setNewTplBody("");
    toast.success("Template saved");
  }
  function saveCurrentAsTemplate() {
    if (!caption.trim()) {
      toast.error("Description is empty");
      return;
    }
    setTemplatesOpen(true);
    beginCreateTemplate(true);
    setNewTplName(caption.trim().slice(0, 40));
  }
  function applyTemplate(t: PostTemplate) {
    // Open the preview step; actual replacement happens in confirmApplyTemplate.
    setPreviewingTemplate(t);
  }
  function confirmApplyTemplate() {
    if (!previewingTemplate) return;
    // Templates now act as a stylistic reference only — they never overwrite
    // the description. The AI will produce a fresh caption in this style on
    // the next Generate.
    setStyleTemplate(previewingTemplate);
    const name = previewingTemplate.name;
    setPreviewingTemplate(null);
    setTemplatesOpen(false);
    toast.success(
      `Style reference set: "${name}". Click Generate to write a new draft in this style.`,
    );
  }
  function deleteTemplate(id: string) {
    if (!window.confirm("Delete this template?")) return;
    persistTemplates(templates.filter((t) => t.id !== id));
    if (viewingTemplate?.id === id) setViewingTemplate(null);
    if (editingTemplate?.id === id) setEditingTemplate(null);
    if (previewingTemplate?.id === id) setPreviewingTemplate(null);
    if (styleTemplate?.id === id) setStyleTemplate(null);
    toast.success("Template deleted");
  }
  function moveTemplate(id: string, folder: string) {
    persistTemplates(
      templates.map((t) => (t.id === id ? { ...t, folder: folder || undefined } : t)),
    );
  }
  function addFolder() {
    const name = window.prompt("New folder name")?.trim();
    if (!name) return;
    if (templateFolders.includes(name)) {
      toast.error("Folder already exists");
      return;
    }
    persistFolders([...templateFolders, name]);
    setActiveFolder(name);
  }
  function renameFolder(oldName: string) {
    const name = window.prompt("Rename folder", oldName)?.trim();
    if (!name || name === oldName) return;
    if (templateFolders.includes(name)) {
      toast.error("Folder already exists");
      return;
    }
    persistFolders(templateFolders.map((f) => (f === oldName ? name : f)));
    persistTemplates(templates.map((t) => (t.folder === oldName ? { ...t, folder: name } : t)));
    if (activeFolder === oldName) setActiveFolder(name);
  }
  function removeFolder(name: string) {
    if (
      !window.confirm(`Delete folder "${name}"? Templates inside will be moved to Uncategorized.`)
    )
      return;
    persistFolders(templateFolders.filter((f) => f !== name));
    persistTemplates(templates.map((t) => (t.folder === name ? { ...t, folder: undefined } : t)));
    if (activeFolder === name) setActiveFolder("__all");
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
      const incoming: unknown = Array.isArray(parsed) ? parsed : parsed?.templates;
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

  // Close import popup on outside click; templates use a modal (Esc closes it).
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (importOpen && importPopupRef.current && !importPopupRef.current.contains(target)) {
        setImportOpen(false);
      }
      if (symbolsOpen && symbolsPopupRef.current && !symbolsPopupRef.current.contains(target)) {
        setSymbolsOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (symbolsOpen) setSymbolsOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [importOpen, symbolsOpen]);

  const CAPTION_LIMIT = 1500;
  const captionLen = caption.length;
  // How many of the user's keywords already appear in the description.
  const keywordsUsed = useMemo(() => {
    const body = caption.toLowerCase();
    return manualKw.filter((k) => body.includes(k.toLowerCase())).length;
  }, [caption, manualKw]);
  const captionOver = captionLen > CAPTION_LIMIT;

  async function reloadImages() {
    try {
      // Exclude images tagged as published or posted (which belong in the Published tab)
      const { data: tagRows } = await supabase
        .from("image_tags")
        .select("image_id, tag_id, tags(slug)");
      const publishedTagIds = new Set<string>();
      for (const r of (tagRows as Array<{ image_id: string; tags?: { slug: string } | null }>) ??
        []) {
        if (r.tags?.slug === "published" || r.tags?.slug === "posted") {
          publishedTagIds.add(r.image_id);
        }
      }

      // Query all geo-tagged unpublished non-trashed images across all folders
      const { data, error } = await supabase
        .from("images")
        .select("id,name,title,description,storage_path,posted_at,lat,lng,folder_id,created_at")
        .not("lat", "is", null)
        .not("lng", "is", null)
        .is("posted_at", null)
        .is("deleted_at", null)
        .not("storage_path", "ilike", "%/social-%")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (error) console.error("Error loading images:", error);

      const filtered = ((data ?? []) as ImageRow[]).filter((img) => !publishedTagIds.has(img.id));
      setImages(filtered);
    } catch (e) {
      console.error("reloadImages error:", e);
    }
  }

  useEffect(() => {
    Promise.all([
      supabase
        .from("keywords")
        .select("id,phrase,cluster,volume,folder_id,intent,created_at")
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("keyword_folders" as any)
        .select("id,name,color,parent_id")
        .order("position", { ascending: true }),
      supabase.from("image_folders").select("id,name").order("name", { ascending: true }),
    ]).then(([{ data: kws }, { data: fs }, { data: imgFs }]) => {
      setImportedKw((kws ?? []) as KeywordRow[]);
      setKeywordFolders((fs ?? []) as unknown as KeywordFolder[]);
      setImageFolders((imgFs ?? []) as ImageFolder[]);
    });
    reloadImages();
  }, []);

  // Map folder IDs to folder names for category badging and filtering
  const folderMap = useMemo(() => {
    const map = new Map<string, string>();
    keywordFolders.forEach((f) => map.set(f.id, f.name));
    return map;
  }, [keywordFolders]);

  const imageFolderMap = useMemo(() => {
    const map = new Map<string, string>();
    imageFolders.forEach((f) => map.set(f.id, f.name));
    return map;
  }, [imageFolders]);

  const visibleImages = useMemo(() => {
    return images.filter((img) => {
      if (selectedImageFolderId === "all") return true;
      if (selectedImageFolderId === "unfiled") return !img.folder_id;
      return img.folder_id === selectedImageFolderId;
    });
  }, [images, selectedImageFolderId]);

  const selectedImagesList = useMemo(() => {
    return Array.from(selectedImages)
      .map((id) => images.find((i) => i.id === id))
      .filter(Boolean) as ImageRow[];
  }, [selectedImages, images]);

  const activeDetailImage = useMemo(() => {
    if (selectedImagesList.length === 0) return null;
    if (activeDetailId) {
      const found = selectedImagesList.find((i) => i.id === activeDetailId);
      if (found) return found;
    }
    return selectedImagesList[0];
  }, [selectedImagesList, activeDetailId]);

  const filteredImportKw = useMemo(() => {
    const q = importFilter.trim().toLowerCase();
    const already = new Set(manualKw.map((k) => k.toLowerCase()));
    return importedKw.filter((k) => {
      if (already.has(k.phrase.toLowerCase())) return false;
      if (selectedFolderId === "unfiled" && k.folder_id) return false;
      if (
        selectedFolderId !== "all" &&
        selectedFolderId !== "unfiled" &&
        k.folder_id !== selectedFolderId
      )
        return false;
      if (!q) return true;
      const folderName = k.folder_id ? (folderMap.get(k.folder_id) ?? "") : "";
      const hay = `${k.phrase} ${k.cluster ?? ""} ${folderName}`.toLowerCase();
      return hay.includes(q);
    });
  }, [importedKw, importFilter, manualKw, selectedFolderId, folderMap]);

  /** Latest scheduled_at on the user's schedule that is still in the future. */
  async function latestFutureScheduledAt(): Promise<Date | null> {
    const { data } = await supabase
      .from("social_posts")
      .select("scheduled_at")
      .not("scheduled_at", "is", null)
      .gt("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: false })
      .limit(1);
    const iso = data?.[0]?.scheduled_at;
    return iso ? new Date(iso) : null;
  }

  async function scheduleDaysAfterLastPost(days: number) {
    const last = await latestFutureScheduledAt().catch(() => null);
    const d = new Date(last ?? Date.now());
    d.setDate(d.getDate() + days);
    if (!last) d.setHours(10, 0, 0, 0);
    setScheduledAt(toLocalInputValue(d));
    toast.info(
      last
        ? `Set to ${days} days after your last scheduled post (${last.toLocaleString()}).`
        : `No upcoming posts — set to ${days} days from today.`,
    );
  }

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
      for (const p of parts)
        if (!seen.has(p.toLowerCase())) {
          next.push(p);
          seen.add(p.toLowerCase());
        }
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
      for (const p of parts)
        if (!seen.has(p.toLowerCase())) {
          next.push(p);
          seen.add(p.toLowerCase());
        }
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
      if (n.has(id)) {
        n.delete(id);
      } else if (n.size < 4) {
        n.add(id);
        setActiveDetailId(id);
      } else {
        toast.info("Max 4 images per post");
      }
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
          llm,

          businessName: businessName || undefined,
          styleReference: styleTemplate
            ? { name: styleTemplate.name, body: styleTemplate.body }
            : undefined,
          servingAreas: isSocial ? undefined : servingAreas,
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
    // Scheduling into the past would never dispatch — block it up front.
    if (scheduledAt && new Date(scheduledAt).getTime() <= Date.now()) {
      toast.error("Pick a future date and time — posts can't be scheduled in the past.");
      return;
    }
    setSending(true);
    try {
      const res = await send({
        data: {
          caption,
          title: (manualKw[0] ?? businessName ?? caption.slice(0, 60).trim()) || undefined,
          tags: manualKw.slice(0, 20),
          imageIds: Array.from(selectedImages),
          locationLabel: location?.label || undefined,
          lat: location?.lat ?? undefined,
          lng: location?.lng ?? undefined,
          primaryKeyword: manualKw[0] || undefined,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
          networks: networks.length ? networks : ["gmb"],
        },
      });
      if (res.status === "queued") {
        if ("warning" in res && res.warning) {
          toast.success(`Post saved and queued in Scheduler!`, {
            description: res.warning as string,
            duration: 5000,
          });
        } else {
          const formattedTime = scheduledAt
            ? new Date(scheduledAt).toLocaleString()
            : "the scheduled queue";
          toast.success(`Post successfully scheduled for ${formattedTime}!`);
        }
      } else if (res.status === "scheduled") {
        toast.success(
          `Scheduled in GoHighLevel for ${new Date(scheduledAt).toLocaleString()} — GHL will publish it to Google Business.`,
        );
      } else {
        toast.success("Sent to GHL Social Planner successfully!");
      }
      setSelectedImages(new Set());
      reloadImages();
      setPreviewOpen(false);
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
          imageIds: Array.from(selectedImages),
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
        const { error: dbErr } = await supabase.from("images").insert({
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

  // Symbol picker — cleaning-oriented glyphs grouped for quick browsing.
  const SYMBOL_GROUPS: Array<{ label: string; symbols: string[] }> = [
    {
      label: "Check marks & bullets",
      symbols: ["✅", "✔️", "☑️", "•", "◦", "▪️", "▫️", "→", "➡️", "»", "★", "☆"],
    },
    {
      label: "Stars & ratings",
      symbols: ["⭐", "🌟", "✨", "💫", "🏆", "🥇", "👑", "💯", "🔥", "❤️"],
    },
    {
      label: "Location & contact",
      symbols: ["📍", "🗺️", "🏠", "🏢", "📞", "☎️", "📱", "✉️", "🌐", "🕒", "📅", "💬"],
    },
    {
      label: "What's included",
      symbols: ["🧾", "📋", "📝", "🎁", "💼", "🛠️", "🧰", "🔧", "⚙️", "🔑", "🎯", "✔"],
    },
    {
      label: "Cleaning & sparkle",
      symbols: ["🧼", "🧽", "🧴", "🧻", "🧹", "🪣", "🚿", "🛁", "🛋️", "🛏️", "🪟", "💧", "🫧", "🌿"],
    },
    {
      label: "Trust & offers",
      symbols: ["💰", "💵", "🏷️", "🎉", "🎊", "⚡", "⏰", "⏳", "🚀", "🛡️", "🔒", "✅"],
    },
  ];

  function insertSymbol(sym: string) {
    const el = captionRef.current;
    if (!el) {
      setCaption((prev) => prev + sym);
      return;
    }
    const start = el.selectionStart ?? caption.length;
    const end = el.selectionEnd ?? caption.length;
    const next = caption.slice(0, start) + sym + caption.slice(end);
    setCaption(next);
    // Restore caret after React re-render.
    requestAnimationFrame(() => {
      if (!captionRef.current) return;
      const pos = start + sym.length;
      captionRef.current.focus();
      captionRef.current.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 md:px-8 md:py-6">
      {/* Only embedders that pass an explicit title get a heading; the GMB
          screen itself goes straight to the tabs. */}
      {pageTitle && <h1 className="mb-4 text-2xl">{pageTitle}</h1>}

      {/* Top tabs */}
      <div className="border-b border-border">
        <nav
          role="tablist"
          aria-label="Post generator sections"
          className="-mb-px flex flex-wrap gap-1 overflow-x-auto"
        >
          {[
            { id: "compose" as const, label: "Compose", icon: PenSquare },
            { id: "storage" as const, label: "Post Storage", icon: Inbox },
            { id: "history" as const, label: "History", icon: BarChart3 },
            { id: "templates" as const, label: "Templates", icon: LayoutTemplate },
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
      ) : tab === "templates" ? null : (
        <div className="mt-5 space-y-5">
          {/* Row 1 — keywords | geo-tagged images, 50/50 */}
          <div className="grid items-stretch gap-5 lg:grid-cols-2">
            <div className="flex flex-col gap-5">
              {/* Keywords — manual first, CSV import as dropdown */}
              <section className="flex-1 rounded-xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <KeyRound className="h-4 w-4 text-primary" /> Keywords
                    {isSocial && (
                      <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                        Optional
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">({manualKw.length} added)</span>
                  </div>
                  <div className="relative" ref={importPopupRef}>
                    <button
                      onClick={() => setImportOpen((v) => !v)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-gradient-to-br from-primary/15 to-primary/5 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm transition hover:border-primary hover:from-primary/25 hover:to-primary/10 hover:shadow"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      Keyword Library
                      <ChevronDown className="h-3 w-3 opacity-70" />
                    </button>
                    {importOpen && (
                      <div className="absolute right-0 z-20 mt-1 w-96 rounded-xl border border-border bg-popover p-3 shadow-2xl">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-semibold">
                            <Folder className="h-3.5 w-3.5 text-primary" /> Keyword Library
                          </div>
                          <Link
                            to="/keywords"
                            className="text-[11px] font-medium text-primary hover:underline"
                          >
                            Manage Library →
                          </Link>
                        </div>

                        <div className="mb-2.5 flex gap-2">
                          <input
                            autoFocus
                            value={importFilter}
                            onChange={(e) => setImportFilter(e.target.value)}
                            placeholder="Search phrase or category…"
                            className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                          />
                          <select
                            value={selectedFolderId}
                            onChange={(e) => setSelectedFolderId(e.target.value)}
                            className="max-w-[130px] truncate rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                            title="Filter by Category/Folder"
                          >
                            <option value="all">All Folders ({importedKw.length})</option>
                            <option value="unfiled">Uncategorized</option>
                            {keywordFolders.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="max-h-72 overflow-y-auto space-y-1 pr-0.5">
                          {filteredImportKw.length === 0 ? (
                            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                              {importedKw.length === 0
                                ? "No keywords in library yet. Add or import in Keywords tab."
                                : "No keywords match your search or category filter."}
                            </div>
                          ) : (
                            filteredImportKw.slice(0, 150).map((k) => {
                              const folderName = k.folder_id ? folderMap.get(k.folder_id) : null;
                              return (
                                <button
                                  key={k.id}
                                  onClick={() => {
                                    addManualKw(k.phrase);
                                  }}
                                  className="group flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition hover:bg-accent"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate font-medium">{k.phrase}</div>
                                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                      {folderName && (
                                        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                                          {folderName}
                                        </span>
                                      )}
                                      {k.cluster && <span>{k.cluster}</span>}
                                    </div>
                                  </div>
                                  {k.volume ? (
                                    <span className="text-[10px] text-muted-foreground group-hover:text-foreground">
                                      {k.volume.toLocaleString()} vol
                                    </span>
                                  ) : null}
                                </button>
                              );
                            })
                          )}
                        </div>

                        {filteredImportKw.length > 0 && (
                          <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2 text-[11px] text-muted-foreground">
                            <span>
                              Showing {Math.min(filteredImportKw.length, 150)} of{" "}
                              {filteredImportKw.length}
                            </span>
                            <button
                              onClick={() => {
                                filteredImportKw.slice(0, 20).forEach((k) => addManualKw(k.phrase));
                                setImportOpen(false);
                              }}
                              className="font-medium text-primary hover:underline"
                            >
                              + Add top 20 to post
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Tag input — keywords are added automatically on Enter,
                      comma, Tab, paste or when the field loses focus. */}
                <div className="flex max-h-28 flex-wrap items-center gap-1.5 overflow-y-auto rounded-lg border border-border bg-background px-2 py-1.5 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/40">
                  {manualKw.map((k) => (
                    <span
                      key={k}
                      className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs text-primary"
                    >
                      {k}
                      <button
                        onClick={() => removeManualKw(k)}
                        className="rounded-full p-0.5 hover:bg-primary/20"
                        aria-label={`Remove ${k}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    value={manualInput}
                    aria-label="Add keyword"
                    onChange={(e) => {
                      const v = e.target.value;
                      // A typed/pasted separator commits everything before it.
                      const lastSep = Math.max(v.lastIndexOf(","), v.lastIndexOf("\n"));
                      if (lastSep >= 0) {
                        addManualKw(v.slice(0, lastSep));
                        setManualInput(v.slice(lastSep + 1).trimStart());
                      } else {
                        setManualInput(v);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || (e.key === "Tab" && manualInput.trim())) {
                        e.preventDefault();
                        addManualKw(manualInput);
                      } else if (e.key === "Backspace" && !manualInput && manualKw.length > 0) {
                        removeManualKw(manualKw[manualKw.length - 1]);
                      }
                    }}
                    onBlur={() => manualInput.trim() && addManualKw(manualInput)}
                    placeholder={
                      manualKw.length ? "Add another…" : "Type a keyword and press Enter or comma"
                    }
                    className="min-w-[160px] flex-1 bg-transparent px-1 py-1 text-sm outline-none"
                  />
                </div>
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
            </div>

            {/* Images picker — preview + View all */}
            <section className="flex flex-col rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ImageIcon className="h-4 w-4 text-primary" /> Geo-tagged images
                  <span className="text-xs text-muted-foreground">({selectedImages.size}/4)</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setGalleryOpen(true)}
                    disabled={images.length === 0}
                    className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-40"
                  >
                    <ImageIcon className="h-3.5 w-3.5" /> Select Images
                  </button>
                  {/* Template + LLM (merged from the old "Template & AI model" card) */}
                  <select
                    value={styleTemplate?.id ?? ""}
                    onChange={(e) => {
                      const t = templates.find((x) => x.id === e.target.value);
                      setStyleTemplate(t ?? null);
                    }}
                    className="max-w-[170px] truncate rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
                    title="Template (structure only) — the AI copies its format, not its wording"
                    aria-label="Template"
                  >
                    <option value="">No template</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={llm}
                    onChange={(e) => setLlm(e.target.value as typeof llm)}
                    className="rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
                    title="AI model used by Generate"
                    aria-label="LLM"
                  >
                    <option value="gemini">Gemini</option>
                    <option value="chatgpt">ChatGPT</option>
                    <option value="anthropic">Claude</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="aks">AKS Cloud</option>
                  </select>
                  {imageFolders.length > 0 && (
                    <select
                      value={selectedImageFolderId}
                      onChange={(e) => setSelectedImageFolderId(e.target.value)}
                      className="rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
                      title="Filter by Folder"
                    >
                      <option value="all">All Folders ({images.length})</option>
                      <option value="unfiled">Uncategorized</option>
                      {imageFolders.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  )}
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

              {/* Selected images — small thumbs; "i" opens a large preview */}
              <div className="flex min-h-[42px] flex-1 items-center">
                {selectedImagesList.length > 0 ? (
                  <div className="flex min-w-0 flex-wrap gap-2">
                    {selectedImagesList.map((img) => (
                      <SelectedImageChip
                        key={img.id}
                        img={img}
                        onOpenDetails={() => {
                          setActiveDetailId(img.id);
                          setGalleryOpen(true);
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {images.length === 0
                      ? "No geo-tagged images yet — geo-tag images in the library first."
                      : `No images selected (max 4) · ${visibleImages.length} available.`}
                  </span>
                )}
              </div>
            </section>
          </div>

          {/* Row 3 — Description (full width) with the Generate action in its header */}
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <div className="text-sm font-medium">Description</div>
                {styleTemplate && (
                  <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 py-0.5 pl-2 pr-1 text-[11px] text-primary">
                    <LayoutTemplate className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      Template: <strong>{styleTemplate.name}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setStyleTemplate(null)}
                      className="rounded-full p-0.5 hover:bg-primary/20"
                      aria-label="Clear template"
                      title="Clear template"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={copyOut}
                  disabled={!caption}
                  className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-40"
                >
                  <Copy className="h-3 w-3" /> Copy
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {generating ? "Generating…" : "Generate with AI"}
                </button>
              </div>
            </div>

            <div className="relative">
              {/* Mirror layer — renders the text with the over-limit slice
                highlighted in red. Sits behind a transparent-text textarea. */}
              <div
                aria-hidden
                ref={captionMirrorRef}
                dir="ltr"
                className={`pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded border border-transparent p-3 text-sm text-left`}
                style={{ fontFamily: "inherit", lineHeight: "1.5" }}
              >
                {caption.length <= CAPTION_LIMIT ? (
                  <>
                    {caption}
                    {/* trailing space keeps last line height stable */}
                    {"\u200b"}
                  </>
                ) : (
                  <>
                    <span>{caption.slice(0, CAPTION_LIMIT)}</span>
                    <span className="rounded-sm bg-red-500/25 text-red-500">
                      {caption.slice(CAPTION_LIMIT)}
                    </span>
                    {"\u200b"}
                  </>
                )}
              </div>
              <textarea
                ref={captionRef}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                onScroll={(e) => {
                  if (captionMirrorRef.current) {
                    captionMirrorRef.current.scrollTop = e.currentTarget.scrollTop;
                  }
                }}
                rows={10}
                dir="ltr"
                aria-invalid={captionOver}
                placeholder="Click Generate with AI to draft a post, then edit here."
                spellCheck
                style={{ lineHeight: "1.5" }}
                className={`relative w-full rounded border bg-transparent p-3 text-sm text-transparent caret-foreground outline-none transition selection:bg-primary/25 selection:text-transparent ${
                  captionOver
                    ? "border-red-500 focus:ring-2 focus:ring-red-500/40"
                    : "border-border focus:ring-2 focus:ring-primary/40"
                }`}
              />
            </div>

            {/* Symbol picker */}
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="relative" ref={symbolsPopupRef}>
                <button
                  type="button"
                  onClick={() => setSymbolsOpen((v) => !v)}
                  aria-expanded={symbolsOpen}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
                >
                  <Smile className="h-3.5 w-3.5" /> Insert symbol
                  <ChevronDown className="h-3 w-3 opacity-70" />
                </button>
                {symbolsOpen && (
                  <div className="absolute left-0 top-full z-30 mt-1.5 max-h-[420px] w-[360px] overflow-y-auto rounded-xl border border-border bg-popover p-3 shadow-xl">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-xs font-semibold">Insert a symbol</div>
                      <button
                        onClick={() => setSymbolsOpen(false)}
                        aria-label="Close"
                        className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="space-y-3">
                      {SYMBOL_GROUPS.map((g) => (
                        <div key={g.label}>
                          <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                            {g.label}
                          </div>
                          <div className="grid grid-cols-8 gap-1">
                            {g.symbols.map((s, i) => (
                              <button
                                key={`${g.label}-${i}`}
                                type="button"
                                onClick={() => insertSymbol(s)}
                                title={`Insert ${s}`}
                                className="flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-lg leading-none transition hover:border-primary/40 hover:bg-primary/10"
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-[10px] text-muted-foreground">
                      Click a symbol to insert at the cursor position.
                    </p>
                  </div>
                )}
              </div>
              {/* Quick-insert row — most-used cleaning glyphs */}
              <div className="hidden items-center gap-1 sm:flex">
                {["✅", "⭐", "📍", "🧼", "✨", "🔥"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => insertSymbol(s)}
                    title={`Insert ${s}`}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-base leading-none hover:border-primary/40 hover:bg-primary/10"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span
                className={
                  captionOver ? "font-medium text-red-500" : "text-xs text-muted-foreground"
                }
              >
                {captionOver
                  ? `Post body exceeds the ${CAPTION_LIMIT}-character limit. Trim ${captionLen - CAPTION_LIMIT} character${captionLen - CAPTION_LIMIT === 1 ? "" : "s"} to send.`
                  : "Google Business Profile allows up to 1,500 characters per post."}
              </span>
              <div className="flex items-center gap-2">
                {manualKw.length > 0 && (
                  <span
                    className={`rounded-md px-2 py-0.5 font-semibold tabular-nums ${
                      keywordsUsed === manualKw.length
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    }`}
                    title="Keywords from your list that appear in the description"
                  >
                    Keywords {keywordsUsed}/{manualKw.length}
                  </span>
                )}
                <span
                  className={`rounded-md px-2 py-0.5 font-mono font-semibold tabular-nums ${
                    captionOver
                      ? "bg-red-500/15 text-red-500"
                      : captionLen > CAPTION_LIMIT - 100
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        : "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                  }`}
                  title="Characters used"
                >
                  {captionLen}/{CAPTION_LIMIT}
                </span>
              </div>
            </div>
          </section>

          {/* Row 4 — publish & schedule (preview lives in the Preview popup) */}
          {/* Publish & Schedule */}
          <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Send className="h-4 w-4 text-primary" /> Publish &amp; Schedule
              </div>
              {scheduledAt && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                  <CalendarClock className="h-3 w-3" />
                  {new Date(scheduledAt).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>

            {/* Schedule timing box */}
            <div className="mb-4 rounded-lg border border-border/80 bg-background/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                  Schedule publication (optional)
                </label>
                {scheduledAt && (
                  <button
                    type="button"
                    onClick={() => setScheduledAt("")}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Clear (Send now)
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary sm:w-auto sm:flex-1"
                />
                {/* Quick preset buttons — "+X Days" counts from the latest
                    post already on the schedule (or from today if none). */}
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + 1);
                      d.setHours(9, 0, 0, 0);
                      setScheduledAt(toLocalInputValue(d));
                    }}
                    className="rounded border border-border bg-background px-2 py-1 text-[11px] hover:border-primary/50 hover:bg-accent"
                  >
                    Tomorrow 9 AM
                  </button>
                  {[2, 3, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => scheduleDaysAfterLastPost(n)}
                      title={`${n} days after the last scheduled post (or from today if none)`}
                      className="rounded border border-border bg-background px-2 py-1 text-[11px] hover:border-primary/50 hover:bg-accent"
                    >
                      +{n} Days
                    </button>
                  ))}
                </div>
              </div>

              <p className="mt-2 text-[11px] text-muted-foreground">
                {scheduledAt
                  ? `Post will be queued for automated publishing at ${new Date(scheduledAt).toLocaleString()}.`
                  : "No schedule date set — clicking Send will dispatch immediately (or queue if offline)."}
              </p>
            </div>

            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setPreviewOpen(true)}
                  disabled={!caption.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-3 text-sm font-medium hover:bg-accent disabled:opacity-40"
                >
                  <Eye className="h-4 w-4" /> Preview
                </button>
                <button
                  onClick={handleSaveDraft}
                  disabled={saving || !caption.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-3 text-sm font-medium hover:bg-accent disabled:opacity-40"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending || !caption.trim() || captionOver || networks.length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : scheduledAt ? (
                    <CalendarClock className="h-4 w-4" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {scheduledAt ? "Schedule" : "Send"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {scheduledAt
                  ? "Schedule places this post on the Scheduler calendar and queues it for automated delivery."
                  : "Send publishes directly to your connected networks. On success, images are marked as posted."}
              </p>
            </div>
          </section>
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
                <div className="text-sm font-medium">Select images</div>
                <div className="text-xs text-muted-foreground">
                  {selectedImages.size}/4 selected · {visibleImages.length} available ·
                  already-published images are hidden
                </div>
              </div>
              <div className="flex items-center gap-3">
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
              {/* Selected Image Metadata & Geotag Details (Active image info & edit option) */}
              {selectedImages.size > 0 && activeDetailImage && (
                <div className="mt-3.5 space-y-2.5 rounded-lg border border-primary/25 bg-gradient-to-b from-primary/[0.04] to-card p-3 shadow-sm">
                  {/* Tab bar when multiple images are selected */}
                  {selectedImages.size > 1 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 border-b border-border/50">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap mr-1">
                        Selected ({selectedImages.size}):
                      </span>
                      {selectedImagesList.map((img, idx) => {
                        const isActive = img.id === activeDetailImage.id;
                        return (
                          <button
                            key={img.id}
                            type="button"
                            onClick={() => setActiveDetailId(img.id)}
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition ${
                              isActive
                                ? "bg-primary text-primary-foreground font-medium shadow-sm"
                                : "bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />#{idx + 1}
                            {img.title ? `: ${img.title.slice(0, 16)}` : ""}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Header: thumbnail, title/name & Edit button */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <div className="relative shrink-0 h-11 w-11 rounded-md overflow-hidden border border-border bg-muted">
                        <SignedImage
                          bucket="frames"
                          path={activeDetailImage.storage_path}
                          alt={activeDetailImage.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold text-foreground truncate">
                            {activeDetailImage.title || activeDetailImage.name}
                          </span>
                          {activeDetailImage.title && (
                            <span className="inline-flex items-center rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                              Title
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate mt-0.5 font-mono">
                          {activeDetailImage.name}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setEditingImage(activeDetailImage)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition shrink-0 shadow-sm"
                      title="Edit title, description, geotag coordinates, and folder"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit Details
                    </button>
                  </div>

                  {/* Description container */}
                  <div className="rounded-md border border-border/70 bg-background/80 p-2.5 text-xs">
                    <div className="flex items-center justify-between mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" /> Description
                      </span>
                      {activeDetailImage.description && (
                        <button
                          type="button"
                          onClick={() => {
                            setCaption((prev) =>
                              prev
                                ? `${prev}\n\n${activeDetailImage.description}`
                                : activeDetailImage.description || "",
                            );
                            toast.success("Image description appended to post");
                          }}
                          className="text-[10px] font-medium text-primary hover:underline"
                        >
                          + Append to Post
                        </button>
                      )}
                    </div>
                    {activeDetailImage.description ? (
                      <p className="whitespace-pre-wrap leading-relaxed text-foreground">
                        {activeDetailImage.description}
                      </p>
                    ) : (
                      <p className="italic text-muted-foreground text-[11px]">
                        No description added yet. Click &quot;Edit Details&quot; to add a title,
                        description, or update GPS coordinates.
                      </p>
                    )}
                  </div>

                  {/* Geotag & Folder information */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/80 px-2.5 py-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="font-mono text-[11px] text-muted-foreground truncate">
                          {activeDetailImage.lat != null && activeDetailImage.lng != null
                            ? `${activeDetailImage.lat.toFixed(5)}, ${activeDetailImage.lng.toFixed(5)}`
                            : "No coordinates"}
                        </span>
                      </div>
                      {activeDetailImage.lat != null && activeDetailImage.lng != null && (
                        <a
                          href={`https://www.google.com/maps?q=${activeDetailImage.lat},${activeDetailImage.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline shrink-0 ml-2 font-medium"
                        >
                          <ExternalLink className="h-3 w-3" /> Map
                        </a>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-background/80 px-2.5 py-1.5">
                      <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-[11px] text-muted-foreground truncate">
                        Folder:{" "}
                        <strong className="font-medium text-foreground">
                          {imageFolderMap.get(activeDetailImage.folder_id ?? "") || "Uncategorized"}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>
              )}
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

      {/* Edit image details modal */}
      {editingImage && (
        <EditImageDetailsModal
          img={editingImage}
          imageFolders={imageFolders}
          onClose={() => setEditingImage(null)}
          onSave={(updated) => {
            setImages((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
          }}
        />
      )}

      {/* Preview & confirm modal */}
      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => !sending && setPreviewOpen(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
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
                        ? {
                            label: "Optimal length for Google Business Profile.",
                            tone: "text-emerald-600 dark:text-emerald-400",
                          }
                        : len <= CAPTION_LIMIT
                          ? {
                              label:
                                "Longer than recommended — Google trims to ~100 chars on mobile feeds.",
                              tone: "text-amber-500",
                            }
                          : {
                              label: `Over the ${CAPTION_LIMIT}-char limit.`,
                              tone: "text-red-500",
                            };
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
                          Updates as you type. Ideal length {GMB_SWEET_MIN}–{GMB_SWEET_MAX}{" "}
                          characters.
                        </div>
                      </div>
                      <span className={`text-[11px] font-medium ${status.tone}`}>
                        {status.label}
                      </span>
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

                      <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed" dir="ltr">
                        {caption ? (
                          <>
                            {previewExpanded ? caption : truncated}
                            {len > GMB_TRUNCATE && (
                              <button
                                type="button"
                                onClick={() => setPreviewExpanded((v) => !v)}
                                className="ml-1 text-primary hover:underline"
                              >
                                {previewExpanded ? "Show less" : "Read more"}
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

              <div className="grid gap-2 text-xs sm:grid-cols-2">
                <InfoRow label="Networks" value={networks.join(", ") || "—"} />
                <InfoRow
                  label="Schedule"
                  value={scheduledAt ? new Date(scheduledAt).toLocaleString() : "Send immediately"}
                />
                <InfoRow label="Primary keyword" value={manualKw[0] ?? "—"} />
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

      {/* Templates modal */}
      {templatesOpen &&
        (() => {
          const q = templateSearch.trim().toLowerCase();
          const counts: Record<string, number> = { __all: templates.length, __none: 0 };
          for (const f of templateFolders) counts[f] = 0;
          for (const t of templates) {
            const key = t.folder && templateFolders.includes(t.folder) ? t.folder : "__none";
            counts[key] = (counts[key] ?? 0) + 1;
          }
          const inFolder = (t: PostTemplate) => {
            if (activeFolder === "__all") return true;
            if (activeFolder === "") return !t.folder || !templateFolders.includes(t.folder);
            return t.folder === activeFolder;
          };
          const visible = templates.filter(
            (t) =>
              inFolder(t) &&
              (!q || t.name.toLowerCase().includes(q) || t.body.toLowerCase().includes(q)),
          );
          const folderItems: Array<{
            key: string;
            label: string;
            count: number;
            removable: boolean;
          }> = [
            { key: "__all", label: "All templates", count: counts.__all, removable: false },
            { key: "", label: "Uncategorized", count: counts.__none, removable: false },
            ...templateFolders.map((f) => ({
              key: f,
              label: f,
              count: counts[f] ?? 0,
              removable: true,
            })),
          ];
          return (
            <div className="mt-5">
              <div
                className="flex h-[calc(100vh-190px)] min-h-[480px] w-full flex-col overflow-hidden rounded-2xl border border-border bg-card"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border px-5 py-3">
                  <div>
                    <div className="text-sm font-semibold">Post templates</div>
                    <div className="text-[11px] text-muted-foreground">
                      Organize reusable descriptions in folders and apply them to the post.
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
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
                      className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-accent"
                    >
                      Import
                    </button>
                    <button
                      onClick={exportTemplates}
                      disabled={!templates.length}
                      className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-40"
                    >
                      Export
                    </button>
                    <button
                      onClick={() => setTemplatesOpen(false)}
                      className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-accent"
                    >
                      <PenSquare className="h-3 w-3" /> Back to Compose
                    </button>
                  </div>
                </div>

                {/* Body: sidebar + main */}
                <div className="grid flex-1 min-h-0 grid-cols-[220px_1fr]">
                  {/* Sidebar — folders */}
                  <aside className="flex flex-col overflow-hidden border-r border-border bg-muted/30">
                    <div className="flex items-center justify-between px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Folders
                      <button
                        onClick={addFolder}
                        title="New folder"
                        className="rounded p-1 hover:bg-accent hover:text-foreground"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto px-1.5 pb-2">
                      {folderItems.map((f) => {
                        const on = activeFolder === f.key;
                        return (
                          <div
                            key={f.key || "__none"}
                            className={`group flex items-center gap-1 rounded px-2 py-1.5 text-xs ${
                              on ? "bg-primary/15 text-primary" : "hover:bg-accent"
                            }`}
                          >
                            <button
                              onClick={() => setActiveFolder(f.key)}
                              className="flex-1 truncate text-left"
                            >
                              {f.label}
                            </button>
                            <span
                              className={`rounded-full px-1.5 text-[10px] ${
                                on ? "bg-primary/25" : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {f.count}
                            </span>
                            {f.removable && (
                              <div className="flex opacity-0 transition group-hover:opacity-100">
                                <button
                                  onClick={() => renameFolder(f.key)}
                                  aria-label="Rename folder"
                                  className="rounded p-0.5 hover:bg-background"
                                  title="Rename"
                                >
                                  <PenSquare className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => removeFolder(f.key)}
                                  aria-label="Delete folder"
                                  className="rounded p-0.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                                  title="Delete"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </aside>

                  {/* Main */}
                  <main className="flex min-h-0 flex-col overflow-hidden">
                    <div className="flex items-center gap-2 border-b border-border px-4 py-2">
                      <input
                        value={templateSearch}
                        onChange={(e) => setTemplateSearch(e.target.value)}
                        placeholder="Search templates…"
                        className="flex-1 rounded border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                      />
                      <button
                        onClick={() => beginCreateTemplate(false)}
                        className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                      >
                        <Plus className="h-3.5 w-3.5" /> New template
                      </button>
                      {caption.trim() && (
                        <button
                          onClick={() => {
                            beginCreateTemplate(true);
                            setNewTplName(caption.trim().slice(0, 40));
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
                        >
                          Save current
                        </button>
                      )}
                    </div>

                    {/* Preview step — shows how the template will populate the
                      Description before it replaces the current text. */}
                    {previewingTemplate && (
                      <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
                        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">
                              {previewingTemplate.name}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                              <span>
                                {previewingTemplate.folder &&
                                templateFolders.includes(previewingTemplate.folder)
                                  ? previewingTemplate.folder
                                  : "Uncategorized"}
                              </span>
                              <span>·</span>
                              <span>{previewingTemplate.body.length} chars</span>
                              {previewingTemplate.body.length > CAPTION_LIMIT && (
                                <span className="text-red-500">· exceeds {CAPTION_LIMIT}</span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => setPreviewingTemplate(null)}
                            className="rounded border border-border px-2 py-1 text-[11px] hover:bg-accent"
                          >
                            ← Back
                          </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4">
                          <div className="grid gap-3 md:grid-cols-2">
                            {/* Current description */}
                            <div className="rounded-lg border border-border bg-background">
                              <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
                                <div className="text-[11px] font-medium">Current description</div>
                                <div className="text-[10px] text-muted-foreground">
                                  {caption.length} chars
                                </div>
                              </div>
                              <div className="max-h-64 overflow-y-auto whitespace-pre-wrap px-3 py-2 text-xs">
                                {caption.trim() ? (
                                  caption
                                ) : (
                                  <span className="italic text-muted-foreground">
                                    Empty — the template will fill this in.
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* Template body */}
                            <div className="rounded-lg border border-primary/40 bg-primary/5">
                              <div className="flex items-center justify-between border-b border-primary/30 px-3 py-1.5">
                                <div className="text-[11px] font-medium text-primary">
                                  After applying
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {previewingTemplate.body.length} chars
                                </div>
                              </div>
                              <div className="max-h-64 overflow-y-auto whitespace-pre-wrap px-3 py-2 text-xs">
                                {previewingTemplate.body}
                              </div>
                            </div>
                          </div>

                          {/* What stays the same */}
                          <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3">
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                              Unchanged fields
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3">
                              <FieldPill label="Location" value={location?.label ?? "—"} />
                              <FieldPill
                                label="Images"
                                value={
                                  selectedImages.size ? `${selectedImages.size} selected` : "None"
                                }
                              />
                              <FieldPill label="Template" value={styleTemplate?.name ?? "None"} />
                              <FieldPill
                                label="LLM"
                                value={
                                  llm === "gemini"
                                    ? "Gemini"
                                    : llm === "chatgpt"
                                      ? "ChatGPT"
                                      : "AKS Cloud"
                                }
                              />

                              <FieldPill
                                label="Schedule"
                                value={
                                  scheduledAt ? new Date(scheduledAt).toLocaleString() : "Send now"
                                }
                              />
                            </div>
                            <p className="mt-2 text-[10px] text-muted-foreground">
                              Templates are used as a <strong>structural format only</strong>. Your
                              Description is never overwritten — clicking Generate writes brand-new
                              copy from your keywords and image(s) in the template's layout.
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 border-t border-border bg-card px-4 py-2.5">
                          <div className="text-[11px] text-muted-foreground">
                            The AI will produce a fresh, unique caption in this style.
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setPreviewingTemplate(null)}
                              className="rounded border border-border px-3 py-1.5 text-xs hover:bg-accent"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={confirmApplyTemplate}
                              className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> Use as style reference
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* View template panel */}
                    {!previewingTemplate && viewingTemplate && !editingTemplate && (
                      <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
                        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">
                              {viewingTemplate.name}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                              <span>
                                {viewingTemplate.folder &&
                                templateFolders.includes(viewingTemplate.folder)
                                  ? viewingTemplate.folder
                                  : "Uncategorized"}
                              </span>
                              <span>·</span>
                              <span>{viewingTemplate.body.length} chars</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => beginEditTemplate(viewingTemplate)}
                              className="inline-flex items-center gap-1 rounded border border-border bg-background px-2.5 py-1 text-xs hover:bg-accent"
                            >
                              <PenSquare className="h-3.5 w-3.5" /> Edit
                            </button>
                            <button
                              onClick={() => setViewingTemplate(null)}
                              className="rounded border border-border px-2 py-1 text-[11px] hover:bg-accent"
                            >
                              ← Back to list
                            </button>
                          </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4">
                          <div className="rounded-lg border border-border bg-background p-4">
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                              Template Content
                            </div>
                            <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                              {viewingTemplate.body}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between border-t border-border bg-card px-4 py-2.5">
                          <button
                            onClick={() => deleteTemplate(viewingTemplate.id)}
                            className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete template
                          </button>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setViewingTemplate(null)}
                              className="rounded border border-border px-3 py-1.5 text-xs hover:bg-accent"
                            >
                              Close
                            </button>
                            <button
                              onClick={() => {
                                const t = viewingTemplate;
                                setViewingTemplate(null);
                                applyTemplate(t);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> Use as style reference
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Edit form */}
                    {!previewingTemplate && editingTemplate && (
                      <div className="border-b border-border bg-muted/30 px-4 py-3">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="text-xs font-semibold">Edit template</div>
                          <button
                            onClick={() => setEditingTemplate(null)}
                            className="text-[11px] text-muted-foreground hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block">
                            <span className="text-[11px] text-muted-foreground">Name</span>
                            <input
                              value={editTplName}
                              onChange={(e) => setEditTplName(e.target.value)}
                              placeholder="e.g. Sofa cleaning — Al Barsha"
                              className="mt-1 w-full rounded border border-border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[11px] text-muted-foreground">Folder</span>
                            <select
                              value={editTplFolder}
                              onChange={(e) => setEditTplFolder(e.target.value)}
                              className="mt-1 w-full rounded border border-border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                            >
                              <option value="">Uncategorized</option>
                              {templateFolders.map((f) => (
                                <option key={f} value={f}>
                                  {f}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <label className="mt-2 block">
                          <span className="text-[11px] text-muted-foreground">
                            Body ({editTplBody.length} chars)
                          </span>
                          <textarea
                            value={editTplBody}
                            onChange={(e) => setEditTplBody(e.target.value)}
                            rows={6}
                            placeholder="Template content…"
                            className="mt-1 w-full rounded border border-border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                          />
                        </label>
                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            onClick={() => setEditingTemplate(null)}
                            className="rounded border border-border px-3 py-1.5 text-xs hover:bg-accent"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={saveEditedTemplate}
                            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                          >
                            Save changes
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Create form */}
                    {!previewingTemplate && creatingTemplate && (
                      <div className="border-b border-border bg-muted/30 px-4 py-3">
                        <div className="mb-2 text-xs font-semibold">New template</div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block">
                            <span className="text-[11px] text-muted-foreground">Name</span>
                            <input
                              value={newTplName}
                              onChange={(e) => setNewTplName(e.target.value)}
                              placeholder="e.g. Sofa cleaning — Al Barsha"
                              className="mt-1 w-full rounded border border-border bg-background p-2 text-sm"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[11px] text-muted-foreground">Folder</span>
                            <select
                              value={newTplFolder}
                              onChange={(e) => setNewTplFolder(e.target.value)}
                              className="mt-1 w-full rounded border border-border bg-background p-2 text-sm"
                            >
                              <option value="">Uncategorized</option>
                              {templateFolders.map((f) => (
                                <option key={f} value={f}>
                                  {f}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <label className="mt-2 block">
                          <span className="text-[11px] text-muted-foreground">Body</span>
                          <textarea
                            value={newTplBody}
                            onChange={(e) => setNewTplBody(e.target.value)}
                            rows={5}
                            placeholder="Template content…"
                            className="mt-1 w-full rounded border border-border bg-background p-2 text-sm"
                          />
                        </label>
                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            onClick={() => setCreatingTemplate(false)}
                            className="rounded border border-border px-3 py-1.5 text-xs hover:bg-accent"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={saveNewTemplate}
                            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                          >
                            Save template
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Grid */}
                    {!previewingTemplate && !viewingTemplate && (
                      <div className="flex-1 overflow-y-auto p-4">
                        {visible.length === 0 ? (
                          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                            <LayoutTemplate className="h-8 w-8 opacity-40" />
                            <div>
                              {templates.length === 0
                                ? "No templates yet."
                                : q
                                  ? "No templates match your search."
                                  : "This folder is empty."}
                            </div>
                            <button
                              onClick={() => beginCreateTemplate(false)}
                              className="mt-1 inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent"
                            >
                              <Plus className="h-3.5 w-3.5" /> Create your first template
                            </button>
                          </div>
                        ) : (
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {visible.map((t) => (
                              <div
                                key={t.id}
                                className="group flex flex-col overflow-hidden rounded-xl border border-border bg-background transition hover:border-primary/40 hover:shadow"
                              >
                                <div className="flex items-start justify-between gap-2 px-3 pb-1 pt-2.5">
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">{t.name}</div>
                                    <div className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                                      {t.folder && templateFolders.includes(t.folder)
                                        ? t.folder
                                        : "Uncategorized"}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => beginViewTemplate(t)}
                                      aria-label="View template"
                                      title="View details"
                                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={() => beginEditTemplate(t)}
                                      aria-label="Edit template"
                                      title="Edit template"
                                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                                    >
                                      <PenSquare className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={() => deleteTemplate(t.id)}
                                      aria-label="Delete template"
                                      title="Delete template"
                                      className="rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                                <div
                                  onClick={() => beginViewTemplate(t)}
                                  className="line-clamp-4 cursor-pointer whitespace-pre-wrap px-3 pb-2 text-xs text-muted-foreground hover:text-foreground"
                                  title="Click to view full template"
                                >
                                  {t.body}
                                </div>
                                <div className="mt-auto flex items-center gap-1.5 border-t border-border/60 bg-muted/30 px-2 py-1.5">
                                  <button
                                    onClick={() => beginViewTemplate(t)}
                                    className="rounded border border-border bg-background px-2 py-1 text-[11px] hover:bg-accent"
                                    title="View full template"
                                  >
                                    View
                                  </button>
                                  <button
                                    onClick={() => beginEditTemplate(t)}
                                    className="rounded border border-border bg-background px-2 py-1 text-[11px] hover:bg-accent"
                                    title="Edit template"
                                  >
                                    Edit
                                  </button>
                                  <select
                                    value={t.folder ?? ""}
                                    onChange={(e) => moveTemplate(t.id, e.target.value)}
                                    className="flex-1 min-w-0 rounded border border-border bg-background px-1.5 py-1 text-[11px]"
                                    title="Move to folder"
                                  >
                                    <option value="">Uncategorized</option>
                                    {templateFolders.map((f) => (
                                      <option key={f} value={f}>
                                        {f}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={() => applyTemplate(t)}
                                    className="rounded bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:opacity-90"
                                  >
                                    Apply
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </main>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}

function FieldPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-2 py-1.5">
      <div className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 truncate text-[11px]" title={value}>
        {value}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card/50 p-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
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
  const tooltip = img.title
    ? `${img.title} (${img.name})`
    : posted
      ? `Posted ${new Date(img.posted_at!).toLocaleDateString()}`
      : img.name;
  return (
    <button
      onClick={onClick}
      className={`relative overflow-hidden rounded-md border transition ${
        active ? "border-primary ring-2 ring-primary" : "border-border hover:border-primary/50"
      } ${posted ? "opacity-70" : ""}`}
      title={tooltip}
    >
      <SignedImage
        bucket="frames"
        path={img.storage_path}
        alt={img.name}
        className="aspect-square w-full object-cover"
      />
      {(posted || (img.lat != null && img.lng != null)) && (
        <div className="absolute left-1 top-1 flex items-center gap-1">
          <GeoTaggedBadge lat={img.lat} lng={img.lng} compact />
          <PublishedBadge published={posted} compact />
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
            <div className="text-[11px] text-muted-foreground">{topicCounts.length} unique</div>
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
            <div className="text-[11px] text-muted-foreground">{cityCounts.length} unique</div>
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
                              : p.status === "queued" || p.status === "scheduled"
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
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function EditImageDetailsModal({
  img,
  imageFolders,
  onClose,
  onSave,
}: {
  img: ImageRow;
  imageFolders: ImageFolder[];
  onClose: () => void;
  onSave: (updated: ImageRow) => void;
}) {
  const [name, setName] = useState(img.name);
  const [title, setTitle] = useState(img.title ?? "");
  const [description, setDescription] = useState(img.description ?? "");
  const [folderId, setFolderId] = useState<string | null>(img.folder_id ?? null);
  const [loc, setLoc] = useState<PickedLocation | null>(
    img.lat != null && img.lng != null
      ? { lat: Number(img.lat), lng: Number(img.lng), label: "" }
      : null,
  );
  const [latInput, setLatInput] = useState(img.lat != null ? String(img.lat) : "");
  const [lngInput, setLngInput] = useState(img.lng != null ? String(img.lng) : "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loc) {
      setLatInput(String(loc.lat));
      setLngInput(String(loc.lng));
    }
  }, [loc]);

  function handleManualCoordChange(latStr: string, lngStr: string) {
    setLatInput(latStr);
    setLngInput(lngStr);
    const nLat = parseFloat(latStr);
    const nLng = parseFloat(lngStr);
    if (!isNaN(nLat) && !isNaN(nLng)) {
      setLoc({ lat: nLat, lng: nLng, label: "" });
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const finalLat = latInput.trim() ? parseFloat(latInput.trim()) : null;
      const finalLng = lngInput.trim() ? parseFloat(lngInput.trim()) : null;
      const finalName = name.trim() || img.name;
      const finalTitle = title.trim() || null;
      const finalDesc = description.trim() || null;
      const finalFolderId = folderId || null;

      const { error } = await supabase
        .from("images")
        .update({
          name: finalName,
          title: finalTitle,
          description: finalDesc,
          folder_id: finalFolderId,
          lat: finalLat,
          lng: finalLng,
        } as never)
        .eq("id", img.id);

      if (error) throw error;

      const updated: ImageRow = {
        ...img,
        name: finalName,
        title: finalTitle,
        description: finalDesc,
        folder_id: finalFolderId,
        lat: finalLat,
        lng: finalLng,
      };

      toast.success("Image details updated successfully");
      onSave(updated);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update image details");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Edit Image & Geotag Details</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-3">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
              <SignedImage
                bucket="frames"
                path={img.storage_path}
                alt={img.name}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                File Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="image.jpg"
                className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Image Title
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Deep Cleaning Villa in Palm Jumeirah"
                className="w-full rounded border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Folder / Category
              </label>
              <select
                value={folderId ?? ""}
                onChange={(e) => setFolderId(e.target.value || null)}
                className="w-full rounded border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
              >
                <option value="">Uncategorized</option>
                {imageFolders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Description / Caption Note
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Provide a detailed description of the service, work performed, or key visual highlights..."
              className="w-full rounded border border-border bg-background p-2.5 text-xs outline-none focus:border-primary"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Geotag / GPS Coordinates
              </label>
              {loc?.lat != null && loc?.lng != null && (
                <a
                  href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> View on Google Maps
                </a>
              )}
            </div>

            <div className="mb-2 grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-muted-foreground">Latitude</span>
                <input
                  type="number"
                  step="any"
                  value={latInput}
                  onChange={(e) => handleManualCoordChange(e.target.value, lngInput)}
                  placeholder="25.2048"
                  className="w-full rounded border border-border bg-background px-2.5 py-1.5 font-mono text-xs outline-none focus:border-primary"
                />
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground">Longitude</span>
                <input
                  type="number"
                  step="any"
                  value={lngInput}
                  onChange={(e) => handleManualCoordChange(latInput, e.target.value)}
                  placeholder="55.2708"
                  className="w-full rounded border border-border bg-background px-2.5 py-1.5 font-mono text-xs outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="rounded-lg border border-border/70 bg-background p-3">
              <span className="mb-2 block text-[10px] text-muted-foreground">
                Search place or pick on map:
              </span>
              <LocationPicker value={loc} onChange={setLoc} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-border px-4 py-2 text-xs hover:bg-accent disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 shadow-sm"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
