import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Trash2,
  Upload,
  Plus,
  Search,
  X,
  FileUp,
  Folder,
  FolderPlus,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Inbox,
  Layers,
  MoreHorizontal,
  Move,
  Download,
  Sparkles,
  Pencil,
  Target,
  DollarSign,
  Gauge,
  ListChecks,
  Tag,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/keywords")({
  component: KeywordsPage,
});

type Keyword = {
  id: string;
  phrase: string;
  volume: number | null;
  keyword_difficulty: number | null;
  cpc: number | null;
  intent: string | null;
  cluster: string | null;
  source: string | null;
  folder_id: string | null;
  tracked?: boolean;
  created_at: string;
};

type KFolder = {
  id: string;
  owner_id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  color: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

type ScopeKey = "all" | "unfiled" | string; // folder id or special

const FOLDER_COLORS = [
  { name: "Slate", value: "#64748b" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Emerald", value: "#10b981" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Cyan", value: "#06b6d4" },
];

// ---------------- CSV helpers (kept from previous impl) ----------------
function parseCSV(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = firstLine.includes("\t")
    ? "\t"
    : firstLine.split(";").length > firstLine.split(",").length
      ? ";"
      : ",";
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === delim) {
        cur.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = "";
      } else field += c;
    }
  }
  if (field.length || cur.length) {
    cur.push(field);
    rows.push(cur);
  }
  return rows.filter((r) => r.some((v) => v && v.trim().length));
}

function pickIndex(headers: string[], names: string[]): number {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const n of names) {
    const i = lower.indexOf(n.toLowerCase());
    if (i >= 0) return i;
  }
  for (const n of names) {
    const i = lower.findIndex((h) => h.includes(n.toLowerCase()));
    if (i >= 0) return i;
  }
  return -1;
}

function toNum(v: string | undefined): number | null {
  if (!v) return null;
  const cleaned = v.replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function looksLikeHeader(row: string[]): boolean {
  const nonNumeric = row.filter((c) => c && !/^-?\d/.test(c.trim())).length;
  return nonNumeric >= Math.ceil(row.length / 2);
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelativeTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// ---------------- Component ----------------
function KeywordsPage() {
  const [rows, setRows] = useState<Keyword[]>([]);
  const [folders, setFolders] = useState<KFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [intentFilter, setIntentFilter] = useState<string>("all");
  const [minVolume, setMinVolume] = useState<string>("");
  const [scope, setScope] = useState<ScopeKey>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<Set<string>>(new Set());

  const [manualOpen, setManualOpen] = useState(false);
  const [folderModal, setFolderModal] = useState<{
    mode: "create" | "edit";
    parentId: string | null;
    folder?: KFolder;
  } | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [activeTab, setActiveTab] = useState<"research" | "library">("research");
  const [researchQuery, setResearchQuery] = useState("");

  // Tracks CSV / TXT / JSON imports so the Research tab can show a visual
  // history list under the upload area instead of relying only on a toast.
  type ImportRecord = {
    id: string;
    name: string;
    size: number;
    count: number;
    source: "semrush" | "generic";
    folderName: string;
    at: number;
  };
  const [imports, setImports] = useState<ImportRecord[]>([]);

  const semrushRef = useRef<HTMLInputElement>(null);
  const genericRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: kws }, { data: fs }] = await Promise.all([
      supabase
        .from("keywords")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("keyword_folders" as any)
        .select("*")
        .order("position", { ascending: true }),
    ]);
    setRows((kws ?? []) as Keyword[]);
    setFolders(((fs ?? []) as unknown) as KFolder[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ---------- Folder tree ----------
  const folderChildren = useMemo(() => {
    const map = new Map<string | null, KFolder[]>();
    for (const f of folders) {
      const key = f.parent_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return map;
  }, [folders]);

  const folderById = useMemo(() => {
    const m = new Map<string, KFolder>();
    folders.forEach((f) => m.set(f.id, f));
    return m;
  }, [folders]);

  const descendantIds = useCallback(
    (folderId: string): Set<string> => {
      const out = new Set<string>();
      const stack = [folderId];
      while (stack.length) {
        const id = stack.pop()!;
        out.add(id);
        (folderChildren.get(id) ?? []).forEach((c) => stack.push(c.id));
      }
      return out;
    },
    [folderChildren],
  );

  const countByFolder = useMemo(() => {
    const m = new Map<string | null, number>();
    for (const r of rows) {
      const k = r.folder_id ?? null;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    // include descendant counts
    const totals = new Map<string, number>();
    for (const f of folders) {
      let total = 0;
      for (const id of descendantIds(f.id)) total += m.get(id) ?? 0;
      totals.set(f.id, total);
    }
    return { direct: m, totals };
  }, [rows, folders, descendantIds]);

  const currentFolder =
    scope !== "all" && scope !== "unfiled" ? folderById.get(scope) ?? null : null;

  const scopedRows = useMemo(() => {
    if (scope === "all") return rows;
    if (scope === "unfiled") return rows.filter((r) => !r.folder_id);
    const ids = descendantIds(scope);
    return rows.filter((r) => r.folder_id && ids.has(r.folder_id));
  }, [rows, scope, descendantIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const min = minVolume ? Number(minVolume) : null;
    return scopedRows.filter((r) => {
      if (q) {
        const hay = `${r.phrase} ${r.cluster ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (intentFilter !== "all") {
        if ((r.intent ?? "").toLowerCase() !== intentFilter) return false;
      }
      if (min != null && Number.isFinite(min)) {
        if ((r.volume ?? 0) < min) return false;
      }
      return true;
    });
  }, [scopedRows, search, intentFilter, minVolume]);

  const stats = useMemo(() => {
    const totalKw = scopedRows.length;
    const withVol = scopedRows.filter((r) => r.volume != null);
    const withKD = scopedRows.filter((r) => r.keyword_difficulty != null);
    const withCPC = scopedRows.filter((r) => r.cpc != null);
    const totalVol = withVol.reduce((s, r) => s + (r.volume ?? 0), 0);
    const avgKD = withKD.length
      ? withKD.reduce((s, r) => s + (r.keyword_difficulty ?? 0), 0) / withKD.length
      : null;
    const avgCPC = withCPC.length
      ? withCPC.reduce((s, r) => s + Number(r.cpc ?? 0), 0) / withCPC.length
      : null;
    const clusters = new Set(scopedRows.map((r) => r.cluster).filter(Boolean));
    return { totalKw, totalVol, avgKD, avgCPC, clusters: clusters.size };
  }, [scopedRows]);

  const availableIntents = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.intent && s.add(r.intent.toLowerCase()));
    return Array.from(s).sort();
  }, [rows]);

  const scopeFolderIdForNew: string | null =
    scope !== "all" && scope !== "unfiled" ? scope : null;

  // ---------- Folder ops ----------
  async function createFolder(input: {
    name: string;
    description: string | null;
    color: string | null;
    parentId: string | null;
  }) {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid) return toast.error("Not signed in");
    const { data, error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("keyword_folders" as any)
      .insert({
        owner_id: uid,
        name: input.name,
        description: input.description,
        color: input.color,
        parent_id: input.parentId,
        position: folders.filter((f) => f.parent_id === input.parentId).length,
      })
      .select()
      .single();
    if (error) return toast.error(error.message);
    toast.success("Folder created");
    if (input.parentId) setExpanded((prev) => new Set(prev).add(input.parentId!));
    await load();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newId = (data as any)?.id as string | undefined;
    if (newId) setScope(newId);
  }

  async function updateFolder(
    id: string,
    patch: Partial<Pick<KFolder, "name" | "description" | "color">>,
  ) {
    const { error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("keyword_folders" as any)
      .update(patch)
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Folder updated");
    await load();
  }

  async function deleteFolder(id: string) {
    const f = folderById.get(id);
    if (!f) return;
    if (
      !confirm(
        `Delete folder "${f.name}"? Nested folders are also removed. Keywords inside are moved to Unfiled.`,
      )
    )
      return;
    const { error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("keyword_folders" as any)
      .delete()
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.message("Folder removed");
    if (scope === id) setScope("all");
    await load();
  }

  // ---------- Keyword ops ----------
  async function moveKeywords(ids: string[], targetFolderId: string | null) {
    if (!ids.length) return;
    const { error } = await supabase
      .from("keywords")
      .update({ folder_id: targetFolderId })
      .in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(
      `Moved ${ids.length} keyword${ids.length === 1 ? "" : "s"} to ${
        targetFolderId ? folderById.get(targetFolderId)?.name ?? "folder" : "Unfiled"
      }`,
    );
    setSelection(new Set());
    await load();
  }

  async function deleteKeywords(ids: string[]) {
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} keyword${ids.length === 1 ? "" : "s"}?`)) return;
    const { error } = await supabase.from("keywords").delete().in("id", ids);
    if (error) return toast.error(error.message);
    setRows((r) => r.filter((k) => !ids.includes(k.id)));
    setSelection(new Set());
  }

  async function removeOne(id: string) {
    const { error } = await supabase.from("keywords").delete().eq("id", id);
    if (error) toast.error(error.message);
    else setRows((r) => r.filter((k) => k.id !== id));
  }

  // ---------- Imports ----------
  async function readFileText(file: File): Promise<string> {
    return await file.text();
  }

  async function importSemrush(file: File) {
    const text = await readFileText(file);
    const rowsCsv = parseCSV(text);
    if (rowsCsv.length < 2) return toast.error("File appears empty");
    const headers = rowsCsv[0];
    const iPhrase = pickIndex(headers, ["keyword", "phrase", "query"]);
    if (iPhrase < 0)
      return toast.error('No "Keyword" column found. Use "Generic import" instead.');
    const iVol = pickIndex(headers, ["search volume", "volume"]);
    const iKD = pickIndex(headers, ["keyword difficulty", "difficulty", "kd", "kd%"]);
    const iCPC = pickIndex(headers, ["cpc", "cpc (usd)"]);
    const iIntent = pickIndex(headers, ["intent", "search intent"]);
    const iCluster = pickIndex(headers, ["cluster", "topic", "group"]);
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid) return toast.error("Not signed in");
    const payload = rowsCsv
      .slice(1)
      .map((r) => ({
        owner_id: uid,
        folder_id: scopeFolderIdForNew,
        phrase: (r[iPhrase] ?? "").trim(),
        volume: iVol >= 0 ? toNum(r[iVol]) : null,
        keyword_difficulty: iKD >= 0 ? toNum(r[iKD]) : null,
        cpc: iCPC >= 0 ? toNum(r[iCPC]) : null,
        intent: iIntent >= 0 ? (r[iIntent] ?? "").trim() || null : null,
        cluster: iCluster >= 0 ? (r[iCluster] ?? "").trim() || null : null,
        source: "semrush-csv",
      }))
      .filter((k) => k.phrase);
    const count = await insertBatch(payload);
    recordImport(file, count, "semrush");
  }

  async function importGeneric(file: File) {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid) return toast.error("Not signed in");
    const name = file.name.toLowerCase();
    const text = await readFileText(file).catch(() => "");
    if (!text) return toast.error("Could not read this file.");
    let phrases: Array<{
      phrase: string;
      volume?: number | null;
      cluster?: string | null;
    }> = [];
    if (name.endsWith(".json")) {
      try {
        const parsed = JSON.parse(text);
        const arr = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.keywords)
            ? parsed.keywords
            : [];
        for (const item of arr) {
          if (typeof item === "string") phrases.push({ phrase: item.trim() });
          else if (item && typeof item === "object") {
            const p = String(
              item.keyword ?? item.phrase ?? item.term ?? item.query ?? "",
            ).trim();
            if (p)
              phrases.push({
                phrase: p,
                volume:
                  toNum(String(item.volume ?? item.search_volume ?? "")) ?? null,
                cluster: (item.cluster ?? item.topic ?? item.group ?? null) || null,
              });
          }
        }
      } catch {
        return toast.error("Invalid JSON");
      }
    } else if (name.endsWith(".txt") || !/[,;\t]/.test(text.split(/\r?\n/)[0] ?? "")) {
      phrases = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((phrase) => ({ phrase }));
    } else {
      const parsed = parseCSV(text);
      if (!parsed.length) return toast.error("File is empty");
      let headers = parsed[0];
      let dataRows = parsed.slice(1);
      const hasHeader = looksLikeHeader(headers);
      if (!hasHeader) {
        dataRows = parsed;
        headers = headers.map((_, i) => `col_${i}`);
      }
      const iPhrase = hasHeader
        ? pickIndex(headers, ["keyword", "phrase", "query", "term"])
        : 0;
      const pIdx = iPhrase >= 0 ? iPhrase : 0;
      const iVol = hasHeader ? pickIndex(headers, ["search volume", "volume"]) : -1;
      const iCluster = hasHeader
        ? pickIndex(headers, ["cluster", "topic", "group", "category"])
        : -1;
      phrases = dataRows
        .map((r) => ({
          phrase: (r[pIdx] ?? "").trim(),
          volume: iVol >= 0 ? toNum(r[iVol]) : null,
          cluster: iCluster >= 0 ? (r[iCluster] ?? "").trim() || null : null,
        }))
        .filter((p) => p.phrase);
    }
    const payload = phrases.map((p) => ({
      owner_id: uid,
      folder_id: scopeFolderIdForNew,
      phrase: p.phrase,
      volume: p.volume ?? null,
      keyword_difficulty: null,
      cpc: null,
      intent: null,
      cluster: p.cluster ?? null,
      source: `import:${name.split(".").pop() ?? "file"}`,
    }));
    const count = await insertBatch(payload);
    recordImport(file, count, "generic");
  }

  async function insertBatch(
    payload: Array<{
      owner_id: string;
      folder_id: string | null;
      phrase: string;
      volume: number | null;
      keyword_difficulty: number | null;
      cpc: number | null;
      intent: string | null;
      cluster: string | null;
      source: string;
    }>,
  ): Promise<number> {
    if (!payload.length) {
      toast.error("No keywords found in file");
      return 0;
    }
    const chunk = 200;
    for (let i = 0; i < payload.length; i += chunk) {
      const { error } = await supabase
        .from("keywords")
        .insert(payload.slice(i, i + chunk));
      if (error) {
        toast.error(error.message);
        return 0;
      }
    }
    toast.success(`Imported ${payload.length} keywords`);
    load();
    return payload.length;
  }

  function recordImport(
    file: File,
    count: number,
    source: "semrush" | "generic",
  ) {
    if (count <= 0) return;
    const folderName =
      scope === "unfiled" || scope === "all"
        ? "Unfiled"
        : folderById.get(scope)?.name ?? "Unfiled";
    setImports((prev) =>
      [
        {
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          count,
          source,
          folderName,
          at: Date.now(),
        },
        ...prev,
      ].slice(0, 20),
    );
  }

  // ---------- Export ----------
  function exportCsv() {
    const list = filtered;
    if (!list.length) return toast.error("Nothing to export");
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const scopeName =
      scope === "all"
        ? "all"
        : scope === "unfiled"
          ? "unfiled"
          : (folderById.get(scope)?.name ?? "folder").replace(/[^a-z0-9]+/gi, "-");
    const header = [
      "phrase",
      "volume",
      "keyword_difficulty",
      "cpc",
      "intent",
      "cluster",
      "folder",
      "source",
    ];
    const body = list.map((r) => [
      r.phrase,
      r.volume ?? "",
      r.keyword_difficulty ?? "",
      r.cpc ?? "",
      r.intent ?? "",
      r.cluster ?? "",
      r.folder_id ? folderById.get(r.folder_id)?.name ?? "" : "",
      r.source ?? "",
    ]);
    const csv = [header, ...body].map((row) => row.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `keywords-${scopeName}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------- Enrichment (placeholder — links out to Semrush) ----------
  async function enrichSelection() {
    const ids = Array.from(selection);
    if (!ids.length) return;
    setEnriching(true);
    // Lightweight local enrichment: normalize intent casing and infer cluster from head term
    // Real Semrush enrichment is available via the Semrush connector when configured.
    const targets = rows.filter((r) => ids.includes(r.id));
    for (const t of targets) {
      const head = t.phrase.split(/\s+/).slice(0, 2).join(" ").toLowerCase();
      const patch: Partial<Keyword> = {};
      if (!t.cluster) patch.cluster = head;
      if (t.intent) patch.intent = t.intent.toLowerCase();
      if (Object.keys(patch).length) {
        await supabase.from("keywords").update(patch).eq("id", t.id);
      }
    }
    setEnriching(false);
    toast.success(`Normalized ${targets.length} keyword${targets.length === 1 ? "" : "s"}`);
    setSelection(new Set());
    await load();
  }

  function openSemrushResearch(phrase: string) {
    const url = `https://www.semrush.com/analytics/keywordoverview/?q=${encodeURIComponent(phrase)}&db=us`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  // ---------- Rendering ----------
  const allChecked =
    filtered.length > 0 && filtered.every((r) => selection.has(r.id));

  function toggleAll() {
    if (allChecked) setSelection(new Set());
    else setSelection(new Set(filtered.map((r) => r.id)));
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full flex-col">
      {/* ---------- Top tab bar ---------- */}
      <div className="border-b border-border bg-card/40 px-6 md:px-10">
        <div className="flex items-end justify-between gap-4 pt-6">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <Target className="h-5 w-5 text-primary" /> Keywords
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Research new opportunities, then save and organize them into your keyword library.
            </p>
          </div>
          <div className="hidden text-xs text-muted-foreground md:block">
            {rows.length.toLocaleString()} saved · {folders.length} folder
            {folders.length === 1 ? "" : "s"}
          </div>
        </div>
        <nav role="tablist" className="mt-4 flex gap-1">
          {(
            [
              { id: "research" as const, label: "Keyword Research", icon: Search },
              { id: "library" as const, label: "Library", icon: FolderOpen },
            ]
          ).map((t) => {
            const active = activeTab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(t.id)}
                className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition ${
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {activeTab === "research" && (
        <div className="w-full px-6 py-6 md:px-10 md:py-10">
          <div className="space-y-6">
            {/* Research bar */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-lg font-semibold">Research a keyword</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Look up volume, difficulty, and intent on Semrush without leaving your workflow.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <div className="flex flex-1 min-w-[260px] items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <input
                    value={researchQuery}
                    onChange={(e) => setResearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && researchQuery.trim())
                        openSemrushResearch(researchQuery.trim());
                    }}
                    placeholder="e.g. sofa cleaning services dubai"
                    className="flex-1 bg-transparent text-sm outline-none"
                  />
                </div>
                <button
                  onClick={() =>
                    researchQuery.trim() && openSemrushResearch(researchQuery.trim())
                  }
                  disabled={!researchQuery.trim()}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  <Sparkles className="h-4 w-4" /> Research on Semrush
                </button>
              </div>
            </div>

            {/* Add & Import */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-2">
                  <Plus className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold">Add keywords manually</h3>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Type or paste a list of phrases. Metrics can be filled later.
                </p>
                <button
                  onClick={() => setManualOpen(true)}
                  className="mt-4 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
                >
                  <Plus className="h-4 w-4" /> Add keywords
                </button>
              </div>
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-2">
                  <Upload className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold">Import from file</h3>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Bulk import from Semrush exports or any CSV / TSV / TXT / JSON.
                </p>
                <input
                  ref={semrushRef}
                  type="file"
                  accept=".csv,.tsv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importSemrush(f);
                    e.currentTarget.value = "";
                  }}
                />
                <input
                  ref={genericRef}
                  type="file"
                  accept=".csv,.tsv,.txt,.json,text/*,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importGeneric(f);
                    e.currentTarget.value = "";
                  }}
                />
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => semrushRef.current?.click()}
                    className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:border-primary/50"
                  >
                    <Upload className="h-4 w-4" /> Semrush CSV
                  </button>
                  <button
                    onClick={() => genericRef.current?.click()}
                    className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:border-primary/50"
                  >
                    <FileUp className="h-4 w-4" /> CSV / TSV / TXT / JSON
                  </button>
                </div>
              </div>
            </div>

            {/* Imported files — visual history of CSV/TXT/JSON uploads */}
            {imports.length > 0 && (
              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
                  <div className="flex items-center gap-2">
                    <FileUp className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">Imported files</h3>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {imports.length}
                    </span>
                  </div>
                  <button
                    onClick={() => setImports([])}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                </div>
                <ul className="divide-y divide-border/60">
                  {imports.map((imp) => (
                    <li
                      key={imp.id}
                      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <FileUp className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{imp.name}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                            +{imp.count.toLocaleString()} keywords
                          </span>
                          <span>
                            {imp.source === "semrush" ? "Semrush CSV" : "Generic import"}
                          </span>
                          <span>·</span>
                          <span>{formatBytes(imp.size)}</span>
                          <span>·</span>
                          <span>into {imp.folderName}</span>
                          <span>·</span>
                          <span>{formatRelativeTime(imp.at)}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setActiveTab("library");
                        }}
                        className="shrink-0 rounded-md border border-border bg-background px-2.5 py-1 text-xs hover:border-primary/50"
                      >
                        View in Library
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-lg border border-dashed border-border bg-background/30 p-4 text-sm text-muted-foreground">
              Everything you save here shows up under the <strong>Library</strong> tab, where you can
              organize keywords into folders and clusters.
            </div>
          </div>
        </div>
      )}

      {activeTab === "library" && (
        <div className="flex flex-1 flex-col">
          {/* Horizontal Library toolbar — replaces the old vertical sidebar */}
          <div className="border-b border-border bg-card/40">
            <div className="flex flex-wrap items-center gap-3 px-6 py-3 md:px-10">
              <div className="flex shrink-0 items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Layers className="h-4 w-4" />
                </div>
                <div className="leading-tight">
                  <div className="text-sm font-semibold">Library</div>
                  <div className="text-[11px] text-muted-foreground">
                    {folders.length} folder{folders.length === 1 ? "" : "s"} ·{" "}
                    {rows.length} keywords
                  </div>
                </div>
              </div>

              <div className="mx-1 hidden h-8 w-px bg-border sm:block" />

              <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1">
                <ToolbarChip
                  icon={<Layers className="h-3.5 w-3.5" />}
                  label="All keywords"
                  count={rows.length}
                  active={scope === "all"}
                  onClick={() => setScope("all")}
                />
                <ToolbarChip
                  icon={<Inbox className="h-3.5 w-3.5" />}
                  label="Unfiled"
                  count={rows.filter((r) => !r.folder_id).length}
                  active={scope === "unfiled"}
                  onClick={() => setScope("unfiled")}
                />

                {folders.length > 0 && (
                  <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
                )}

                {flattenFolders(folderChildren.get(null) ?? [], folderChildren).map(
                  ({ folder, depth }) => (
                    <FolderToolbarChip
                      key={folder.id}
                      folder={folder}
                      depth={depth}
                      count={countByFolder.totals.get(folder.id) ?? 0}
                      active={scope === folder.id}
                      onClick={() => setScope(folder.id)}
                      onEdit={() =>
                        setFolderModal({
                          mode: "edit",
                          parentId: folder.parent_id,
                          folder,
                        })
                      }
                      onDelete={() => deleteFolder(folder.id)}
                      onAddChild={() =>
                        setFolderModal({ mode: "create", parentId: folder.id })
                      }
                    />
                  ),
                )}

                {folders.length === 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1 text-[11px] text-muted-foreground">
                    <Folder className="h-3 w-3" />
                    No folders yet
                  </span>
                )}
              </div>

              <button
                onClick={() =>
                  setFolderModal({ mode: "create", parentId: scopeFolderIdForNew })
                }
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/15"
              >
                <FolderPlus className="h-3.5 w-3.5" /> New folder
              </button>
            </div>
          </div>

          {/* ---------- Main panel ---------- */}
          <div className="min-w-0 flex-1 px-6 py-6 md:px-10 md:py-10">
        {/* Breadcrumb + header */}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <button onClick={() => setScope("all")} className="hover:text-foreground">
                Keywords
              </button>
              {scope === "unfiled" && (
                <>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-foreground">Unfiled</span>
                </>
              )}
              {currentFolder &&
                buildBreadcrumb(currentFolder, folderById).map((f) => (
                  <span key={f.id} className="flex items-center gap-2">
                    <ChevronRight className="h-3 w-3" />
                    <button
                      onClick={() => setScope(f.id)}
                      className={
                        f.id === currentFolder.id
                          ? "text-foreground"
                          : "hover:text-foreground"
                      }
                    >
                      {f.name}
                    </button>
                  </span>
                ))}
            </div>
            <div className="mt-1 flex items-center gap-3">
              <div className="flex items-center gap-2">
                {currentFolder ? (
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ background: currentFolder.color ?? "#64748b" }}
                  />
                ) : (
                  <Target className="h-5 w-5 text-primary" />
                )}
                <h1 className="text-3xl">
                  {scope === "all"
                    ? "All keywords"
                    : scope === "unfiled"
                      ? "Unfiled"
                      : currentFolder?.name ?? "Keywords"}
                </h1>
              </div>
              {currentFolder && (
                <button
                  onClick={() =>
                    setFolderModal({
                      mode: "edit",
                      parentId: currentFolder.parent_id,
                      folder: currentFolder,
                    })
                  }
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  title="Edit folder"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {currentFolder?.description ??
                "Organize your keyword universe into folders — one folder per service, campaign, or client theme. Import from Semrush or any CSV, then research and cluster from a single workspace."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              ref={semrushRef}
              type="file"
              accept=".csv,.tsv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importSemrush(f);
                e.currentTarget.value = "";
              }}
            />
            <input
              ref={genericRef}
              type="file"
              accept=".csv,.tsv,.txt,.json,text/*,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importGeneric(f);
                e.currentTarget.value = "";
              }}
            />
            <button
              onClick={() =>
                setFolderModal({ mode: "create", parentId: scopeFolderIdForNew })
              }
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:border-primary/50"
            >
              <FolderPlus className="h-4 w-4" /> New folder
            </button>
            <button
              onClick={() => setManualOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Add keywords
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:border-primary/50">
                  <Upload className="h-4 w-4" /> Import
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs">
                  Import into {currentFolder ? `"${currentFolder.name}"` : "Unfiled"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => semrushRef.current?.click()}>
                  <Upload className="mr-2 h-4 w-4" /> Semrush CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => genericRef.current?.click()}>
                  <FileUp className="mr-2 h-4 w-4" /> CSV / TSV / TXT / JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              onClick={exportCsv}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:border-primary/50"
            >
              <Download className="h-4 w-4" /> Export
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi
            icon={<ListChecks className="h-4 w-4" />}
            label="Keywords"
            value={stats.totalKw.toLocaleString()}
          />
          <Kpi
            icon={<Target className="h-4 w-4" />}
            label="Total volume"
            value={stats.totalVol.toLocaleString()}
          />
          <Kpi
            icon={<Gauge className="h-4 w-4" />}
            label="Avg difficulty"
            value={stats.avgKD != null ? `${stats.avgKD.toFixed(0)}` : "—"}
          />
          <Kpi
            icon={<DollarSign className="h-4 w-4" />}
            label="Avg CPC"
            value={stats.avgCPC != null ? `$${stats.avgCPC.toFixed(2)}` : "—"}
          />
          <Kpi
            icon={<Tag className="h-4 w-4" />}
            label="Clusters"
            value={stats.clusters.toString()}
          />
        </div>

        {/* Filter bar */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex flex-1 min-w-[240px] items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search phrase or cluster"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <select
            value={intentFilter}
            onChange={(e) => setIntentFilter(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
          >
            <option value="all">All intents</option>
            {availableIntents.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <input
            value={minVolume}
            onChange={(e) => setMinVolume(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="Min volume"
            className="w-32 rounded-lg border border-border bg-card px-3 py-2 text-sm"
          />
          {(search || intentFilter !== "all" || minVolume) && (
            <button
              onClick={() => {
                setSearch("");
                setIntentFilter("all");
                setMinVolume("");
              }}
              className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:border-primary/50"
            >
              Clear
            </button>
          )}
        </div>

        {/* Bulk action bar */}
        {selection.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
            <span>
              <strong>{selection.size}</strong> selected
            </span>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:border-primary/50">
                    <Move className="h-3.5 w-3.5" /> Move to folder
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                  <DropdownMenuItem onClick={() => moveKeywords(Array.from(selection), null)}>
                    <Inbox className="mr-2 h-4 w-4" /> Unfiled
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {folders.length === 0 ? (
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      No folders yet
                    </DropdownMenuLabel>
                  ) : (
                    folders.map((f) => (
                      <DropdownMenuItem
                        key={f.id}
                        onClick={() => moveKeywords(Array.from(selection), f.id)}
                      >
                        <span
                          className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                          style={{ background: f.color ?? "#64748b" }}
                        />
                        {folderPath(f, folderById)}
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                onClick={enrichSelection}
                disabled={enriching}
                className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:border-primary/50 disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {enriching ? "Normalizing…" : "Normalize"}
              </button>
              <button
                onClick={() => deleteKeywords(Array.from(selection))}
                className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/20"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
              <button
                onClick={() => setSelection(new Set())}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    aria-label="Select all"
                  />
                </th>
                <th className="px-3 py-2">Phrase</th>
                <th className="px-3 py-2">Volume</th>
                <th className="px-3 py-2">KD</th>
                <th className="px-3 py-2">CPC</th>
                <th className="px-3 py-2">Intent</th>
                <th className="px-3 py-2">Cluster</th>
                <th className="px-3 py-2">Folder</th>
                <th className="px-3 py-2">Source</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center text-muted-foreground">
                    <FolderOpen className="mx-auto h-6 w-6 text-muted-foreground" />
                    <p className="mt-2 text-sm">
                      No keywords in{" "}
                      <strong>
                        {scope === "all"
                          ? "your library"
                          : scope === "unfiled"
                            ? "Unfiled"
                            : currentFolder?.name}
                      </strong>
                      .
                    </p>
                    <p className="mt-1 text-xs">
                      Add manually, import a file, or move keywords in from another folder.
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((k) => {
                  const folder = k.folder_id ? folderById.get(k.folder_id) : null;
                  const checked = selection.has(k.id);
                  return (
                    <tr
                      key={k.id}
                      className={`border-t border-border ${checked ? "bg-primary/5" : ""}`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setSelection((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(k.id);
                              else next.delete(k.id);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium">{k.phrase}</td>
                      <td className="px-3 py-2 font-mono">
                        {k.volume?.toLocaleString() ?? "—"}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {k.keyword_difficulty ?? "—"}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {k.cpc != null ? `$${k.cpc}` : "—"}
                      </td>
                      <td className="px-3 py-2">{k.intent ?? "—"}</td>
                      <td className="px-3 py-2">{k.cluster ?? "—"}</td>
                      <td className="px-3 py-2">
                        {folder ? (
                          <button
                            onClick={() => setScope(folder.id)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-xs hover:border-primary/50"
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ background: folder.color ?? "#64748b" }}
                            />
                            {folder.name}
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Unfiled</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {k.source}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="rounded p-1 text-muted-foreground hover:bg-accent"
                              aria-label="Row actions"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="max-h-72 overflow-y-auto"
                          >
                            <DropdownMenuItem onClick={() => openSemrushResearch(k.phrase)}>
                              <Sparkles className="mr-2 h-4 w-4" /> Research on Semrush
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel className="text-xs">
                              Move to
                            </DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => moveKeywords([k.id], null)}>
                              <Inbox className="mr-2 h-4 w-4" /> Unfiled
                            </DropdownMenuItem>
                            {folders.map((f) => (
                              <DropdownMenuItem
                                key={f.id}
                                onClick={() => moveKeywords([k.id], f.id)}
                              >
                                <span
                                  className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                                  style={{ background: f.color ?? "#64748b" }}
                                />
                                {folderPath(f, folderById)}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => removeOne(k.id)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Showing {filtered.length} of {scopedRows.length}
            {scope !== "all" && ` in this folder`}.
          </p>
        )}
      </div>
        </div>
      )}

      {manualOpen && (
        <ManualAddModal
          folderId={scopeFolderIdForNew}
          folderName={
            currentFolder?.name ?? (scope === "unfiled" ? "Unfiled" : "your library")
          }
          onClose={() => setManualOpen(false)}
          onAdded={load}
        />
      )}

      {folderModal && (
        <FolderModal
          mode={folderModal.mode}
          parentId={folderModal.parentId}
          folder={folderModal.folder}
          folders={folders}
          onClose={() => setFolderModal(null)}
          onSubmit={async (payload) => {
            if (folderModal.mode === "create") {
              await createFolder({
                name: payload.name,
                description: payload.description,
                color: payload.color,
                parentId: folderModal.parentId,
              });
            } else if (folderModal.folder) {
              await updateFolder(folderModal.folder.id, {
                name: payload.name,
                description: payload.description,
                color: payload.color,
              });
            }
            setFolderModal(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------- Subcomponents ----------------

function Kpi({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function SidebarItem({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${
        active
          ? "bg-primary/10 text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      <span className="text-[11px] text-muted-foreground">{count}</span>
    </button>
  );
}

function flattenFolders(
  roots: KFolder[],
  childrenMap: Map<string | null, KFolder[]>,
  depth = 0,
): Array<{ folder: KFolder; depth: number }> {
  const out: Array<{ folder: KFolder; depth: number }> = [];
  for (const f of roots) {
    out.push({ folder: f, depth });
    const kids = childrenMap.get(f.id) ?? [];
    if (kids.length) out.push(...flattenFolders(kids, childrenMap, depth + 1));
  }
  return out;
}

function ToolbarChip({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "border-primary bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20"
          : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:bg-primary/[0.04] hover:text-foreground"
      }`}
    >
      {icon}
      <span>{label}</span>
      <span
        className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
          active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function FolderToolbarChip({
  folder,
  depth,
  count,
  active,
  onClick,
  onEdit,
  onDelete,
  onAddChild,
}: {
  folder: KFolder;
  depth: number;
  count: number;
  active: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddChild: () => void;
}) {
  return (
    <div
      className={`group inline-flex shrink-0 items-center overflow-hidden rounded-full border text-xs transition ${
        active
          ? "border-primary bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20"
          : "border-border bg-background hover:border-primary/50 hover:bg-primary/[0.04]"
      }`}
    >
      <button
        onClick={onClick}
        className="inline-flex items-center gap-1.5 py-1.5 pl-3 pr-2 font-medium"
        title={folder.name}
      >
        {depth > 0 && (
          <span className="text-muted-foreground">
            {"› ".repeat(depth).trim()}
          </span>
        )}
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: folder.color ?? "#64748b" }}
        />
        <Folder
          className={`h-3.5 w-3.5 ${active ? "text-primary" : "text-muted-foreground"}`}
        />
        <span className="max-w-[10rem] truncate">{folder.name}</span>
        <span
          className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
            active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {count}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="rounded-full p-1 text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground group-hover:opacity-100 mr-1"
            aria-label="Folder actions"
          >
            <MoreHorizontal className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onAddChild}>
            <FolderPlus className="mr-2 h-4 w-4" /> New subfolder
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="mr-2 h-4 w-4" /> Rename / edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onDelete}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}


function FolderNode({
  folder,
  depth,
  childrenMap,
  totals,
  expanded,
  setExpanded,
  scope,
  setScope,
  onEdit,
  onDelete,
  onAddChild,
}: {
  folder: KFolder;
  depth: number;
  childrenMap: Map<string | null, KFolder[]>;
  totals: Map<string, number>;
  expanded: Set<string>;
  setExpanded: (updater: (prev: Set<string>) => Set<string>) => void;
  scope: ScopeKey;
  setScope: (s: ScopeKey) => void;
  onEdit: (folder: KFolder) => void;
  onDelete: (id: string) => void;
  onAddChild: (parentId: string) => void;
}) {
  const children = childrenMap.get(folder.id) ?? [];
  const hasChildren = children.length > 0;
  const isOpen = expanded.has(folder.id);
  const active = scope === folder.id;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-md px-1 py-1 pr-2 text-sm ${
          active ? "bg-primary/10" : "hover:bg-accent"
        }`}
        style={{ paddingLeft: 4 + depth * 12 }}
      >
        <button
          onClick={() =>
            setExpanded((prev) => {
              const next = new Set(prev);
              if (next.has(folder.id)) next.delete(folder.id);
              else next.add(folder.id);
              return next;
            })
          }
          className={`rounded p-0.5 ${
            hasChildren
              ? "text-muted-foreground hover:bg-accent hover:text-foreground"
              : "invisible"
          }`}
        >
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          onClick={() => setScope(folder.id)}
          className="flex flex-1 items-center gap-2 truncate text-left"
        >
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: folder.color ?? "#64748b" }}
          />
          <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{folder.name}</span>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {totals.get(folder.id) ?? 0}
          </span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="rounded p-1 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
              aria-label="Folder actions"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onAddChild(folder.id)}>
              <FolderPlus className="mr-2 h-4 w-4" /> New subfolder
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(folder)}>
              <Pencil className="mr-2 h-4 w-4" /> Rename / edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(folder.id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isOpen &&
        children.map((c) => (
          <FolderNode
            key={c.id}
            folder={c}
            depth={depth + 1}
            childrenMap={childrenMap}
            totals={totals}
            expanded={expanded}
            setExpanded={setExpanded}
            scope={scope}
            setScope={setScope}
            onEdit={onEdit}
            onDelete={onDelete}
            onAddChild={onAddChild}
          />
        ))}
    </div>
  );
}

function buildBreadcrumb(folder: KFolder, map: Map<string, KFolder>): KFolder[] {
  const chain: KFolder[] = [];
  let cur: KFolder | undefined = folder;
  while (cur) {
    chain.unshift(cur);
    cur = cur.parent_id ? map.get(cur.parent_id) : undefined;
  }
  return chain;
}

function folderPath(folder: KFolder, map: Map<string, KFolder>): string {
  return buildBreadcrumb(folder, map)
    .map((f) => f.name)
    .join(" / ");
}

// ---------- Manual add modal ----------
function ManualAddModal({
  folderId,
  folderName,
  onClose,
  onAdded,
}: {
  folderId: string | null;
  folderName: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [text, setText] = useState("");
  const [cluster, setCluster] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const phrases = text
      .split(/\r?\n|,/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (!phrases.length) return toast.error("Enter at least one keyword");
    setSaving(true);
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid) {
      setSaving(false);
      return toast.error("Not signed in");
    }
    const rows = phrases.map((phrase) => ({
      owner_id: uid,
      folder_id: folderId,
      phrase,
      cluster: cluster.trim() || null,
      source: "manual",
    }));
    const { error } = await supabase.from("keywords").insert(rows);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success(`Added ${rows.length} keyword${rows.length > 1 ? "s" : ""}`);
      onAdded();
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-background p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Add keywords</h2>
            <p className="text-xs text-muted-foreground">
              Saved to <strong>{folderName}</strong> · one per line or comma-separated.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-accent"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="block text-sm">
          <span className="text-xs text-muted-foreground">Keywords</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={"sofa cleaning near me\nleather couch cleaning\nsteam sofa cleaning dubai"}
            className="mt-1 w-full rounded border border-border bg-background p-2 text-sm outline-none focus:border-primary"
            autoFocus
          />
        </label>
        <label className="mt-3 block text-sm">
          <span className="text-xs text-muted-foreground">
            Cluster / topic (optional)
          </span>
          <input
            value={cluster}
            onChange={(e) => setCluster(e.target.value)}
            placeholder="e.g. sofa cleaning"
            className="mt-1 w-full rounded border border-border bg-background p-2 text-sm outline-none focus:border-primary"
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save keywords"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Folder create/edit modal ----------
function FolderModal({
  mode,
  parentId,
  folder,
  folders,
  onClose,
  onSubmit,
}: {
  mode: "create" | "edit";
  parentId: string | null;
  folder?: KFolder;
  folders: KFolder[];
  onClose: () => void;
  onSubmit: (payload: {
    name: string;
    description: string | null;
    color: string | null;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(folder?.name ?? "");
  const [description, setDescription] = useState(folder?.description ?? "");
  const [color, setColor] = useState<string | null>(folder?.color ?? FOLDER_COLORS[1].value);
  const [saving, setSaving] = useState(false);

  const parent = parentId ? folders.find((f) => f.id === parentId) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Folder name is required");
    setSaving(true);
    await onSubmit({
      name: name.trim(),
      description: description.trim() || null,
      color,
    });
    setSaving(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              {mode === "create" ? "New folder" : "Edit folder"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {parent ? (
                <>Inside <strong>{parent.name}</strong></>
              ) : (
                "At the top level"
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-accent"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="block text-sm">
          <span className="text-xs text-muted-foreground">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sofa cleaning services"
            className="mt-1 w-full rounded border border-border bg-background p-2 text-sm outline-none focus:border-primary"
          />
        </label>

        <label className="mt-3 block text-sm">
          <span className="text-xs text-muted-foreground">Description (optional)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Notes for this folder — client, campaign, or theme."
            className="mt-1 w-full rounded border border-border bg-background p-2 text-sm outline-none focus:border-primary"
          />
        </label>

        <div className="mt-3">
          <span className="text-xs text-muted-foreground">Color</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {FOLDER_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setColor(c.value)}
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition ${
                  color === c.value ? "border-foreground" : "border-transparent"
                }`}
                style={{ background: c.value }}
                aria-label={c.name}
                title={c.name}
              />
            ))}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : mode === "create" ? "Create folder" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
