import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  Folder,
  FolderPlus,
  Pin,
  PinOff,
  Star,
  StarOff,
  Copy,
  Trash2,
  Plus,
  Search,
  Wand2,
  ChevronRight,
  ChevronDown,
  Save,
} from "lucide-react";
import { toast } from "sonner";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type FilterId =
  | "style"
  | "lighting"
  | "mood"
  | "camera"
  | "aspect"
  | "palette";

type FilterDef = {
  id: FilterId;
  label: string;
  options: string[];
};

type Template = {
  id: string;
  name: string;
  body: string; // supports {subject}, {style}, {lighting}, etc.
  folder: string;
};

type SavedPrompt = {
  id: string;
  title: string;
  body: string;
  folder: string;
  pinned: boolean;
  favorite: boolean;
  createdAt: number;
};

const FILTERS: FilterDef[] = [
  {
    id: "style",
    label: "Style",
    options: [
      "Photorealistic",
      "Cinematic",
      "Editorial",
      "Illustration",
      "3D render",
      "Minimalist",
      "Vintage film",
    ],
  },
  {
    id: "lighting",
    label: "Lighting",
    options: [
      "Golden hour",
      "Soft studio",
      "Dramatic rim",
      "Overcast diffuse",
      "Neon night",
      "Backlit sunrise",
    ],
  },
  {
    id: "mood",
    label: "Mood",
    options: [
      "Uplifting",
      "Trustworthy",
      "Energetic",
      "Calm & premium",
      "Playful",
      "Bold",
    ],
  },
  {
    id: "camera",
    label: "Camera",
    options: [
      "35mm lens",
      "85mm portrait",
      "Wide-angle 24mm",
      "Macro close-up",
      "Drone top-down",
    ],
  },
  {
    id: "aspect",
    label: "Aspect",
    options: ["1:1 square", "4:5 portrait", "16:9 landscape", "9:16 vertical"],
  },
  {
    id: "palette",
    label: "Palette",
    options: [
      "Warm neutrals",
      "Cool blues",
      "Monochrome",
      "Sunset gradient",
      "Brand navy + gold",
    ],
  },
];

const DEFAULT_TEMPLATES: Template[] = [
  {
    id: "tpl-service-hero",
    name: "Service hero shot",
    folder: "Service posts",
    body: "A {style} hero image of {subject} in {lighting}. {mood} atmosphere, shot on {camera}, {palette}. Composition: strong focal point, negative space top-right for a headline. Aspect {aspect}.",
  },
  {
    id: "tpl-before-after",
    name: "Before / after split",
    folder: "Service posts",
    body: "Split-frame image showing before and after of {subject}. Left half dim and cluttered, right half {style} and pristine with {lighting}. Consistent camera angle ({camera}), {palette}, {mood} mood. Aspect {aspect}.",
  },
  {
    id: "tpl-testimonial",
    name: "Testimonial background",
    folder: "Social ads",
    body: "{style} lifestyle background featuring {subject}, {lighting}, shallow depth of field. {mood} tone, {palette}. Leave a clean vertical band on the right for a quote overlay. Aspect {aspect}.",
  },
  {
    id: "tpl-product-flatlay",
    name: "Product flat-lay",
    folder: "Social ads",
    body: "Top-down flat-lay of {subject} arranged geometrically. {style}, {lighting}, {palette}. Subtle props, no text, {mood}. Aspect {aspect}.",
  },
  {
    id: "tpl-team",
    name: "Team spotlight",
    folder: "Brand",
    body: "{style} portrait of {subject}, {lighting}, {camera}. {mood} expression, {palette} wardrobe and background. Aspect {aspect}.",
  },
];

const DEFAULT_FOLDERS = ["Service posts", "Social ads", "Brand", "Inspiration"];

const STORAGE_KEY_PROMPTS = "fb-ai-prompt-generator:prompts:v1";
const STORAGE_KEY_TEMPLATES = "fb-ai-prompt-generator:templates:v1";
const STORAGE_KEY_FOLDERS = "fb-ai-prompt-generator:folders:v1";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJSON<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function fillTemplate(
  body: string,
  subject: string,
  selections: Partial<Record<FilterId, string>>,
): string {
  return body
    .replaceAll("{subject}", subject.trim() || "the subject")
    .replaceAll("{style}", selections.style ?? "photorealistic")
    .replaceAll("{lighting}", selections.lighting ?? "soft natural light")
    .replaceAll("{mood}", selections.mood ?? "professional")
    .replaceAll("{camera}", selections.camera ?? "35mm lens")
    .replaceAll("{aspect}", selections.aspect ?? "1:1 square")
    .replaceAll("{palette}", selections.palette ?? "brand palette");
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export function AiImagePromptGenerator() {
  // Hydrate on mount to avoid SSR mismatches
  const [hydrated, setHydrated] = useState(false);
  const [folders, setFolders] = useState<string[]>(DEFAULT_FOLDERS);
  const [templates, setTemplates] = useState<Template[]>(DEFAULT_TEMPLATES);
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);

  useEffect(() => {
    setFolders(loadJSON(STORAGE_KEY_FOLDERS, DEFAULT_FOLDERS));
    setTemplates(loadJSON(STORAGE_KEY_TEMPLATES, DEFAULT_TEMPLATES));
    setPrompts(loadJSON(STORAGE_KEY_PROMPTS, [] as SavedPrompt[]));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveJSON(STORAGE_KEY_FOLDERS, folders);
  }, [folders, hydrated]);
  useEffect(() => {
    if (hydrated) saveJSON(STORAGE_KEY_TEMPLATES, templates);
  }, [templates, hydrated]);
  useEffect(() => {
    if (hydrated) saveJSON(STORAGE_KEY_PROMPTS, prompts);
  }, [prompts, hydrated]);

  // Builder state
  const [subject, setSubject] = useState("");
  const [selections, setSelections] = useState<Partial<Record<FilterId, string>>>(
    {},
  );
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [customBody, setCustomBody] = useState<string>("");
  const [activeFolder, setActiveFolder] = useState<string>("All");
  const [openFolders, setOpenFolders] = useState<Set<string>>(
    () => new Set(DEFAULT_FOLDERS),
  );
  const [search, setSearch] = useState("");
  const [filterView, setFilterView] = useState<"all" | "pinned" | "favorites">(
    "all",
  );
  const outputRef = useRef<HTMLTextAreaElement>(null);

  const activeTemplate = templates.find((t) => t.id === activeTemplateId) ?? null;
  const bodyToUse = activeTemplate?.body ?? customBody;

  const generated = useMemo(
    () =>
      bodyToUse ? fillTemplate(bodyToUse, subject, selections) : "",
    [bodyToUse, subject, selections],
  );

  function toggleFolderOpen(name: string) {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function addFolder() {
    const name = window.prompt("Folder name")?.trim();
    if (!name) return;
    if (folders.includes(name)) {
      toast.error("Folder already exists");
      return;
    }
    setFolders((prev) => [...prev, name]);
    setOpenFolders((prev) => new Set(prev).add(name));
    toast.success(`Folder “${name}” added`);
  }

  function pickFilter(id: FilterId, option: string) {
    setSelections((prev) => ({
      ...prev,
      [id]: prev[id] === option ? undefined : option,
    }));
  }

  function clearFilters() {
    setSelections({});
  }

  function copyGenerated() {
    if (!generated) return;
    navigator.clipboard.writeText(generated).then(
      () => toast.success("Prompt copied"),
      () => toast.error("Copy failed"),
    );
  }

  function savePrompt() {
    if (!generated.trim()) {
      toast.error("Nothing to save yet");
      return;
    }
    const folder =
      activeFolder !== "All" ? activeFolder : activeTemplate?.folder ?? folders[0] ?? "Inspiration";
    const title =
      subject.trim() ||
      activeTemplate?.name ||
      generated.slice(0, 48);
    const item: SavedPrompt = {
      id: crypto.randomUUID(),
      title,
      body: generated,
      folder,
      pinned: false,
      favorite: false,
      createdAt: Date.now(),
    };
    setPrompts((prev) => [item, ...prev]);
    toast.success("Prompt saved");
  }

  function togglePin(id: string) {
    setPrompts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, pinned: !p.pinned } : p)),
    );
  }
  function toggleFav(id: string) {
    setPrompts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, favorite: !p.favorite } : p)),
    );
  }
  function removePrompt(id: string) {
    setPrompts((prev) => prev.filter((p) => p.id !== id));
  }

  function saveAsTemplate() {
    const body = bodyToUse || generated;
    if (!body.trim()) {
      toast.error("Nothing to save as template");
      return;
    }
    const name = window.prompt("Template name")?.trim();
    if (!name) return;
    const folder = activeFolder !== "All" ? activeFolder : folders[0] ?? "Inspiration";
    const tpl: Template = {
      id: crypto.randomUUID(),
      name,
      body,
      folder,
    };
    setTemplates((prev) => [tpl, ...prev]);
    toast.success(`Template “${name}” added`);
  }

  // Filtered saved prompts view
  const visiblePrompts = useMemo(() => {
    let list = prompts.slice();
    if (activeFolder !== "All") list = list.filter((p) => p.folder === activeFolder);
    if (filterView === "pinned") list = list.filter((p) => p.pinned);
    if (filterView === "favorites") list = list.filter((p) => p.favorite);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.body.toLowerCase().includes(q),
      );
    }
    // Pinned first, then most recent
    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.createdAt - a.createdAt;
    });
    return list;
  }, [prompts, activeFolder, filterView, search]);

  const templatesByFolder = useMemo(() => {
    const map = new Map<string, Template[]>();
    for (const f of folders) map.set(f, []);
    for (const t of templates) {
      const bucket = map.get(t.folder) ?? [];
      bucket.push(t);
      map.set(t.folder, bucket);
    }
    return map;
  }, [templates, folders]);

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
      {/* ------------------------------------------------------------------ */}
      {/* Left: Folders / template tree                                       */}
      {/* ------------------------------------------------------------------ */}
      <aside className="rounded-2xl border border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Folders
          </div>
          <button
            onClick={addFolder}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="New folder"
            aria-label="New folder"
          >
            <FolderPlus className="h-4 w-4" />
          </button>
        </div>

        <button
          onClick={() => setActiveFolder("All")}
          className={`mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
            activeFolder === "All"
              ? "bg-primary/15 text-primary"
              : "hover:bg-accent"
          }`}
        >
          <Folder className="h-4 w-4" /> All
          <span className="ml-auto text-[10px] text-muted-foreground">
            {prompts.length}
          </span>
        </button>

        <div className="space-y-0.5">
          {folders.map((f) => {
            const isOpen = openFolders.has(f);
            const items = templatesByFolder.get(f) ?? [];
            const promptCount = prompts.filter((p) => p.folder === f).length;
            return (
              <div key={f}>
                <div
                  className={`flex items-center gap-1 rounded-md px-1 py-1 text-sm ${
                    activeFolder === f ? "bg-primary/15 text-primary" : ""
                  }`}
                >
                  <button
                    onClick={() => toggleFolderOpen(f)}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                    aria-label={isOpen ? "Collapse" : "Expand"}
                  >
                    {isOpen ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => setActiveFolder(f)}
                    className="flex flex-1 items-center gap-2 text-left"
                  >
                    <Folder className="h-4 w-4" />
                    <span className="truncate">{f}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {promptCount}
                    </span>
                  </button>
                </div>
                {isOpen && (
                  <ul className="ml-6 mt-0.5 space-y-0.5 border-l border-border pl-2">
                    {items.length === 0 ? (
                      <li className="py-1 text-[11px] text-muted-foreground">
                        No templates
                      </li>
                    ) : (
                      items.map((tpl) => (
                        <li key={tpl.id}>
                          <button
                            onClick={() => {
                              setActiveTemplateId(tpl.id);
                              setActiveFolder(tpl.folder);
                            }}
                            className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs transition ${
                              activeTemplateId === tpl.id
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground"
                            }`}
                          >
                            <Sparkles className="h-3 w-3 shrink-0" />
                            <span className="truncate">{tpl.name}</span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* ------------------------------------------------------------------ */}
      {/* Center: builder                                                     */}
      {/* ------------------------------------------------------------------ */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Wand2 className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">AI Image Prompt Generator</h2>
            <p className="text-xs text-muted-foreground">
              Compose reusable image prompts with templates, filters, and folders.
            </p>
          </div>
        </div>

        {/* Subject */}
        <label className="mb-1 block text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Subject
        </label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. a spotless kitchen after professional cleaning"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />

        {/* Template selector */}
        <div className="mt-4 flex items-center justify-between">
          <label className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Template
          </label>
          {activeTemplate && (
            <button
              onClick={() => setActiveTemplateId(null)}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Clear template
            </button>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {templates.slice(0, 8).map((tpl) => {
            const on = activeTemplateId === tpl.id;
            return (
              <button
                key={tpl.id}
                onClick={() => setActiveTemplateId(on ? null : tpl.id)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  on
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
                title={tpl.body}
              >
                {tpl.name}
              </button>
            );
          })}
        </div>

        {!activeTemplate && (
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Custom body
              <span className="ml-1 normal-case text-muted-foreground/70">
                (use {"{subject}"}, {"{style}"}, {"{lighting}"}, {"{mood}"}, {"{camera}"}, {"{aspect}"}, {"{palette}"})
              </span>
            </label>
            <textarea
              value={customBody}
              onChange={(e) => setCustomBody(e.target.value)}
              rows={3}
              placeholder="A {style} shot of {subject}, {lighting}, {mood}."
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
        )}

        {/* Filters */}
        <div className="mt-5 flex items-center justify-between">
          <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Dynamic filters
          </div>
          {Object.values(selections).some(Boolean) && (
            <button
              onClick={clearFilters}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="mt-2 space-y-2">
          {FILTERS.map((f) => (
            <div key={f.id} className="rounded-lg border border-border bg-background/40 p-2">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {f.label}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {f.options.map((opt) => {
                  const on = selections[f.id] === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => pickFilter(f.id, opt)}
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${
                        on
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Output */}
        <div className="mt-5">
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Generated prompt
            </label>
            <span className="text-[11px] text-muted-foreground">
              {generated.length} chars
            </span>
          </div>
          <textarea
            ref={outputRef}
            value={generated}
            readOnly
            rows={5}
            placeholder="Pick a template or write a custom body, add filters, and your prompt appears here."
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={copyGenerated}
              disabled={!generated}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </button>
            <button
              onClick={savePrompt}
              disabled={!generated}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" /> Save to folder
            </button>
            <button
              onClick={saveAsTemplate}
              disabled={!bodyToUse}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" /> Save as template
            </button>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Right: saved prompts (pinned + favorites)                           */}
      {/* ------------------------------------------------------------------ */}
      <aside className="rounded-2xl border border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Saved prompts
          </div>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">
            {visiblePrompts.length}
          </span>
        </div>

        <div className="mb-2 flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search prompts"
            className="w-full bg-transparent text-xs outline-none"
          />
        </div>

        <div className="mb-2 flex gap-1">
          {(["all", "pinned", "favorites"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setFilterView(v)}
              className={`flex-1 rounded-md border px-2 py-1 text-[11px] capitalize transition ${
                filterView === v
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        {visiblePrompts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
            {prompts.length === 0
              ? "No saved prompts yet. Build one and hit Save."
              : "Nothing here — try a different filter."}
          </div>
        ) : (
          <ul className="space-y-2">
            {visiblePrompts.map((p) => (
              <li
                key={p.id}
                className={`rounded-lg border p-2 text-xs ${
                  p.pinned
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-background"
                }`}
              >
                <div className="flex items-start gap-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      {p.pinned && (
                        <Pin className="h-3 w-3 shrink-0 text-primary" />
                      )}
                      {p.favorite && (
                        <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
                      )}
                      <span className="truncate font-medium" title={p.title}>
                        {p.title}
                      </span>
                    </div>
                    <p
                      className="mt-1 line-clamp-3 text-[11px] text-muted-foreground"
                      title={p.body}
                    >
                      {p.body}
                    </p>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Folder className="h-2.5 w-2.5" />
                      {p.folder}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1">
                  <button
                    onClick={() => togglePin(p.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    title={p.pinned ? "Unpin" : "Pin"}
                    aria-label={p.pinned ? "Unpin" : "Pin"}
                  >
                    {p.pinned ? (
                      <PinOff className="h-3 w-3" />
                    ) : (
                      <Pin className="h-3 w-3" />
                    )}
                  </button>
                  <button
                    onClick={() => toggleFav(p.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    title={p.favorite ? "Unfavorite" : "Favorite"}
                    aria-label={p.favorite ? "Unfavorite" : "Favorite"}
                  >
                    {p.favorite ? (
                      <StarOff className="h-3 w-3" />
                    ) : (
                      <Star className="h-3 w-3" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(p.body);
                      toast.success("Prompt copied");
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    title="Copy"
                    aria-label="Copy"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => {
                      setCustomBody(p.body);
                      setActiveTemplateId(null);
                      toast.success("Loaded into builder");
                    }}
                    className="ml-auto rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    title="Load into builder"
                    aria-label="Load into builder"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => removePrompt(p.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Delete"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
