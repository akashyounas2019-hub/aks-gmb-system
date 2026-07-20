import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  FolderPlus,
  Folder,
  FolderOpen,
  Upload,
  Trash2,
  Download,
  Search,
  ChevronRight,
  ChevronDown,
  ClipboardList,
  ClipboardCheck,
  ShieldCheck,
  Files,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/resources")({
  head: () => ({
    meta: [
      { title: "Resources — GMB Rank Pilot" },
      {
        name: "description",
        content:
          "Save, organize, and access files, SOPs, checklists, and audits in one place.",
      },
    ],
  }),
  component: ResourcesPage,
});

type ResourceKind = "file" | "sop" | "checklist" | "audit";

type ResourceItem = {
  id: string;
  name: string;
  kind: ResourceKind;
  folderId: string;
  size: number; // bytes
  mime: string;
  createdAt: number;
  dataUrl: string; // stored inline (localStorage). Kept small in practice.
};

type ResourceFolder = {
  id: string;
  name: string;
  parentId: string | null;
};

const STORAGE_FOLDERS = "resources:folders:v1";
const STORAGE_ITEMS = "resources:items:v1";

const KIND_META: Record<
  ResourceKind,
  { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  file: { label: "Files", icon: Files, tone: "text-sky-500" },
  sop: { label: "SOPs", icon: FileText, tone: "text-primary" },
  checklist: { label: "Checklists", icon: ClipboardCheck, tone: "text-emerald-500" },
  audit: { label: "Audits", icon: ShieldCheck, tone: "text-amber-500" },
};

const DEFAULT_FOLDERS: ResourceFolder[] = [
  { id: "root", name: "All resources", parentId: null },
  { id: "onboarding", name: "Onboarding", parentId: "root" },
  { id: "operations", name: "Operations", parentId: "root" },
  { id: "sops", name: "Standard Operating Procedures", parentId: "operations" },
  { id: "checklists", name: "Daily Checklists", parentId: "operations" },
  { id: "audits", name: "Quality Audits", parentId: "operations" },
];

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON<T>(key: string, val: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* quota */
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function inferKind(name: string): ResourceKind {
  const n = name.toLowerCase();
  if (/sop|procedure/.test(n)) return "sop";
  if (/checklist/.test(n)) return "checklist";
  if (/audit|inspection/.test(n)) return "audit";
  return "file";
}

function ResourcesPage() {
  const [hydrated, setHydrated] = useState(false);
  const [folders, setFolders] = useState<ResourceFolder[]>(DEFAULT_FOLDERS);
  const [items, setItems] = useState<ResourceItem[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string>("root");
  const [openFolders, setOpenFolders] = useState<Set<string>>(
    () => new Set(["root", "operations"]),
  );
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<ResourceKind | "all">("all");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFolders(loadJSON(STORAGE_FOLDERS, DEFAULT_FOLDERS));
    setItems(loadJSON(STORAGE_ITEMS, [] as ResourceItem[]));
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated) saveJSON(STORAGE_FOLDERS, folders);
  }, [folders, hydrated]);
  useEffect(() => {
    if (hydrated) saveJSON(STORAGE_ITEMS, items);
  }, [items, hydrated]);

  // Counts per folder (recursive) and per kind for the active folder
  const descendantsOf = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const f of folders) map.set(f.id, new Set([f.id]));
    // Simple DFS to include descendants
    for (const f of folders) {
      let cursor: string | null = f.parentId;
      while (cursor) {
        map.get(cursor)?.add(f.id);
        cursor = folders.find((x) => x.id === cursor)?.parentId ?? null;
      }
    }
    return map;
  }, [folders]);

  function countInFolder(folderId: string, kind?: ResourceKind) {
    const set = descendantsOf.get(folderId) ?? new Set([folderId]);
    return items.filter(
      (i) => set.has(i.folderId) && (!kind || i.kind === kind),
    ).length;
  }

  const activeFolder = folders.find((f) => f.id === activeFolderId) ?? folders[0];
  const activeDescendants = descendantsOf.get(activeFolderId) ?? new Set([activeFolderId]);

  const visibleItems = useMemo(() => {
    let list = items.filter((i) => activeDescendants.has(i.folderId));
    if (kindFilter !== "all") list = list.filter((i) => i.kind === kindFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q));
    }
    list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }, [items, activeDescendants, kindFilter, search]);

  function toggleFolder(id: string) {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addFolder(parentId: string) {
    const name = window.prompt("Folder name")?.trim();
    if (!name) return;
    const id = crypto.randomUUID();
    setFolders((prev) => [...prev, { id, name, parentId }]);
    setOpenFolders((prev) => new Set(prev).add(parentId));
    toast.success(`Folder “${name}” added`);
  }

  function deleteFolder(id: string) {
    if (id === "root") {
      toast.error("Cannot delete the root folder");
      return;
    }
    const descendants = descendantsOf.get(id) ?? new Set([id]);
    const itemCount = items.filter((i) => descendants.has(i.folderId)).length;
    if (
      !window.confirm(
        `Delete this folder${itemCount ? ` and its ${itemCount} item(s)` : ""}?`,
      )
    )
      return;
    setFolders((prev) => prev.filter((f) => !descendants.has(f.id)));
    setItems((prev) => prev.filter((i) => !descendants.has(i.folderId)));
    if (descendants.has(activeFolderId)) setActiveFolderId("root");
    toast.success("Folder deleted");
  }

  async function handleUpload(files: FileList | null, kindHint?: ResourceKind) {
    if (!files || files.length === 0) return;
    const parent = activeFolderId;
    const results: ResourceItem[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error(`${file.name} exceeds 2 MB (local storage limit)`);
        continue;
      }
      try {
        const dataUrl = await fileToDataUrl(file);
        results.push({
          id: crypto.randomUUID(),
          name: file.name,
          kind: kindHint ?? inferKind(file.name),
          folderId: parent,
          size: file.size,
          mime: file.type || "application/octet-stream",
          createdAt: Date.now(),
          dataUrl,
        });
      } catch {
        toast.error(`Failed to read ${file.name}`);
      }
    }
    if (results.length) {
      setItems((prev) => [...results, ...prev]);
      toast.success(`Added ${results.length} item(s)`);
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function deleteItem(id: string) {
    if (!window.confirm("Delete this item?")) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function downloadItem(item: ResourceItem) {
    const a = document.createElement("a");
    a.href = item.dataUrl;
    a.download = item.name;
    a.click();
  }

  function changeKind(id: string, kind: ResourceKind) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, kind } : i)));
  }

  // Breadcrumb for the active folder
  const breadcrumb: ResourceFolder[] = useMemo(() => {
    const chain: ResourceFolder[] = [];
    let cursor: ResourceFolder | undefined = activeFolder;
    while (cursor) {
      chain.unshift(cursor);
      cursor = folders.find((f) => f.id === cursor?.parentId);
    }
    return chain;
  }, [activeFolder, folders]);

  return (
    <div className="w-full py-6 pl-6 md:py-10 md:pl-10" style={{ paddingRight: 50 }}>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground" />

          <h1 className="text-3xl">Resources</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Save and organize files, SOPs, checklists, and audits with folders.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Upload className="h-4 w-4" /> Upload
          </button>
          <button
            onClick={() => addFolder(activeFolderId)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent"
          >
            <FolderPlus className="h-4 w-4" /> New folder
          </button>
        </div>
      </div>

      {/* Kind summary cards */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(KIND_META) as ResourceKind[]).map((k) => {
          const meta = KIND_META[k];
          const Icon = meta.icon;
          const count = countInFolder("root", k);
          const on = kindFilter === k;
          return (
            <button
              key={k}
              onClick={() => setKindFilter(on ? "all" : k)}
              className={`flex items-center justify-between rounded-xl border p-4 text-left transition ${
                on
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <div>
                <div className={`inline-flex items-center gap-1.5 text-xs uppercase tracking-widest ${meta.tone}`}>
                  <Icon className="h-3.5 w-3.5" />
                  {meta.label}
                </div>
                <div className="mt-2 text-2xl font-semibold">{count}</div>
              </div>
              <ClipboardList className="h-6 w-6 text-muted-foreground/40" />
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Folder tree */}
        <aside className="rounded-2xl border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Folders
            </div>
            <button
              onClick={() => addFolder("root")}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="New top-level folder"
              aria-label="New top-level folder"
            >
              <FolderPlus className="h-4 w-4" />
            </button>
          </div>
          <FolderTree
            folders={folders}
            openIds={openFolders}
            activeId={activeFolderId}
            onToggle={toggleFolder}
            onSelect={setActiveFolderId}
            onAddChild={addFolder}
            onDelete={deleteFolder}
            countInFolder={countInFolder}
          />
        </aside>

        {/* File pane */}
        <section className="rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-center gap-1 text-sm">
              {breadcrumb.map((f, idx) => (
                <span key={f.id} className="inline-flex items-center gap-1">
                  {idx > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                  <button
                    onClick={() => setActiveFolderId(f.id)}
                    className={`rounded px-1.5 py-0.5 ${
                      f.id === activeFolderId
                        ? "font-semibold text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f.name}
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search resources"
                className="w-56 bg-transparent text-xs outline-none"
              />
            </div>
          </div>

          {visibleItems.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              <FolderOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              No resources here yet. Upload a file or add a new folder.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {visibleItems.map((item) => {
                const meta = KIND_META[item.kind];
                const Icon = meta.icon;
                const folder = folders.find((f) => f.id === item.folderId);
                return (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-muted ${meta.tone}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium" title={item.name}>
                        {item.name}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{formatSize(item.size)}</span>
                        <span>·</span>
                        <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                        {folder && folder.id !== activeFolderId && (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-0.5">
                              <Folder className="h-2.5 w-2.5" />
                              {folder.name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <select
                      value={item.kind}
                      onChange={(e) => changeKind(item.id, e.target.value as ResourceKind)}
                      className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                      aria-label="Change category"
                    >
                      {(Object.keys(KIND_META) as ResourceKind[]).map((k) => (
                        <option key={k} value={k}>
                          {KIND_META[k].label.replace(/s$/, "")}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => downloadItem(item)}
                      className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      title="Download"
                      aria-label="Download"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="Delete"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function FolderTree({
  folders,
  openIds,
  activeId,
  onToggle,
  onSelect,
  onAddChild,
  onDelete,
  countInFolder,
}: {
  folders: ResourceFolder[];
  openIds: Set<string>;
  activeId: string;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (id: string) => void;
  countInFolder: (id: string) => number;
}) {
  const childrenOf = (id: string | null) => folders.filter((f) => f.parentId === id);

  function Node({ folder, depth }: { folder: ResourceFolder; depth: number }) {
    const kids = childrenOf(folder.id);
    const isOpen = openIds.has(folder.id);
    const isActive = activeId === folder.id;
    return (
      <div>
        <div
          className={`group flex items-center gap-1 rounded-md py-1 pr-1 text-sm ${
            isActive ? "bg-primary/15 text-primary" : "hover:bg-accent/50"
          }`}
          style={{ paddingLeft: 4 + depth * 12 }}
        >
          {kids.length > 0 ? (
            <button
              onClick={() => onToggle(folder.id)}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label={isOpen ? "Collapse" : "Expand"}
            >
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <span className="inline-block w-4" />
          )}
          <button
            onClick={() => onSelect(folder.id)}
            className="flex flex-1 items-center gap-2 text-left"
          >
            {isOpen && kids.length > 0 ? (
              <FolderOpen className="h-4 w-4" />
            ) : (
              <Folder className="h-4 w-4" />
            )}
            <span className="truncate">{folder.name}</span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {countInFolder(folder.id)}
            </span>
          </button>
          <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
            <button
              onClick={() => onAddChild(folder.id)}
              className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Add subfolder"
              aria-label="Add subfolder"
            >
              <FolderPlus className="h-3 w-3" />
            </button>
            {folder.id !== "root" && (
              <button
                onClick={() => onDelete(folder.id)}
                className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title="Delete folder"
                aria-label="Delete folder"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
        {isOpen && kids.length > 0 && (
          <div>
            {kids.map((k) => (
              <Node key={k.id} folder={k} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const roots = childrenOf(null);
  return (
    <div className="space-y-0.5">
      {roots.map((r) => (
        <Node key={r.id} folder={r} depth={0} />
      ))}
    </div>
  );
}
