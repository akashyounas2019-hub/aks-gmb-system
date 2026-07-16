import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  Palette,
  LayoutTemplate,
  Wand2,
  Download,
  Plus,
  Trash2,
  Star,
  Save,
  Image as ImageIcon,
} from "lucide-react";
import {
  listAdProfiles,
  saveAdProfile,
  deleteAdProfile,
  setActiveProfile,
  listAdTemplates,
  saveAdTemplate,
  deleteAdTemplate,
  listAdCreatives,
  recordAdCreative,
  deleteAdCreative,
  type AdProfile,
  type AdTemplate,
  type SlotDef,
  type TemplateDefinition,
} from "@/lib/ad-creatives.functions";
import { supabase } from "@/integrations/supabase/client";
import { SignedImage } from "@/components/SignedImage";

export const Route = createFileRoute("/_authenticated/social/facebook/ad-creatives")({
  component: AdCreativesPage,
});

type SubTab = "profiles" | "templates" | "editor" | "exports";

const SIZE_PRESETS = [
  { id: "square", label: "Square 1:1", w: 1080, h: 1080 },
  { id: "portrait", label: "Portrait 4:5", w: 1080, h: 1350 },
  { id: "story", label: "Story 9:16", w: 1080, h: 1920 },
  { id: "landscape", label: "Landscape 1.91:1", w: 1200, h: 628 },
] as const;

function AdCreativesPage() {
  const [tab, setTab] = useState<SubTab>("profiles");
  const [editingTemplate, setEditingTemplate] = useState<AdTemplate | null>(null);

  const openEditor = (t: AdTemplate) => {
    setEditingTemplate(t);
    setTab("editor");
  };

  return (
    <div className="w-full px-6 py-6 md:px-10 md:py-10">
      <div className="mb-4 flex items-center gap-3">
        <Link
          to="/social/facebook"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Facebook
        </Link>
      </div>
      <div className="mb-6">
        <h1 className="text-3xl">Ad Creative Studio</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create brand profiles, pick a template, customize and export ads in every Facebook size.
        </p>
      </div>

      <div className="mb-6 border-b border-border">
        <nav role="tablist" className="-mb-px flex flex-wrap gap-1">
          <SubTabBtn active={tab === "profiles"} onClick={() => setTab("profiles")} icon={<Palette className="h-4 w-4" />} label="Profiles" />
          <SubTabBtn active={tab === "templates"} onClick={() => setTab("templates")} icon={<LayoutTemplate className="h-4 w-4" />} label="Templates" />
          <SubTabBtn active={tab === "editor"} onClick={() => setTab("editor")} icon={<Wand2 className="h-4 w-4" />} label="Editor" />
          <SubTabBtn active={tab === "exports"} onClick={() => setTab("exports")} icon={<Download className="h-4 w-4" />} label="Exports" />
        </nav>
      </div>

      {tab === "profiles" && <ProfilesTab />}
      {tab === "templates" && <TemplatesTab onOpen={openEditor} />}
      {tab === "editor" && <EditorTab template={editingTemplate} onSaved={() => setTab("exports")} />}
      {tab === "exports" && <ExportsTab />}
    </div>
  );
}

function SubTabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition ${
        active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/* ---------------- Profiles ---------------- */

const DEFAULT_COLORS = {
  primary: "#1877F2",
  secondary: "#42B72A",
  background: "#FFFFFF",
  text: "#111111",
  accent: "#F02849",
};

function ProfilesTab() {
  const qc = useQueryClient();
  const list = useServerFn(listAdProfiles);
  const save = useServerFn(saveAdProfile);
  const del = useServerFn(deleteAdProfile);
  const activate = useServerFn(setActiveProfile);
  const { data: profiles = [] } = useQuery({ queryKey: ["ad-profiles"], queryFn: () => list() });

  const [editing, setEditing] = useState<Partial<AdProfile> | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["ad-profiles"] });

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_360px]">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Brand profiles</h2>
          <button
            onClick={() =>
              setEditing({ name: "New profile", theme: "light", colors: DEFAULT_COLORS as never, fonts: { headline: "Inter", body: "Inter" } as never })
            }
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> New profile
          </button>
        </div>

        {profiles.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No profiles yet. Create one to save your colors, fonts, and default template.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {profiles.map((p) => {
              const colors = (p.colors as Record<string, string>) ?? {};
              return (
                <div key={p.id} className={`rounded-lg border p-4 ${p.is_active ? "border-primary" : "border-border"} bg-card`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{p.name}</span>
                        {p.is_active && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">Active</span>}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">Theme: {p.theme}</div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        aria-label="Set active"
                        onClick={async () => {
                          await activate({ data: { id: p.id } });
                          invalidate();
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                      >
                        <Star className={`h-4 w-4 ${p.is_active ? "fill-primary text-primary" : ""}`} />
                      </button>
                      <button
                        aria-label="Delete"
                        onClick={async () => {
                          if (!confirm(`Delete ${p.name}?`)) return;
                          await del({ data: { id: p.id } });
                          invalidate();
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-1.5">
                    {Object.entries(colors).slice(0, 6).map(([k, v]) => (
                      <span key={k} className="h-6 w-6 rounded border border-border" style={{ background: v }} title={`${k}: ${v}`} />
                    ))}
                  </div>
                  <button
                    onClick={() => setEditing(p)}
                    className="mt-3 text-xs text-primary hover:underline"
                  >
                    Edit
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        {editing ? (
          <ProfileEditor
            profile={editing}
            onCancel={() => setEditing(null)}
            onSave={async (patch) => {
              await save({ data: patch as never });
              invalidate();
              setEditing(null);
              toast.success("Profile saved");
            }}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            Select a profile to edit, or create a new one.
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileEditor({
  profile,
  onSave,
  onCancel,
}: {
  profile: Partial<AdProfile>;
  onSave: (p: Partial<AdProfile> & { name: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(profile.name ?? "");
  const [theme, setTheme] = useState(profile.theme ?? "light");
  const [colors, setColors] = useState<Record<string, string>>(
    (profile.colors as Record<string, string>) ?? DEFAULT_COLORS,
  );
  const [fonts, setFonts] = useState<Record<string, string>>(
    (profile.fonts as Record<string, string>) ?? { headline: "Inter", body: "Inter" },
  );

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 font-semibold">{profile.id ? "Edit profile" : "New profile"}</h3>
      <div className="space-y-3">
        <label className="block text-xs font-medium text-muted-foreground">
          Name
          <input
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block text-xs font-medium text-muted-foreground">
          Theme
          <select
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="vibrant">Vibrant</option>
          </select>
        </label>

        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Colors</div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(colors).map(([k, v]) => (
              <label key={k} className="flex items-center gap-2 text-xs">
                <span className="w-20 capitalize text-muted-foreground">{k}</span>
                <input
                  type="color"
                  value={v}
                  onChange={(e) => setColors({ ...colors, [k]: e.target.value })}
                  className="h-8 w-10 rounded border border-border"
                />
                <input
                  value={v}
                  onChange={(e) => setColors({ ...colors, [k]: e.target.value })}
                  className="flex-1 rounded border border-border bg-background px-2 py-1"
                />
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Fonts</div>
          <div className="grid grid-cols-2 gap-2">
            {(["headline", "body"] as const).map((k) => (
              <label key={k} className="text-xs">
                <span className="capitalize text-muted-foreground">{k}</span>
                <select
                  className="mt-1 w-full rounded border border-border bg-background px-2 py-1"
                  value={fonts[k] ?? "Inter"}
                  onChange={(e) => setFonts({ ...fonts, [k]: e.target.value })}
                >
                  {["Inter", "Arial", "Georgia", "Times New Roman", "Courier New", "Impact"].map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} className="rounded-md border border-border px-3 py-1.5 text-sm">Cancel</button>
          <button
            onClick={() =>
              onSave({
                id: profile.id,
                name: name.trim() || "Untitled",
                theme,
                colors: colors as never,
                fonts: fonts as never,
              })
            }
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
          >
            <Save className="h-4 w-4" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Templates ---------------- */

function TemplatesTab({ onOpen }: { onOpen: (t: AdTemplate) => void }) {
  const qc = useQueryClient();
  const list = useServerFn(listAdTemplates);
  const save = useServerFn(saveAdTemplate);
  const del = useServerFn(deleteAdTemplate);
  const { data: templates = [] } = useQuery({ queryKey: ["ad-templates"], queryFn: () => list() });

  async function duplicate(t: AdTemplate) {
    await save({
      data: {
        name: `${t.name} (copy)`,
        description: t.description ?? undefined,
        category: "custom",
        definition: t.definition,
      },
    });
    qc.invalidateQueries({ queryKey: ["ad-templates"] });
    toast.success("Duplicated as user template");
  }

  async function createBlank() {
    const def: TemplateDefinition = {
      canvas: { w: 1080, h: 1080, bg: "#FFFFFF" },
      slots: [
        { id: "photo", type: "image", x: 0, y: 0, w: 1080, h: 720, defaults: { fit: "cover" } as never },
        { id: "headline", type: "text", x: 60, y: 760, w: 960, h: 100, defaults: { text: "Your Headline", size: 56, weight: 700, color: "#111111", align: "left" } as never },
        { id: "ctabar", type: "shape", x: 60, y: 940, w: 960, h: 80, defaults: { fill: "#1877F2", radius: 12 } as never },
        { id: "ctatext", type: "text", x: 60, y: 955, w: 960, h: 60, defaults: { text: "Learn More", size: 32, weight: 700, color: "#FFFFFF", align: "center" } as never },
      ],
    };
    await save({ data: { name: "My template", category: "custom", definition: def as never } });
    qc.invalidateQueries({ queryKey: ["ad-templates"] });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Templates</h2>
        <button onClick={createBlank} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground">
          <Plus className="h-4 w-4" /> Blank template
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {templates.map((t) => {
          const def = t.definition as unknown as TemplateDefinition;
          const ratio = def.canvas.h / def.canvas.w;
          return (
            <div key={t.id} className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="relative bg-muted" style={{ paddingTop: `${ratio * 100}%` }}>
                <div className="absolute inset-0">
                  <TemplatePreview def={def} />
                </div>
                {t.is_builtin && (
                  <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium">Built-in</span>
                )}
              </div>
              <div className="p-3">
                <div className="text-sm font-medium">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.category}</div>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => onOpen(t)} className="flex-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground">Use</button>
                  <button onClick={() => duplicate(t)} className="rounded border border-border px-2 py-1 text-xs">Duplicate</button>
                  {!t.is_builtin && (
                    <button
                      onClick={async () => {
                        if (!confirm(`Delete ${t.name}?`)) return;
                        await del({ data: { id: t.id } });
                        qc.invalidateQueries({ queryKey: ["ad-templates"] });
                      }}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TemplatePreview({ def }: { def: TemplateDefinition }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = def.canvas.w;
    c.height = def.canvas.h;
    renderTemplateToCanvas(c, def, {}, null);
  }, [def]);
  return <canvas ref={ref} className="h-full w-full object-cover" />;
}

/* ---------------- Editor ---------------- */

type SlotOverride = {
  text?: string;
  color?: string;
  fill?: string;
  size?: number;
  weight?: number;
  align?: "left" | "center" | "right";
  imageDataUrl?: string;
};

function EditorTab({ template, onSaved }: { template: AdTemplate | null; onSaved: () => void }) {
  const list = useServerFn(listAdProfiles);
  const { data: profiles = [] } = useQuery({ queryKey: ["ad-profiles"], queryFn: () => list() });
  const activeProfile = profiles.find((p) => p.is_active) ?? profiles[0];

  const [overrides, setOverrides] = useState<Record<string, SlotOverride>>({});
  const [selectedSizes, setSelectedSizes] = useState<string[]>(["square"]);
  const [name, setName] = useState("Untitled creative");
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const record = useServerFn(recordAdCreative);
  const qc = useQueryClient();

  const def = template?.definition as unknown as TemplateDefinition | undefined;

  // Apply profile colors to overrides on template load
  useEffect(() => {
    if (!def || !activeProfile) return;
    const c = (activeProfile.colors as Record<string, string>) ?? {};
    const next: Record<string, SlotOverride> = {};
    for (const s of def.slots) {
      if (s.type === "shape") {
        const id = s.id.toLowerCase();
        if (id.includes("cta")) next[s.id] = { fill: c.primary };
        else if (id.includes("price") || id.includes("tag")) next[s.id] = { fill: c.accent };
      }
    }
    setOverrides((prev) => ({ ...next, ...prev }));
  }, [def, activeProfile]);

  const renderPreview = useCallback(() => {
    if (!canvasRef.current || !def) return;
    canvasRef.current.width = def.canvas.w;
    canvasRef.current.height = def.canvas.h;
    renderTemplateToCanvas(canvasRef.current, def, overrides, activeProfile ?? null);
  }, [def, overrides, activeProfile]);

  useEffect(() => {
    renderPreview();
  }, [renderPreview]);

  if (!template || !def) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Pick a template from the Templates tab to start editing.
      </div>
    );
  }

  async function handleImageUpload(slotId: string, file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      setOverrides((p) => ({ ...p, [slotId]: { ...(p[slotId] ?? {}), imageDataUrl: reader.result as string } }));
    };
    reader.readAsDataURL(file);
  }

  async function handleExport() {
    if (!def) return;
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");

      for (const sid of selectedSizes) {
        const preset = SIZE_PRESETS.find((s) => s.id === sid)!;
        const off = document.createElement("canvas");
        off.width = preset.w;
        off.height = preset.h;
        await renderTemplateToCanvasScaled(off, def, overrides, activeProfile ?? null, preset.w, preset.h);
        const blob: Blob = await new Promise((res) => off.toBlob((b) => res(b!), "image/png"));
        const path = `${uid}/facebook-ads/${crypto.randomUUID()}-${preset.id}.png`;
        const { error } = await supabase.storage.from("frames").upload(path, blob, {
          contentType: "image/png",
          upsert: false,
        });
        if (error) throw error;
        await record({
          data: {
            name: `${name} — ${preset.label}`,
            size_preset: preset.id,
            storage_path: path,
            template_id: template.id,
            profile_id: activeProfile?.id ?? null,
          },
        });
      }
      qc.invalidateQueries({ queryKey: ["ad-creatives"] });
      toast.success(`Exported ${selectedSizes.length} creative(s)`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-sm text-muted-foreground">Template</div>
            <div className="text-lg font-semibold">{template.name}</div>
          </div>
          <div className="text-xs text-muted-foreground">
            Profile: <span className="text-foreground">{activeProfile?.name ?? "None"}</span>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <canvas ref={canvasRef} className="mx-auto block max-h-[70vh] w-auto max-w-full rounded shadow-sm" />
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <label className="block text-xs font-medium text-muted-foreground">
            Creative name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </label>

          <div className="mt-3">
            <div className="mb-1 text-xs font-medium text-muted-foreground">Sizes</div>
            <div className="flex flex-wrap gap-1.5">
              {SIZE_PRESETS.map((s) => {
                const on = selectedSizes.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() =>
                      setSelectedSizes((prev) => (on ? prev.filter((x) => x !== s.id) : [...prev, s.id]))
                    }
                    className={`rounded-full border px-3 py-1 text-xs ${on ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={handleExport}
            disabled={saving || selectedSizes.length === 0}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> {saving ? "Exporting..." : `Export ${selectedSizes.length} size(s)`}
          </button>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-2 text-sm font-semibold">Slots</h3>
          <div className="space-y-3">
            {def.slots.map((s) => (
              <SlotEditor
                key={s.id}
                slot={s}
                value={overrides[s.id] ?? {}}
                onChange={(v) => setOverrides((p) => ({ ...p, [s.id]: { ...(p[s.id] ?? {}), ...v } }))}
                onImage={(f) => handleImageUpload(s.id, f)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SlotEditor({
  slot,
  value,
  onChange,
  onImage,
}: {
  slot: SlotDef;
  value: SlotOverride;
  onChange: (v: SlotOverride) => void;
  onImage: (f: File) => void;
}) {
  const d = slot.defaults as Record<string, unknown>;
  return (
    <div className="rounded-md border border-border p-2">
      <div className="mb-1 text-xs font-medium capitalize">{slot.id} <span className="text-muted-foreground">({slot.type})</span></div>
      {slot.type === "text" && (
        <div className="space-y-1.5">
          <textarea
            value={value.text ?? (d.text as string) ?? ""}
            onChange={(e) => onChange({ text: e.target.value })}
            className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
            rows={2}
          />
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={value.color ?? (d.color as string) ?? "#111111"}
              onChange={(e) => onChange({ color: e.target.value })}
              className="h-6 w-8 rounded border border-border"
            />
            <input
              type="number"
              value={value.size ?? (d.size as number) ?? 32}
              onChange={(e) => onChange({ size: Number(e.target.value) })}
              className="w-16 rounded border border-border bg-background px-1 py-0.5 text-xs"
            />
            <select
              value={value.align ?? (d.align as string) ?? "left"}
              onChange={(e) => onChange({ align: e.target.value as "left" | "center" | "right" })}
              className="rounded border border-border bg-background px-1 py-0.5 text-xs"
            >
              <option value="left">L</option>
              <option value="center">C</option>
              <option value="right">R</option>
            </select>
          </div>
        </div>
      )}
      {slot.type === "shape" && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Fill</span>
          <input
            type="color"
            value={value.fill ?? (d.fill as string) ?? "#1877F2"}
            onChange={(e) => onChange({ fill: e.target.value })}
            className="h-6 w-10 rounded border border-border"
          />
        </div>
      )}
      {slot.type === "image" && (
        <label className="flex cursor-pointer items-center gap-2 rounded border border-dashed border-border px-2 py-2 text-xs text-muted-foreground hover:border-primary">
          <ImageIcon className="h-4 w-4" />
          {value.imageDataUrl ? "Replace image" : "Upload image"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImage(f);
            }}
          />
        </label>
      )}
    </div>
  );
}

/* ---------------- Exports ---------------- */

function ExportsTab() {
  const list = useServerFn(listAdCreatives);
  const del = useServerFn(deleteAdCreative);
  const qc = useQueryClient();
  const { data: creatives = [] } = useQuery({ queryKey: ["ad-creatives"], queryFn: () => list() });

  async function saveToLibrary(c: { name: string; storage_path: string }) {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");
      const filename = c.storage_path.split("/").pop() ?? `${crypto.randomUUID()}.png`;
      const newPath = `${uid}/social-facebook-published/${filename}`;
      const { data: blob } = await supabase.storage.from("frames").download(c.storage_path);
      if (!blob) throw new Error("Source not found");
      const { error } = await supabase.storage.from("frames").upload(newPath, blob, {
        contentType: "image/png",
        upsert: false,
      });
      if (error) throw error;
      await supabase.from("images").insert({
        owner_id: uid,
        name: c.name,
        storage_path: newPath,
      });
      toast.success("Saved to Facebook library");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function downloadCreative(c: { name: string; storage_path: string }) {
    const { data } = await supabase.storage.from("frames").createSignedUrl(c.storage_path, 60);
    if (!data?.signedUrl) return;
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = `${c.name}.png`;
    a.click();
  }

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Exported creatives</h2>
      {creatives.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No exports yet. Build one in the Editor tab.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {creatives.map((c) => (
            <div key={c.id} className="overflow-hidden rounded-md border border-border bg-card">
              <div className="aspect-square bg-muted">
                <SignedImage bucket="frames" path={c.storage_path} alt={c.name} className="h-full w-full object-cover" />
              </div>
              <div className="p-2">
                <div className="truncate text-xs" title={c.name}>{c.name}</div>
                <div className="text-[10px] text-muted-foreground">{c.size_preset}</div>
                <div className="mt-1.5 flex gap-1">
                  <button onClick={() => downloadCreative(c)} className="flex-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                    Download
                  </button>
                  <button onClick={() => saveToLibrary(c)} className="flex-1 rounded bg-secondary px-1.5 py-0.5 text-[10px]">
                    To library
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm("Delete?")) return;
                      await del({ data: { id: c.id, storage_path: c.storage_path } });
                      qc.invalidateQueries({ queryKey: ["ad-creatives"] });
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Canvas rendering ---------------- */

const imageCache = new Map<string, HTMLImageElement>();
function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached && cached.complete) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = src;
  });
}

function renderTemplateToCanvas(
  canvas: HTMLCanvasElement,
  def: TemplateDefinition,
  overrides: Record<string, SlotOverride>,
  profile: AdProfile | null,
) {
  return renderTemplateToCanvasScaled(canvas, def, overrides, profile, def.canvas.w, def.canvas.h);
}

async function renderTemplateToCanvasScaled(
  canvas: HTMLCanvasElement,
  def: TemplateDefinition,
  overrides: Record<string, SlotOverride>,
  profile: AdProfile | null,
  outW: number,
  outH: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const sx = outW / def.canvas.w;
  const sy = outH / def.canvas.h;
  const s = Math.min(sx, sy);
  // fill background, use profile background if present else canvas.bg
  const bg = (profile?.colors as Record<string, string>)?.background ?? def.canvas.bg;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, outW, outH);

  // Center-fit content
  const contentW = def.canvas.w * s;
  const contentH = def.canvas.h * s;
  const offX = (outW - contentW) / 2;
  const offY = (outH - contentH) / 2;

  const fonts = (profile?.fonts as Record<string, string>) ?? {};

  for (const slot of def.slots) {
    const d = slot.defaults as Record<string, unknown>;
    const o = overrides[slot.id] ?? {};
    const x = offX + slot.x * s;
    const y = offY + slot.y * s;
    const w = slot.w * s;
    const h = slot.h * s;

    if (slot.type === "shape") {
      const fill = o.fill ?? (d.fill as string) ?? "#000";
      const radius = ((d.radius as number) ?? 0) * s;
      ctx.fillStyle = fill;
      roundRect(ctx, x, y, w, h, radius);
      ctx.fill();
    } else if (slot.type === "image") {
      const src = o.imageDataUrl;
      if (src) {
        try {
          const img = await loadImage(src);
          const fit = (d.fit as string) ?? "cover";
          drawImageFit(ctx, img, x, y, w, h, fit);
        } catch {
          ctx.fillStyle = "#e5e7eb";
          ctx.fillRect(x, y, w, h);
        }
      } else {
        ctx.fillStyle = "#e5e7eb";
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = "#9ca3af";
        ctx.font = `${16 * s}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("image slot", x + w / 2, y + h / 2);
      }
      const op = d.opacity as number | undefined;
      if (op !== undefined && op < 1) {
        ctx.fillStyle = `rgba(0,0,0,${1 - op})`;
        ctx.fillRect(x, y, w, h);
      }
    } else if (slot.type === "text") {
      const text = o.text ?? (d.text as string) ?? "";
      const size = ((o.size ?? (d.size as number) ?? 32) as number) * s;
      const weight = (o.weight ?? (d.weight as number) ?? 400) as number;
      const color = o.color ?? (d.color as string) ?? "#111";
      const align = (o.align ?? (d.align as string) ?? "left") as CanvasTextAlign;
      const family = fonts.headline ?? "Inter";
      ctx.fillStyle = color;
      ctx.font = `${weight} ${size}px ${family}, system-ui, sans-serif`;
      ctx.textAlign = align;
      ctx.textBaseline = "top";
      const tx = align === "center" ? x + w / 2 : align === "right" ? x + w : x;
      wrapText(ctx, text, tx, y, w, size * 1.15);
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const paragraphs = text.split("\n");
  let cy = y;
  for (const para of paragraphs) {
    const words = para.split(" ");
    let line = "";
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, cy);
        line = word;
        cy += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) {
      ctx.fillText(line, x, cy);
      cy += lineHeight;
    }
  }
}

function drawImageFit(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, fit: string) {
  const ir = img.width / img.height;
  const br = w / h;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (fit === "cover") {
    if (ir > br) {
      sw = img.height * br;
      sx = (img.width - sw) / 2;
    } else {
      sh = img.width / br;
      sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  } else {
    let dw = w, dh = h;
    if (ir > br) dh = w / ir;
    else dw = h * ir;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }
}
