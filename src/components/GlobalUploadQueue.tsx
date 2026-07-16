import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, UploadCloud, X } from "lucide-react";

import {
  cancelItem,
  clearFinished,
  onEvent,
  removeItem,
  retryItem,
} from "@/lib/upload-queue-store";
import { useUploadQueueItems } from "@/hooks/use-upload-queue";

/**
 * Floating global upload-queue widget.
 *
 * Mounted once in the AppShell so the queue stays visible during any
 * navigation while items are still processing. It shares state with the
 * in-tab `UploadPanel` via `src/lib/upload-queue-store`.
 */
export function GlobalUploadQueue() {
  const queue = useUploadQueueItems();
  const [open, setOpen] = useState(true);
  const qc = useQueryClient();

  // Refresh library/videos data when uploads complete anywhere in the app.
  useEffect(() => {
    const offSaved = onEvent("imageSaved", () => {
      qc.invalidateQueries({ queryKey: ["library"] });
    });
    const offDrained = onEvent("drained", () => {
      qc.invalidateQueries({ queryKey: ["library"] });
      qc.invalidateQueries({ queryKey: ["videos"] });
    });
    return () => {
      offSaved();
      offDrained();
    };
  }, [qc]);

  if (queue.length === 0) return null;

  const active = queue.filter(
    (q) => q.stage !== "done" && q.stage !== "error",
  );
  const errored = queue.filter((q) => q.stage === "error");
  const done = queue.filter((q) => q.stage === "done").length;
  const total = queue.length;
  const overall = queue.reduce((sum, q) => sum + q.progress, 0) / total;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-end px-4">
      <div className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-xl border border-border bg-card shadow-xl">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 border-b border-border/60 bg-background/50 px-3 py-2 text-left text-sm hover:bg-accent/40"
        >
          {active.length > 0 ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
          ) : (
            <UploadCloud className="h-4 w-4 shrink-0 text-primary" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">
              {active.length > 0
                ? `Uploading ${done + 1}/${total}`
                : errored.length > 0
                  ? `${done}/${total} uploaded · ${errored.length} failed`
                  : `${total} uploaded`}
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.round(overall * 100)}%` }}
              />
            </div>
          </div>
          <Link
            to="/library"
            search={{ tab: "upload" } as never}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-accent"
          >
            Open
          </Link>
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </button>

        {open && (
          <div className="max-h-64 overflow-y-auto p-2">
            <ul className="space-y-1.5">
              {queue.map((q) => {
                const pct = Math.round(q.progress * 100);
                const isActive =
                  q.stage === "extracting" ||
                  q.stage === "uploading" ||
                  q.stage === "saving";
                return (
                  <li
                    key={q.id}
                    className="rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate text-xs font-medium">
                            {q.file.name}
                          </div>
                          <div className="shrink-0 font-mono text-[10px] text-muted-foreground">
                            {q.stage === "done"
                              ? "done"
                              : q.stage === "error"
                                ? "failed"
                                : `${pct}%`}
                          </div>
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {q.stage === "error" ? q.error : q.message}
                        </div>
                        {(isActive || q.stage === "done") && (
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full transition-all ${
                                q.stage === "done"
                                  ? "bg-emerald-500"
                                  : "bg-primary"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                      </div>
                      {q.stage === "error" && (
                        <button
                          onClick={() => retryItem(q.id)}
                          className="rounded-md border border-border px-1.5 py-0.5 text-[10px] hover:bg-accent"
                        >
                          Retry
                        </button>
                      )}
                      {(q.stage === "pending" ||
                        q.stage === "error" ||
                        q.stage === "done") && (
                        <button
                          onClick={() => removeItem(q.id)}
                          aria-label="Remove from queue"
                          className="rounded-md p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {done > 0 && active.length === 0 && (
              <button
                onClick={clearFinished}
                className="mt-2 w-full rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Clear completed
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
