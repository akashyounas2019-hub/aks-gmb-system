import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Download,
  ShieldCheck,
  Upload,
  User,
  AlertCircle,
  Database,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/backups")({
  head: () => ({
    meta: [
      { title: "Backups & Restore — GMB Rank Pilot" },
      {
        name: "description",
        content: "Back up or restore your image library, geotags, and metadata with one click.",
      },
    ],
  }),
  component: BackupsPage,
});

type Status = "idle" | "running" | "success" | "error";

type LogItem = {
  id: string;
  label: string;
  state: "pending" | "ok" | "fail";
  detail?: string;
};

function BackupsPage() {
  const [currentUser, setCurrentUser] = useState<{ id: string; email?: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [backupStatus, setBackupStatus] = useState<Status>("idle");
  const [backupProgress, setBackupProgress] = useState({ done: 0, total: 0 });
  const [backupLog, setBackupLog] = useState<LogItem[]>([]);
  const [backupSummary, setBackupSummary] = useState<{
    ok: number;
    fail: number;
    downloadUrl?: string;
    filename?: string;
  } | null>(null);

  const [importStatus, setImportStatus] = useState<Status>("idle");
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0, step: "" });
  const [importLog, setImportLog] = useState<LogItem[]>([]);
  const [importSummary, setImportSummary] = useState<{
    imagesCount: number;
    foldersCount: number;
    keywordsCount: number;
    locationsCount: number;
  } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setCurrentUser({ id: data.user.id, email: data.user.email ?? undefined });
      }
      setAuthLoading(false);
    });
  }, []);

  async function runBackup() {
    setBackupStatus("running");
    setBackupProgress({ done: 0, total: 0 });
    setBackupLog([]);
    setBackupSummary(null);

    const stepIds = {
      auth: crypto.randomUUID(),
      listImg: crypto.randomUUID(),
      sign: crypto.randomUUID(),
      pkg: crypto.randomUUID(),
    };
    const push = (item: LogItem) => setBackupLog((prev) => [...prev, item]);
    const patch = (id: string, s: LogItem["state"], detail?: string) =>
      setBackupLog((prev) => prev.map((l) => (l.id === id ? { ...l, state: s, detail } : l)));

    try {
      push({ id: stepIds.auth, label: "Verify session", state: "pending" });
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) throw new Error("Not signed in");
      patch(stepIds.auth, "ok", userData.user.email ?? undefined);

      push({ id: stepIds.listImg, label: "List images & database tables", state: "pending" });
      const [
        { data: images, error: imgErr },
        { data: videos },
        { data: keywords },
        { data: keywordFolders },
        { data: imageFolders },
        { data: competitors },
        { data: automations },
        { data: locationHistory },
      ] = await Promise.all([
        supabase
          .from("images")
          .select(
            "id,name,title,description,storage_path,folder_id,venue_id,video_id,lat,lng,width,height,posted_at,created_at,deleted_at,is_favorite",
          )
          .is("deleted_at", null),
        supabase.from("videos").select("*"),
        supabase.from("keywords").select("*"),
        supabase.from("keyword_folders" as any).select("*"),
        supabase.from("image_folders" as any).select("*"),
        supabase.from("competitors").select("*"),
        supabase.from("automations").select("*"),
        supabase.from("location_history").select("*"),
      ]);

      if (imgErr) throw imgErr;
      patch(
        stepIds.listImg,
        "ok",
        `${images?.length ?? 0} images, ${(imageFolders ?? []).length} folders, ${(keywords ?? []).length} keywords`,
      );

      const total = (images?.length ?? 0) + (videos?.length ?? 0);
      setBackupProgress({ done: 0, total });

      push({ id: stepIds.sign, label: `Generate download links (${total})`, state: "pending" });

      const signedImages: Array<Record<string, unknown>> = [];
      let ok = 0;
      let fail = 0;
      const EXPIRES = 60 * 60 * 24; // 24h

      for (const row of images ?? []) {
        const { data, error } = await supabase.storage
          .from("frames")
          .createSignedUrl(row.storage_path, EXPIRES);
        if (error || !data?.signedUrl) {
          fail++;
          signedImages.push({ ...row, backup_url: null, backup_error: error?.message ?? "no url" });
        } else {
          ok++;
          signedImages.push({ ...row, backup_url: data.signedUrl });
        }
        setBackupProgress((p) => ({ ...p, done: p.done + 1 }));
      }

      const signedVideos: Array<Record<string, unknown>> = [];
      for (const row of videos ?? []) {
        const path = (row as { storage_path?: string }).storage_path;
        if (!path) {
          signedVideos.push({ ...row, backup_url: null, backup_error: "missing storage_path" });
          fail++;
        } else {
          const { data, error } = await supabase.storage
            .from("videos")
            .createSignedUrl(path, EXPIRES);
          if (error || !data?.signedUrl) {
            fail++;
            signedVideos.push({
              ...row,
              backup_url: null,
              backup_error: error?.message ?? "no url",
            });
          } else {
            ok++;
            signedVideos.push({ ...row, backup_url: data.signedUrl });
          }
        }
        setBackupProgress((p) => ({ ...p, done: p.done + 1 }));
      }
      patch(stepIds.sign, fail === 0 ? "ok" : "fail", `${ok} ok, ${fail} failed`);

      push({ id: stepIds.pkg, label: "Package backup manifest", state: "pending" });
      const manifest = {
        version: 2,
        generated_at: new Date().toISOString(),
        user_id: userData.user.id,
        user_email: userData.user.email,
        expires_in_seconds: EXPIRES,
        counts: {
          images: signedImages.length,
          videos: signedVideos.length,
          keywords: (keywords ?? []).length,
          keyword_folders: (keywordFolders ?? []).length,
          image_folders: (imageFolders ?? []).length,
        },
        database_tables: {
          keywords: keywords ?? [],
          keyword_folders: keywordFolders ?? [],
          image_folders: imageFolders ?? [],
          competitors: competitors ?? [],
          automations: automations ?? [],
          location_history: locationHistory ?? [],
        },
        images: signedImages,
        videos: signedVideos,
      };
      const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const filename = `library-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
      patch(stepIds.pkg, "ok", `${(blob.size / 1024).toFixed(1)} KB`);

      setBackupSummary({ ok, fail, downloadUrl: url, filename });
      setBackupStatus(fail === 0 ? "success" : "error");
      if (fail === 0) {
        toast.success("Backup ready", { description: `${ok} files packaged.` });
      } else {
        toast.warning("Backup finished with errors", { description: `${ok} ok · ${fail} failed` });
      }

      // Auto-download
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setBackupStatus("error");
      toast.error("Backup failed", { description: msg });
      setBackupLog((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.state === "pending") {
          return [...prev.slice(0, -1), { ...last, state: "fail", detail: msg }];
        }
        return [
          ...prev,
          { id: crypto.randomUUID(), label: "Backup failed", state: "fail", detail: msg },
        ];
      });
    }
  }

  async function handleImportFile(file: File) {
    setImportStatus("running");
    setImportLog([]);
    setImportSummary(null);

    const stepIds = {
      read: crypto.randomUUID(),
      auth: crypto.randomUUID(),
      folders: crypto.randomUUID(),
      images: crypto.randomUUID(),
      keywords: crypto.randomUUID(),
      locations: crypto.randomUUID(),
    };
    const push = (item: LogItem) => setImportLog((prev) => [...prev, item]);
    const patch = (id: string, s: LogItem["state"], detail?: string) =>
      setImportLog((prev) => prev.map((l) => (l.id === id ? { ...l, state: s, detail } : l)));

    try {
      push({ id: stepIds.read, label: "Read and validate backup file", state: "pending" });
      const text = await file.text();
      const manifest = JSON.parse(text);

      if (!manifest || (!manifest.images && !manifest.database_tables)) {
        throw new Error("Invalid backup file: missing images or database tables.");
      }

      const totalImagesInFile = (manifest.images || []).length;
      patch(
        stepIds.read,
        "ok",
        `Backup version ${manifest.version || 1} · ${totalImagesInFile} images found`,
      );

      push({ id: stepIds.auth, label: "Check active account session", state: "pending" });
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        throw new Error("You must be logged in to restore backup data. Please sign in first.");
      }
      const activeUid = userData.user.id;
      const isOriginalOwner = activeUid === manifest.user_id;

      patch(
        stepIds.auth,
        "ok",
        isOriginalOwner
          ? `Direct restore to matching account (${userData.user.email})`
          : `Cloning into active account (${userData.user.email})`,
      );

      // 1. Process Folders
      push({ id: stepIds.folders, label: "Restoring image folders…", state: "pending" });
      const rawFolders = manifest.database_tables?.image_folders || manifest.image_folders || [];
      const folderMap = new Map<string, string>(); // oldFolderId -> newFolderId

      if (isOriginalOwner) {
        if (rawFolders.length > 0) {
          const rows = rawFolders.map((f: any) => ({
            id: f.id,
            name: f.name,
            owner_id: activeUid,
            created_at: f.created_at || new Date().toISOString(),
          }));
          const { error: foldErr } = await supabase
            .from("image_folders")
            .upsert(rows, { onConflict: "id" });
          if (foldErr) throw foldErr;
        }
        patch(stepIds.folders, "ok", `${rawFolders.length} folders restored`);
      } else {
        // Fetch existing folders for the current account to avoid duplicate folder names
        const { data: existingFolders } = await supabase
          .from("image_folders")
          .select("id, name")
          .eq("owner_id", activeUid);
        const existingByName = new Map((existingFolders || []).map((f) => [f.name.toLowerCase(), f.id]));

        let createdFolders = 0;
        for (const oldFolder of rawFolders) {
          const key = (oldFolder.name || "").toLowerCase();
          if (existingByName.has(key)) {
            folderMap.set(oldFolder.id, existingByName.get(key)!);
          } else {
            const newId = crypto.randomUUID();
            const { error: createErr } = await supabase.from("image_folders").insert({
              id: newId,
              name: oldFolder.name,
              owner_id: activeUid,
            });
            if (!createErr) {
              existingByName.set(key, newId);
              folderMap.set(oldFolder.id, newId);
              createdFolders++;
            }
          }
        }
        patch(
          stepIds.folders,
          "ok",
          `${rawFolders.length} mapped (${createdFolders} new folders created)`,
        );
      }

      // 2. Process Images in Batches
      push({
        id: stepIds.images,
        label: `Restoring ${totalImagesInFile} images…`,
        state: "pending",
      });
      setImportProgress({ done: 0, total: totalImagesInFile, step: "Restoring images…" });

      const rawImages = manifest.images || [];
      const BATCH = 50;
      let imagesRestored = 0;
      let imagesFailed = 0;

      for (let i = 0; i < rawImages.length; i += BATCH) {
        const slice = rawImages.slice(i, i + BATCH);
        const batchRows = slice.map((img: any) => {
          const { backup_url, ...rest } = img;
          const assignedFolderId = isOriginalOwner
            ? img.folder_id
            : img.folder_id
              ? folderMap.get(img.folder_id) || null
              : null;

          return {
            ...rest,
            // If cloning to another user, generate new ID to prevent primary key collision
            id: isOriginalOwner ? img.id : crypto.randomUUID(),
            owner_id: activeUid,
            folder_id: assignedFolderId,
            deleted_at: null,
          };
        });

        if (isOriginalOwner) {
          const { error: batchErr } = await supabase
            .from("images")
            .upsert(batchRows, { onConflict: "id" });
          if (batchErr) {
            imagesFailed += slice.length;
            console.error("Image batch error:", batchErr);
          } else {
            imagesRestored += slice.length;
          }
        } else {
          const { error: batchErr } = await supabase.from("images").insert(batchRows);
          if (batchErr) {
            imagesFailed += slice.length;
            console.error("Image batch error:", batchErr);
          } else {
            imagesRestored += slice.length;
          }
        }

        setImportProgress({
          done: Math.min(i + BATCH, totalImagesInFile),
          total: totalImagesInFile,
          step: `Restoring images (${Math.min(i + BATCH, totalImagesInFile)}/${totalImagesInFile})…`,
        });
      }

      patch(
        stepIds.images,
        imagesFailed === 0 ? "ok" : "fail",
        `${imagesRestored} images restored · ${imagesFailed} failed`,
      );

      // 3. Process Keywords
      push({ id: stepIds.keywords, label: "Restoring keywords…", state: "pending" });
      const rawKeywords = manifest.database_tables?.keywords || manifest.keywords || [];
      let kwRestored = 0;
      if (rawKeywords.length > 0) {
        const kwRows = rawKeywords.map((k: any) => ({
          id: isOriginalOwner ? k.id : crypto.randomUUID(),
          owner_id: activeUid,
          phrase: k.phrase,
          volume: k.volume ?? null,
          keyword_difficulty: k.keyword_difficulty ?? null,
          cpc: k.cpc ?? null,
          intent: k.intent ?? null,
          cluster: k.cluster ?? null,
          source: k.source || "manual",
          tracked: k.tracked ?? false,
        }));
        for (let i = 0; i < kwRows.length; i += 100) {
          const slice = kwRows.slice(i, i + 100);
          if (isOriginalOwner) {
            const { error } = await supabase.from("keywords").upsert(slice, { onConflict: "id" });
            if (!error) kwRestored += slice.length;
          } else {
            const { error } = await supabase.from("keywords").insert(slice);
            if (!error) kwRestored += slice.length;
          }
        }
      }
      patch(stepIds.keywords, "ok", `${kwRestored} keywords restored`);

      // 4. Process Location History
      push({ id: stepIds.locations, label: "Restoring pinned locations…", state: "pending" });
      const rawLocs = manifest.database_tables?.location_history || manifest.location_history || [];
      let locRestored = 0;
      if (rawLocs.length > 0) {
        const locRows = rawLocs.map((l: any) => ({
          id: isOriginalOwner ? l.id : crypto.randomUUID(),
          owner_id: activeUid,
          label: l.label,
          place_id: l.place_id ?? null,
          lat: l.lat,
          lng: l.lng,
          used_count: l.used_count || 1,
          last_used_at: l.last_used_at || new Date().toISOString(),
        }));
        for (let i = 0; i < locRows.length; i += 100) {
          const slice = locRows.slice(i, i + 100);
          if (isOriginalOwner) {
            const { error } = await supabase
              .from("location_history")
              .upsert(slice, { onConflict: "id" });
            if (!error) locRestored += slice.length;
          } else {
            const { error } = await supabase.from("location_history").insert(slice);
            if (!error) locRestored += slice.length;
          }
        }
      }
      patch(stepIds.locations, "ok", `${locRestored} locations restored`);

      setImportSummary({
        imagesCount: imagesRestored,
        foldersCount: rawFolders.length,
        keywordsCount: kwRestored,
        locationsCount: locRestored,
      });
      setImportStatus("success");
      toast.success("Backup restore complete!", {
        description: `Restored ${imagesRestored} images across ${rawFolders.length} folders.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setImportStatus("error");
      toast.error("Restore failed", { description: msg });
      setImportLog((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.state === "pending") {
          return [...prev.slice(0, -1), { ...last, state: "fail", detail: msg }];
        }
        return [
          ...prev,
          { id: crypto.randomUUID(), label: "Restore failed", state: "fail", detail: msg },
        ];
      });
    }
  }

  const backupPct =
    backupProgress.total > 0 ? Math.round((backupProgress.done / backupProgress.total) * 100) : 0;
  const importPct =
    importProgress.total > 0 ? Math.round((importProgress.done / importProgress.total) * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl tracking-tight">Backups & Data Restore</h1>
            <p className="text-sm text-muted-foreground">
              Create an on-demand export or restore your library images, folders, keywords, and GPS
              tags.
            </p>
          </div>
        </div>

        {/* Active Account Status */}
        <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-card px-3.5 py-2 text-xs shadow-sm">
          <User className="h-4 w-4 text-primary" />
          <div>
            <span className="text-muted-foreground">Active Session: </span>
            <span className="font-medium text-foreground">
              {authLoading ? "Checking…" : currentUser?.email || "Not signed in"}
            </span>
          </div>
        </div>
      </div>

      {/* Online Sync Note Banner */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-foreground shadow-sm">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="space-y-1">
            <div className="font-semibold text-primary">Connected Cloud Database Notice</div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              Both your local system (<code>http://localhost:8085</code>) and your online system share the
              same Supabase database. If you sign in to <code>localhost:8085</code> with your main
              production account (<b>akashyounas2019@gmail.com</b>), all 529+ images, 17 folders, tags,
              and geotags will appear directly without needing to import any backup file!
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Card 1: Create Backup */}
        <div className="flex flex-col justify-between rounded-xl border border-border/60 bg-card p-5 shadow-sm">
          <div>
            <div className="flex items-center gap-2.5">
              <Download className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold">Create Full Backup</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Packages all images, folder structures, keywords, and GPS locations into a single JSON
              manifest with signed download links.
            </p>

            {backupStatus === "running" && (
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Exporting…</span>
                  <span>
                    {backupProgress.done} / {backupProgress.total} · {backupPct}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${backupPct}%` }}
                  />
                </div>
              </div>
            )}

            {backupLog.length > 0 && (
              <ul className="mt-4 space-y-1.5 border-t border-border/40 pt-3 text-xs">
                {backupLog.map((item) => (
                  <li key={item.id} className="flex items-start gap-2">
                    {item.state === "pending" && (
                      <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                    )}
                    {item.state === "ok" && (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    )}
                    {item.state === "fail" && (
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground">{item.label}</div>
                      {item.detail && <div className="text-muted-foreground truncate">{item.detail}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-5 border-t border-border/60 pt-4">
            <button
              onClick={runBackup}
              disabled={backupStatus === "running"}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {backupStatus === "running" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Generating Backup…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" /> Export Backup File (.json)
                </>
              )}
            </button>
          </div>
        </div>

        {/* Card 2: Restore / Import Backup */}
        <div className="flex flex-col justify-between rounded-xl border border-border/60 bg-card p-5 shadow-sm">
          <div>
            <div className="flex items-center gap-2.5">
              <Upload className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold">Restore / Import Backup</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Select your backup JSON file to populate all images, categories, and geotag metadata
              directly into your active account.
            </p>

            {importStatus === "running" && (
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="truncate">{importProgress.step || "Importing…"}</span>
                  <span>
                    {importProgress.done} / {importProgress.total} · {importPct}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${importPct}%` }}
                  />
                </div>
              </div>
            )}

            {importLog.length > 0 && (
              <ul className="mt-4 space-y-1.5 border-t border-border/40 pt-3 text-xs">
                {importLog.map((item) => (
                  <li key={item.id} className="flex items-start gap-2">
                    {item.state === "pending" && (
                      <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                    )}
                    {item.state === "ok" && (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    )}
                    {item.state === "fail" && (
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground">{item.label}</div>
                      {item.detail && <div className="text-muted-foreground truncate">{item.detail}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {importSummary && importStatus === "success" && (
              <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-800 dark:text-emerald-200">
                <div className="font-semibold">Restore Succeeded!</div>
                <div className="mt-1 space-y-0.5">
                  <div>✓ {importSummary.imagesCount} images restored</div>
                  <div>✓ {importSummary.foldersCount} folders matched/created</div>
                  <div>✓ {importSummary.keywordsCount} keywords synced</div>
                  <div>✓ {importSummary.locationsCount} pinned locations restored</div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Link
                    to="/library"
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 font-medium text-white shadow-sm hover:bg-emerald-700"
                  >
                    Go to Image Library <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 border-t border-border/60 pt-4">
            <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-all hover:bg-accent">
              <Upload className="h-4 w-4 text-primary" /> Select Backup JSON to Restore
              <input
                type="file"
                accept=".json"
                className="hidden"
                disabled={importStatus === "running"}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportFile(file);
                }}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
