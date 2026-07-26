import { createFileRoute } from "@tanstack/react-router";

/**
 * Permanent, direct image URL for external CRMs (GoHighLevel Social Planner).
 *
 * GHL needs a stable, publicly fetchable image URL — signed Supabase URLs
 * expire, so they cannot be used inside an uploaded CSV. This route streams the
 * bytes from the private `frames` bucket using the service role, keyed by the
 * image's unguessable UUID.
 *
 * Every response carries `X-Robots-Tag: noindex, nofollow, noimageindex` so the
 * images are never indexed by search engines.
 */

const NOINDEX = "noindex, nofollow, noimageindex, noarchive";

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

export const Route = createFileRoute("/api/public/img/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = params.id.replace(/\.[a-z0-9]+$/i, "");
        if (!/^[0-9a-f-]{36}$/i.test(id)) {
          return new Response("Not found", {
            status: 404,
            headers: { "X-Robots-Tag": NOINDEX },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: row, error } = await supabaseAdmin
          .from("images")
          .select("storage_path, deleted_at")
          .eq("id", id)
          .maybeSingle();

        if (error || !row || row.deleted_at) {
          return new Response("Not found", {
            status: 404,
            headers: { "X-Robots-Tag": NOINDEX },
          });
        }

        const { data: blob, error: dlErr } = await supabaseAdmin.storage
          .from("frames")
          .download(row.storage_path);

        if (dlErr || !blob) {
          return new Response("Not found", {
            status: 404,
            headers: { "X-Robots-Tag": NOINDEX },
          });
        }

        const ext = (row.storage_path.split(".").pop() ?? "jpg").toLowerCase();
        const contentType =
          blob.type && blob.type.startsWith("image/")
            ? blob.type
            : (EXT_MIME[ext] ?? "image/jpeg");

        return new Response(await blob.arrayBuffer(), {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=3600",
            "X-Robots-Tag": NOINDEX,
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
