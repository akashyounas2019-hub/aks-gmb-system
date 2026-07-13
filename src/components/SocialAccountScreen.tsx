import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, Images, PenSquare, Upload, Loader2, Trash2, ArrowRightLeft } from "lucide-react";
import { CalendarPage } from "@/routes/_authenticated/calendar";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SignedImage, useSignedUrl } from "@/components/SignedImage";
import {
  PostGeneratorPage,
  type SocialPlatform,
} from "@/routes/_authenticated/post-generator";

type LibraryPlatform = Extract<SocialPlatform, "facebook" | "instagram" | "linkedin">;

type Creative = {
  id: string;
  name: string;
  storage_path: string;
  created_at: string;
};

type CategoryDef = { id: string; label: string };

const DEFAULT_CATEGORIES: CategoryDef[] = [
  { id: "raw", label: "Upload Raw Images" },
  { id: "published", label: "Published Images" },
  { id: "videos", label: "Videos" },
  { id: "story", label: "Story" },
];

const VIDEO_EXT = /\.(mp4|mov|webm|m4v|avi|mkv)$/i;

export function SocialAccountScreen({
  platform,
  title,
  libraryCategories = DEFAULT_CATEGORIES,
}: {
  platform: LibraryPlatform;
  title: string;
  libraryCategories?: CategoryDef[];
}) {
  const [tab, setTab] = useState<"library" | "upload" | "compose" | "calendar">(
    "library",
  );
  const [reloadKey, setReloadKey] = useState(0);

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
            active={tab === "upload"}
            onClick={() => setTab("upload")}
            icon={<Upload className="h-4 w-4" />}
            label="Upload"
          />
          <TabButton
            active={tab === "compose"}
            onClick={() => setTab("compose")}
            icon={<PenSquare className="h-4 w-4" />}
            label="Post Generator"
          />
          <TabButton
            active={tab === "calendar"}
            onClick={() => setTab("calendar")}
            icon={<CalendarDays className="h-4 w-4" />}
            label={`${title} Calendar`}
          />
        </nav>
      </div>

      {tab === "library" && (
        <ImageLibraryTab
          platform={platform}
          categories={libraryCategories}
          reloadKey={reloadKey}
        />
      )}
      {tab === "upload" && (
        <UploadTab
          platform={platform}
          categories={libraryCategories}
          onUploaded={() => {
            setReloadKey((k) => k + 1);
            setTab("library");
          }}
        />
      )}
      {tab === "compose" && (
        <div className="-mx-6 -my-6 md:-mx-10 md:-my-10">
          <PostGeneratorPage defaultPlatform={platform} pageTitle={`${title} Post`} />
        </div>
      )}
      {tab === "calendar" && (
        <div className="-mx-6 -my-6 md:-mx-10 md:-my-10">
          <CalendarPage
            title={`${title} Calendar`}
            platform={platform}
            onDayClick={() => setTab("compose")}
          />
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

function categoryFromPath(path: string, platform: string): string {
  const m = path.match(new RegExp(`/social-${platform}(?:-([a-z0-9-]+))?/`));
  if (!m) return "";
  return m[1] ?? "raw";
}

function UploadTab({
  platform,
  categories,
  onUploaded,
}: {
  platform: LibraryPlatform;
  categories: CategoryDef[];
  onUploaded: () => void;
}) {
  const [uploadCat, setUploadCat] = useState<string>(categories[0]?.id ?? "raw");
  const [titleInput, setTitleInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isVideos = uploadCat === "videos";
  const accept = isVideos ? "video/*" : "image/*";

  async function handleUpload() {
    if (!file) {
      toast.error("Choose a file");
      return;
    }
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");
      const ext = file.name.split(".").pop() || (isVideos ? "mp4" : "jpg");
      const path = `${uid}/social-${platform}-${uploadCat}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("frames")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      // Title is optional — fall back to the uploaded file's name (minus ext).
      const fallback = file.name.replace(/\.[^.]+$/, "").trim() || file.name;
      const finalTitle = titleInput.trim() || fallback;
      const { error: dbErr } = await supabase.from("images").insert({
        owner_id: uid,
        name: finalTitle,
        storage_path: path,
      });
      if (dbErr) throw dbErr;
      toast.success("Uploaded");
      setTitleInput("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      onUploaded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Upload className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Upload creative</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Only a title is required — no description or geo-tagging. Uploads appear in the Image Library.
      </p>

      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Title
            </label>
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="e.g. Summer campaign hero"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          {categories.length > 1 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Destination
              </label>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => {
                  const on = uploadCat === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setUploadCat(c.id)}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        on
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {isVideos ? "Video" : "Image"}
            </label>
            <input
              ref={fileRef}
              type="file"
              accept={accept}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
            />
          </div>
        </div>
        <div className="flex items-end">
          <button
            onClick={handleUpload}
            disabled={uploading || !file || !titleInput.trim()}
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
  );
}

function SignedVideo({ path, className }: { path: string; className?: string }) {
  const url = useSignedUrl("frames", path);
  if (!url) return <div className={`animate-pulse bg-muted ${className ?? ""}`} />;
  return <video src={url} className={className} muted playsInline preload="metadata" />;
}

function ImageLibraryTab({
  platform,
  categories,
  reloadKey,
}: {
  platform: LibraryPlatform;
  categories: CategoryDef[];
  reloadKey: number;
}) {
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [activeCat, setActiveCat] = useState<string>(categories[0]?.id ?? "raw");

  const reload = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;
    const { data } = await supabase
      .from("images")
      .select("id,name,storage_path,created_at")
      .like("storage_path", `${uid}/social-${platform}%`)
      .order("created_at", { ascending: false })
      .limit(500);
    setCreatives((data ?? []) as Creative[]);
  }, [platform]);

  useEffect(() => {
    reload();
  }, [reload, reloadKey]);

  const visible = creatives.filter(
    (c) => categoryFromPath(c.storage_path, platform) === activeCat,
  );

  async function handleDelete(c: Creative) {
    if (!confirm(`Delete "${c.name}"?`)) return;
    await supabase.storage.from("frames").remove([c.storage_path]);
    await supabase.from("images").delete().eq("id", c.id);
    reload();
  }

  async function handleMove(c: Creative, toCat: string) {
    const currentCat = categoryFromPath(c.storage_path, platform);
    if (currentCat === toCat) return;
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");
      const filename = c.storage_path.split("/").pop() ?? crypto.randomUUID();
      const newPath = `${uid}/social-${platform}-${toCat}/${filename}`;
      const { error: mvErr } = await supabase.storage
        .from("frames")
        .move(c.storage_path, newPath);
      if (mvErr) throw mvErr;
      const { error: upErr } = await supabase
        .from("images")
        .update({ storage_path: newPath })
        .eq("id", c.id);
      if (upErr) throw upErr;
      toast.success(`Moved to ${toCat}`);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Move failed");
    }
  }

  return (
    <div className="space-y-6">
      {categories.length > 1 && (
        <div className="border-b border-border">
          <nav className="-mb-px flex flex-wrap gap-1">
            {categories.map((t) => (
              <TabButton
                key={t.id}
                active={activeCat === t.id}
                onClick={() => setActiveCat(t.id)}
                icon={<Images className="h-4 w-4" />}
                label={t.label}
              />
            ))}
          </nav>
        </div>
      )}

      <div>
        {visible.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No uploads here yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {visible.map((c) => {
              const cat = categoryFromPath(c.storage_path, platform);
              const otherCats = categories.filter((x) => x.id !== cat);
              const isVideo = VIDEO_EXT.test(c.storage_path);
              return (
                <div
                  key={c.id}
                  className="group relative overflow-hidden rounded-md border border-border bg-card"
                >
                  <div className="aspect-square bg-muted">
                    {isVideo ? (
                      <SignedVideo
                        path={c.storage_path}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <SignedImage
                        bucket="frames"
                        path={c.storage_path}
                        alt={c.name}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  {categories.length > 1 && (
                    <span className="absolute left-2 top-2 rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-medium uppercase text-foreground">
                      {cat}
                    </span>
                  )}
                  <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                    <span className="truncate text-xs" title={c.name}>
                      {c.name}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                      {otherCats.map((oc) => (
                        <button
                          key={oc.id}
                          onClick={() => handleMove(c, oc.id)}
                          className="rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                          title={`Move to ${oc.label}`}
                          aria-label={`Move to ${oc.label}`}
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                        </button>
                      ))}
                      <button
                        onClick={() => handleDelete(c)}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
