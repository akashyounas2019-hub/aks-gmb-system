import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Trash2, Upload, Plus, Search } from "lucide-react";
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

// Lenient CSV parser: handles quoted fields and commas/semicolons/tabs
function parseCSV(text: string): string[][] {
  // Detect delimiter from header
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
      } else if (c === '"') {
        inQuotes = false;
      } else field += c;
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
  // fuzzy contains
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

function KeywordsPage() {
  const [rows, setRows] = useState<Keyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [addPhrase, setAddPhrase] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("keywords")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setRows((data ?? []) as Keyword[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCSV(file: File) {
    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length < 2) {
      toast.error("CSV appears empty");
      return;
    }
    const headers = rows[0];
    const iPhrase = pickIndex(headers, ["keyword", "phrase", "query"]);
    if (iPhrase < 0) {
      toast.error(
        'No "Keyword" column found. Expected a Semrush-style CSV export.',
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

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      toast.error("Not signed in");
      return;
    }

    const payload = rows
      .slice(1)
      .map((r) => ({
        owner_id: uid,
        phrase: (r[iPhrase] ?? "").trim(),
        volume: iVol >= 0 ? (toNum(r[iVol]) as number | null) : null,
        keyword_difficulty: iKD >= 0 ? toNum(r[iKD]) : null,
        cpc: iCPC >= 0 ? toNum(r[iCPC]) : null,
        intent: iIntent >= 0 ? (r[iIntent] ?? "").trim() || null : null,
        cluster: iCluster >= 0 ? (r[iCluster] ?? "").trim() || null : null,
        source: "semrush-csv",
      }))
      .filter((k) => k.phrase);

    if (!payload.length) {
      toast.error("No keyword rows found");
      return;
    }

    // Insert in batches
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

  async function addManual() {
    const p = addPhrase.trim();
    if (!p) return;
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;
    const { error } = await supabase
      .from("keywords")
      .insert({ owner_id: uid, phrase: p, source: "manual" });
    if (error) toast.error(error.message);
    else {
      setAddPhrase("");
      load();
    }
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
    <div className="w-full py-6 pl-6 md:py-10 md:pl-10" style={{ paddingRight: 50 }}>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl">Keywords</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Import Semrush exports or add keywords manually. Attach them to
            images in the Library.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.tsv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleCSV(f);
              e.currentTarget.value = "";
            }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
          >
            <Upload className="h-4 w-4" /> Import Semrush CSV
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
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <input
            value={addPhrase}
            onChange={(e) => setAddPhrase(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addManual()}
            placeholder="Add keyword…"
            className="w-52 bg-transparent text-sm outline-none"
          />
          <button
            onClick={addManual}
            className="rounded p-1 text-primary hover:bg-accent"
            aria-label="Add keyword"
          >
            <Plus className="h-4 w-4" />
          </button>
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
                  No keywords yet. Import a Semrush CSV to get started.
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

      <p className="mt-4 text-xs text-muted-foreground">
        Expected Semrush columns: <span className="font-mono">Keyword</span>,{" "}
        <span className="font-mono">Search Volume</span>,{" "}
        <span className="font-mono">Keyword Difficulty</span>,{" "}
        <span className="font-mono">CPC</span>,{" "}
        <span className="font-mono">Intent</span>. Extras are ignored.
      </p>
    </div>
  );
}
