import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Film } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/videos")({
  component: VideosPage,
});

async function fetchVideos() {
  const { data, error } = await supabase
    .from("videos")
    .select("id, original_name, duration_seconds, size_bytes, frame_count, created_at, status")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

function formatBytes(n: number | null) {
  if (!n) return "—";
  const mb = n / (1024 * 1024);
  if (mb < 1000) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function VideosPage() {
  const { data, isLoading } = useQuery({ queryKey: ["videos"], queryFn: fetchVideos });

  return (
    <div className="p-6 md:p-10">
      <h1 className="text-3xl">Videos</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {data?.length ?? 0} videos uploaded
      </p>

      {isLoading ? (
        <div className="mt-10 text-sm text-muted-foreground">Loading…</div>
      ) : (data?.length ?? 0) === 0 ? (
        <div className="mt-16 rounded-2xl border border-dashed border-border p-10 text-center">
          <Film className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-muted-foreground">No videos yet.</p>
          <Link
            to="/upload"
            className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Upload one
          </Link>
        </div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-card text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Frames</th>
                <th className="px-4 py-3">Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {data!.map((v) => (
                <tr key={v.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{v.original_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {v.duration_seconds ? `${Number(v.duration_seconds).toFixed(0)}s` : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatBytes(v.size_bytes)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                      {v.frame_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(v.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
