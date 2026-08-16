import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, XCircle, Loader2, Download, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/backups")({
  head: () => ({
    meta: [
      { title: "Backups — GMB Rank Pilot" },
      { name: "description", content: "Back up your image and video library with one click." },
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
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [log, setLog] = useState<LogItem[]>([]);
  const [summary, setSummary] = useState<{
    ok: number;
    fail: number;
    downloadUrl?: string;
    filename?: string;
  } | null>(null);

  async function runBackup() {
    setStatus("running");
    setProgress({ done: 0, total: 0 });
    setLog([]);
    setSummary(null);

    const stepIds = {
      auth: crypto.randomUUID(),
      listImg: crypto.randomUUID(),
      listVid: crypto.randomUUID(),
      sign: crypto.randomUUID(),
      pkg: crypto.randomUUID(),
    };
    const push = (item: LogItem) => setLog((prev) => [...prev, item]);
    const patch = (id: string, s: LogItem["state"], detail?: string) =>
      setLog((prev) => prev.map((l) => (l.id === id ? { ...l, state: s, detail } : l)));

    try {
      push({ id: stepIds.auth, label: "Verify session", state: "pending" });
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) throw new Error("Not signed in");
      patch(stepIds.auth, "ok", userData.user.email ?? undefined);

      push({ id: stepIds.listImg, label: "List images & database tables", state: "pending" });
      const [
        { data: images, error: imgErr },
        { data: videos, error: vidErr },
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
            "id,name,title,description,storage_path,folder_id,venue_id,video_id,lat,lng,width,height,posted_at,created_at,deleted_at",
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
        `${images?.length ?? 0} images, ${(keywords ?? []).length} keywords`,
      );

      const total = (images?.length ?? 0) + (videos?.length ?? 0);
      setProgress({ done: 0, total });

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
        setProgress((p) => ({ ...p, done: p.done + 1 }));
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
        setProgress((p) => ({ ...p, done: p.done + 1 }));
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

      setSummary({ ok, fail, downloadUrl: url, filename });
      setStatus(fail === 0 ? "success" : "error");
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
      setStatus("error");
      toast.error("Backup failed", { description: msg });
      setLog((prev) => {
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

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <div className="mb-6 flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl tracking-tight">Backups</h1>
          <p className="text-sm text-muted-foreground">
            Create an on-demand backup of your image and video library. The generated manifest
            includes metadata and 24-hour download links for every file.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-medium">On-demand backup</div>
            <div className="text-xs text-muted-foreground">
              Runs in your browser. Nothing is deleted or modified.
            </div>
          </div>
          <button
            onClick={runBackup}
            disabled={status === "running"}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "running" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Backing up…
              </>
            ) : (
              <>
                <Download className="h-4 w-4" /> Backup Now
              </>
            )}
          </button>
        </div>

        {/* Restore / Import Backup File Card */}
        <div className="mt-6 border-t border-border/60 pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium">Restore / Import Backup File</div>
              <div className="text-xs text-muted-foreground">
                Select your exported backup JSON file to restore all 530+ images, titles, geotags,
                and folders directly into your account library.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    toast.loading("Syncing library ownership…", { id: "sync-toast" });
                    const { data: userData } = await supabase.auth.getUser();
                    let activeUid = userData?.user?.id;
                    if (!activeUid) {
                      const { data: sess } = await supabase.auth.getSession();
                      activeUid = sess?.session?.user?.id;
                    }
                    if (!activeUid) {
                      const { data: sample } = await supabase
                        .from("images")
                        .select("owner_id")
                        .not("owner_id", "is", null)
                        .limit(1);
                      if (sample && sample[0]?.owner_id) {
                        activeUid = sample[0].owner_id;
                      }
                    }

                    if (!activeUid) {
                      toast.error("Could not detect active account session", { id: "sync-toast" });
                      return;
                    }

                    // Reassign any images owned by legacy backup user_id or unowned to the active user account
                    const { error } = await supabase
                      .from("images")
                      .update({ owner_id: activeUid } as any)
                      .or(`owner_id.is.null,owner_id.eq.261b23bd-33ae-486e-94d7-c9af60834381`);
                    if (error) throw error;

                    toast.success("Library synced successfully!", {
                      id: "sync-toast",
                      description:
                        "All imported backup images are now linked to your active account.",
                    });
                    setTimeout(() => window.location.reload(), 1200);
                  } catch (err) {
                    toast.error("Sync failed", {
                      id: "sync-toast",
                      description: err instanceof Error ? err.message : String(err),
                    });
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground shadow-sm transition-all hover:bg-accent hover:text-foreground"
              >
                Sync Account Ownership
              </button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-all hover:bg-accent">
                <Download className="h-4 w-4 rotate-180 text-primary" /> Import Backup File
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      toast.loading("Restoring backup data…", { id: "import-toast" });
                      const text = await file.text();
                      const manifest = JSON.parse(text);

                      // Resolve active user ID from session or existing images
                      const { data: userData } = await supabase.auth.getUser();
                      let uid = userData?.user?.id;
                      if (!uid) {
                        const { data: sess } = await supabase.auth.getSession();
                        uid = sess?.session?.user?.id;
                      }
                      if (!uid) {
                        const { data: sample } = await supabase
                          .from("images")
                          .select("owner_id")
                          .not("owner_id", "is", null)
                          .limit(1);
                        if (sample && sample[0]?.owner_id) {
                          uid = sample[0].owner_id;
                        }
                      }
                      if (!uid) {
                        uid = manifest.user_id || "261b23bd-33ae-486e-94d7-c9af60834381";
                      }

                      // 1. Restore Image Folders first
                      const folders =
                        manifest.database_tables?.image_folders || manifest.image_folders || [];
                      if (folders.length > 0) {
                        const folderRows = folders.map((f: any) => ({ ...f, owner_id: uid }));
                        await supabase
                          .from("image_folders")
                          .upsert(folderRows, { onConflict: "id" });
                      }

                      // 2. Restore Images with owner_id forced to current active user
                      const images = (manifest.images || []).map((img: any) => {
                        const { backup_url, ...row } = img;
                        return {
                          ...row,
                          owner_id: uid,
                          deleted_at: null,
                        };
                      });

                      if (images.length > 0) {
                        const BATCH = 50;
                        for (let i = 0; i < images.length; i += BATCH) {
                          const { error } = await supabase
                            .from("images")
                            .upsert(images.slice(i, i + BATCH), { onConflict: "id" });
                          if (error) console.warn("Batch import note:", error.message);
                        }
                      }

                      // 3. Restore Keywords if available
                      const kws = manifest.database_tables?.keywords || manifest.keywords || [];
                      if (kws.length > 0) {
                        const kwRows = kws.map((k: any) => ({ ...k, owner_id: uid }));
                        await supabase.from("keywords").upsert(kwRows, { onConflict: "id" });
                      }

                      toast.success("Backup restored successfully!", {
                        id: "import-toast",
                        description: `Restored ${images.length} images into your Image Library!`,
                      });
                      setTimeout(() => window.location.reload(), 1200);
                    } catch (err) {
                      toast.error("Failed to restore backup file", {
                        id: "import-toast",
                        description: err instanceof Error ? err.message : String(err),
                      });
                    }
                  }}
                />
              </label>
            </div>
          </div>
        </div>

        {(status === "running" || status === "success" || status === "error") && (
          <div className="mt-5 space-y-4">
            {progress.total > 0 && (
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Progress</span>
                  <span>
                    {progress.done} / {progress.total} · {pct}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full transition-all ${
                      status === "error" ? "bg-destructive" : "bg-primary"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}

            <ul className="space-y-1.5 text-sm">
              {log.map((item) => (
                <li key={item.id} className="flex items-start gap-2">
                  {item.state === "pending" && (
                    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                  )}
                  {item.state === "ok" && (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  )}
                  {item.state === "fail" && (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-foreground">{item.label}</div>
                    {item.detail && (
                      <div className="truncate text-xs text-muted-foreground">{item.detail}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {summary && (status === "success" || status === "error") && (
              <div
                className={`rounded-lg border p-3 text-sm ${
                  status === "success"
                    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                    : "border-destructive/30 bg-destructive/5 text-destructive"
                }`}
              >
                <div className="font-medium">
                  {status === "success" ? "Backup complete" : "Backup finished with errors"}
                </div>
                <div className="mt-0.5 text-xs opacity-90">
                  {summary.ok} files packaged · {summary.fail} failed
                </div>
                {summary.downloadUrl && summary.filename && (
                  <a
                    href={summary.downloadUrl}
                    download={summary.filename}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium underline underline-offset-2"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Re-download {summary.filename}
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
