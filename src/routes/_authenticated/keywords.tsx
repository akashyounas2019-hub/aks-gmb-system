import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Trash2, Upload, Plus, Search, X, FileUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
  created_at: string;
};

// Lenient CSV/TSV parser
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
  // A header row is mostly non-numeric strings
  const nonNumeric = row.filter((c) => c && !/^-?\d/.test(c.trim())).length;
  return nonNumeric >= Math.ceil(row.length / 2);
}

function KeywordsPage() {
  const [rows, setRows] = useState<Keyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const semrushRef = useRef<HTMLInputElement>(null);
  const genericRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("keywords")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    setRows((data ?? []) as Keyword[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function readFileText(file: File): Promise<string> {
    // For .txt/.csv/.tsv/.json we can just read as text
    return await file.text();
  }

  async function importSemrush(file: File) {
    const text = await readFileText(file);
    const rows = parseCSV(text);
    if (rows.length < 2) {
      toast.error("File appears empty");
      return;
    }
    const headers = rows[0];
    const iPhrase = pickIndex(headers, ["keyword", "phrase", "query"]);
    if (iPhrase < 0) {
      toast.error(
        'No "Keyword" column found. Use "Generic import" for other formats.',
      );
      return;
    }
    const iVol = pickIndex(headers, ["search volume", "volume"]);
    const iKD = pickIndex(headers, [
      "keyword difficulty",
      "difficulty",
      "kd",
      "kd%",
    ]);
    const iCPC = pickIndex(headers, ["cpc", "cpc (usd)"]);
    const iIntent = pickIndex(headers, ["intent", "search intent"]);
    const iCluster = pickIndex(headers, ["cluster", "topic", "group"]);

    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid) return toast.error("Not signed in");

    const payload = rows
      .slice(1)
      .map((r) => ({
        owner_id: uid,
        phrase: (r[iPhrase] ?? "").trim(),
        volume: iVol >= 0 ? toNum(r[iVol]) : null,
        keyword_difficulty: iKD >= 0 ? toNum(r[iKD]) : null,
        cpc: iCPC >= 0 ? toNum(r[iCPC]) : null,
        intent: iIntent >= 0 ? (r[iIntent] ?? "").trim() || null : null,
        cluster: iCluster >= 0 ? (r[iCluster] ?? "").trim() || null : null,
        source: "semrush-csv",
      }))
      .filter((k) => k.phrase);

    await insertBatch(payload);
  }

  async function importGeneric(file: File) {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid) return toast.error("Not signed in");
    const name = file.name.toLowerCase();
    const text = await readFileText(file).catch(() => "");
    if (!text) {
      toast.error("Could not read this file. Try CSV, TSV, TXT, or JSON.");
      return;
    }

    let phrases: Array<{
      phrase: string;
      volume?: number | null;
      cluster?: string | null;
    }> = [];

    // JSON — accept array of strings or array of objects with { keyword|phrase, volume? }
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
                  toNum(String(item.volume ?? item.search_volume ?? "")) ??
                  null,
                cluster:
                  (item.cluster ?? item.topic ?? item.group ?? null) || null,
              });
          }
        }
      } catch {
        toast.error("Invalid JSON");
        return;
      }
    }
    // Plain text — one keyword per line
    else if (name.endsWith(".txt") || !/[,;\t]/.test(text.split(/\r?\n/)[0] ?? "")) {
      phrases = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((phrase) => ({ phrase }));
    }
    // Any delimited file — auto-detect the keyword column
    else {
      const parsed = parseCSV(text);
      if (!parsed.length) {
        toast.error("File is empty");
        return;
      }
      let headers = parsed[0];
      let dataRows = parsed.slice(1);
      const hasHeader = looksLikeHeader(headers);
      if (!hasHeader) {
        // No header — treat first column as phrase
        dataRows = parsed;
        headers = headers.map((_, i) => `col_${i}`);
      }
      const iPhrase = hasHeader
        ? pickIndex(headers, ["keyword", "phrase", "query", "term"])
        : 0;
      const pIdx = iPhrase >= 0 ? iPhrase : 0;
      const iVol = hasHeader
        ? pickIndex(headers, ["search volume", "volume"])
        : -1;
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
      phrase: p.phrase,
      volume: p.volume ?? null,
      keyword_difficulty: null,
      cpc: null,
      intent: null,
      cluster: p.cluster ?? null,
      source: `import:${name.split(".").pop() ?? "file"}`,
    }));

    await insertBatch(payload);
  }

  async function insertBatch(
    payload: Array<{
      owner_id: string;
      phrase: string;
      volume: number | null;
      keyword_difficulty: number | null;
      cpc: number | null;
      intent: string | null;
      cluster: string | null;
      source: string;
    }>,
  ) {
    if (!payload.length) {
      toast.error("No keywords found in file");
      return;
    }
    const chunk = 200;
    for (let i = 0; i < payload.length; i += chunk) {
      const { error } = await supabase
        .from("keywords")
        .insert(payload.slice(i, i + chunk));
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    toast.success(`Imported ${payload.length} keywords`);
    load();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("keywords").delete().eq("id", id);
    if (error) toast.error(error.message);
    else setRows((r) => r.filter((k) => k.id !== id));
  }

  const filtered = search.trim()
    ? rows.filter(
        (r) =>
          r.phrase.toLowerCase().includes(search.toLowerCase()) ||
          (r.cluster ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : rows;

  return (
    <div
      className="w-full py-6 pl-6 md:py-10 md:pl-10"
      style={{ paddingRight: 50 }}
    >
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl">Keywords</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Add keywords manually, import a Semrush CSV, or bring in any other
            file (CSV, TSV, TXT, JSON).
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
            onClick={() => setManualOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add manually
          </button>
          <button
            onClick={() => semrushRef.current?.click()}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm hover:border-primary/50"
          >
            <Upload className="h-4 w-4" /> Semrush CSV
          </button>
          <button
            onClick={() => genericRef.current?.click()}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm hover:border-primary/50"
          >
            <FileUp className="h-4 w-4" /> Generic import
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter keywords or cluster"
            className="flex-1 bg-transparent text-sm outline-none"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Phrase</th>
              <th className="px-3 py-2">Volume</th>
              <th className="px-3 py-2">KD</th>
              <th className="px-3 py-2">CPC</th>
              <th className="px-3 py-2">Intent</th>
              <th className="px-3 py-2">Cluster</th>
              <th className="px-3 py-2">Source</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  No keywords yet. Add manually or import a file.
                </td>
              </tr>
            ) : (
              filtered.map((k) => (
                <tr key={k.id} className="border-t border-border">
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
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {k.source}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => remove(k.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {manualOpen && (
        <ManualAddModal
          onClose={() => setManualOpen(false)}
          onAdded={load}
        />
      )}
    </div>
  );
}

function ManualAddModal({
  onClose,
  onAdded,
}: {
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
    if (!phrases.length) {
      toast.error("Enter at least one keyword");
      return;
    }
    setSaving(true);
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid) {
      setSaving(false);
      return toast.error("Not signed in");
    }
    const rows = phrases.map((phrase) => ({
      owner_id: uid,
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
              One per line or comma-separated.
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
            placeholder={"deep cleaning dubai\nsofa cleaning near me\nmove-in cleaning al qusais"}
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
            placeholder="e.g. deep cleaning"
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
