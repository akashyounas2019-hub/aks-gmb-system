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

      push({ id: stepIds.listImg, label: "List images", state: "pending" });
      const { data: images, error: imgErr } = await supabase
        .from("images")
        .select(
          "id,name,title,description,storage_path,folder_id,venue_id,video_id,lat,lng,width,height,posted_at,created_at,deleted_at",
        )
        .is("deleted_at", null);
      if (imgErr) throw imgErr;
      patch(stepIds.listImg, "ok", `${images?.length ?? 0} files`);

      push({ id: stepIds.listVid, label: "List videos", state: "pending" });
      const { data: videos, error: vidErr } = await supabase.from("videos").select("*");
      if (vidErr) throw vidErr;
      patch(stepIds.listVid, "ok", `${videos?.length ?? 0} files`);

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
        version: 1,
        generated_at: new Date().toISOString(),
        user_id: userData.user.id,
        user_email: userData.user.email,
        expires_in_seconds: EXPIRES,
        counts: { images: signedImages.length, videos: signedVideos.length },
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
