import { useEffect, useRef, useState } from "react";
import { Images, PenSquare, Upload, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SignedImage } from "@/components/SignedImage";
import {
  PostGeneratorPage,
  type SocialPlatform,
} from "@/routes/_authenticated/post-generator";

type Creative = {
  id: string;
  name: string;
  storage_path: string;
  created_at: string;
};

export function SocialAccountScreen({
  platform,
  title,
}: {
  platform: Extract<SocialPlatform, "facebook" | "instagram">;
  title: string;
}) {
  const [tab, setTab] = useState<"library" | "compose">("library");

  return (
    <div className="w-full px-6 py-6 md:px-10 md:py-10">
      <div className="mb-6">
        <h1 className="text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage {title} creatives and compose posts.
        </p>
      </div>

      <div className="mb-6 border-b border-border">
        <nav role="tablist" className="-mb-px flex flex-wrap gap-1">
          <TabButton
            active={tab === "library"}
            onClick={() => setTab("library")}
            icon={<Images className="h-4 w-4" />}
            label="Image Library"
          />
          <TabButton
            active={tab === "compose"}
            onClick={() => setTab("compose")}
            icon={<PenSquare className="h-4 w-4" />}
            label="Post Generator"
          />
        </nav>
      </div>

      {tab === "library" ? (
        <ImageLibraryTab platform={platform} />
      ) : (
        <div className="-mx-6 -my-6 md:-mx-10 md:-my-10">
          <PostGeneratorPage defaultPlatform={platform} pageTitle={`${title} Post`} />
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ImageLibraryTab({
  platform,
}: {
  platform: "facebook" | "instagram";
}) {
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pathPrefix = `social-${platform}/`;

  async function reload() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;
    const { data } = await supabase
      .from("images")
      .select("id,name,storage_path,created_at")
      .like("storage_path", `${uid}/${pathPrefix}%`)
      .order("created_at", { ascending: false })
      .limit(200);
    setCreatives((data ?? []) as Creative[]);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform]);

  async function handleUpload() {
    if (!file) {
      toast.error("Choose an image file");
      return;
    }
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${uid}/${pathPrefix}${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("frames")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("images").insert({
        owner_id: uid,
        name: title.trim(),
        storage_path: path,
      });
      if (dbErr) throw dbErr;
      toast.success("Creative uploaded");
      setTitle("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(c: Creative) {
    if (!confirm(`Delete "${c.name}"?`)) return;
    await supabase.storage.from("frames").remove([c.storage_path]);
    await supabase.from("images").delete().eq("id", c.id);
    reload();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Upload creative</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Only a title is required — no description or geo-tagging.
        </p>

        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Summer campaign hero"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Image
              </label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
              />
            </div>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleUpload}
              disabled={uploading || !file || !title.trim()}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Upload
            </button>
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Creatives</h2>
        {creatives.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No creatives yet. Upload one above.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {creatives.map((c) => (
              <div
                key={c.id}
                className="group relative overflow-hidden rounded-md border border-border bg-card"
              >
                <div className="aspect-square bg-muted">
                  <SignedImage
                    bucket="frames"
                    path={c.storage_path}
                    alt={c.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <span className="truncate text-xs" title={c.name}>
                    {c.name}
                  </span>
                  <button
                    onClick={() => handleDelete(c)}
                    className="rounded p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
