import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  listDrafts,
  upsertDraft,
  deleteDraft as deleteDraftFn,
  listFolders,
  saveFolders,
  type DraftFolder,
  type PostDraft,
} from "@/lib/post-drafts.functions";
import {
  Folder,
  FolderPlus,
  Plus,
  Trash2,
  CalendarClock,
  Search,
  MoreHorizontal,
  FileText,
  ChevronRight,
  ImageIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SignedImage } from "@/components/SignedImage";

type ImageRow = { id: string; name: string | null; storage_path: string };
type ImageMap = Record<string, ImageRow>;

export const Route = createFileRoute("/_authenticated/post-storage")({
  component: PostStoragePage,
});

export function PostStoragePage() {
  return <PostStoragePanel />;
}


type PostStatus = "Draft" | "Upcoming" | "Published" | "Live";

// Folder and Post types re-declared as local aliases so the rest of the file
// (which references `Folder` and `Post`) keeps compiling unchanged.
type Folder = DraftFolder;
type Post = PostDraft;

const STATUS_STYLES: Record<PostStatus, string> = {
  Draft: "bg-muted text-muted-foreground border-border",
  Upcoming: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  Published: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  Live: "bg-primary/15 text-primary border-primary/30",
};

export function PostStoragePanel() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | "all" | "unfiled">("all");
  const [statusFilter, setStatusFilter] = useState<PostStatus | "All">("All");
  const [query, setQuery] = useState("");
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [scheduling, setScheduling] = useState<Post | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);

  const loadDraftsFn = useServerFn(listDrafts);
  const loadFoldersFn = useServerFn(listFolders);
  const saveDraftFn = useServerFn(upsertDraft);
  const removeDraftFn = useServerFn(deleteDraftFn);
  const saveFoldersFn = useServerFn(saveFolders);

  useEffect(() => {
    loadFoldersFn()
      .then((rows) => {
        if (rows.length === 0) {
          const seed: Folder[] = [
            { id: `f-${Date.now()}-g`, name: "General", parentId: null, createdAt: new Date().toISOString() },
            { id: `f-${Date.now()}-c`, name: "Campaigns", parentId: null, createdAt: new Date().toISOString() },
          ];
          setFolders(seed);
          saveFoldersFn({ data: { folders: seed } }).catch((e) =>
            toast.error(e instanceof Error ? e.message : "Failed to seed folders"),
          );
        } else {
          setFolders(rows);
        }
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load folders"));
    loadDraftsFn()
      .then((rows) => setPosts(rows))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load posts"));
  }, [loadDraftsFn, loadFoldersFn, saveFoldersFn]);

  function persistFolders(next: Folder[]) {
    setFolders(next);
    saveFoldersFn({ data: { folders: next } }).catch((e) =>
      toast.error(e instanceof Error ? e.message : "Failed to save folders"),
    );
  }

  const rootFolders = folders.filter((f) => f.parentId === null);
  const childrenOf = (id: string) => folders.filter((f) => f.parentId === id);

  const filteredPosts = useMemo(() => {
    return posts.filter((p) => {
      if (activeFolder === "all") {
        // pass
      } else if (activeFolder === "unfiled") {
        if (p.folderId !== null) return false;
      } else {
        if (p.folderId !== activeFolder) return false;
      }
      if (statusFilter !== "All" && p.status !== statusFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!p.title.toLowerCase().includes(q) && !p.body.toLowerCase().includes(q))
          return false;
      }
      return true;
    });
  }, [posts, activeFolder, statusFilter, query]);

  const counts = useMemo(() => {
    const c: Record<PostStatus | "All", number> = {
      All: posts.length,
      Draft: 0,
      Upcoming: 0,
      Published: 0,
      Live: 0,
    };
    posts.forEach((p) => { c[(p.status as PostStatus) ?? "Draft"]++; });
    return c;
  }, [posts]);

  function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    const f: Folder = {
      id: `f-${Date.now()}`,
      name,
      parentId: newFolderParent,
      createdAt: new Date().toISOString(),
    };
    persistFolders([...folders, f]);
    setNewFolderName("");
    setNewFolderParent(null);
    setCreatingFolder(false);
  }

  function deleteFolder(id: string) {
    if (!confirm("Delete this folder? Posts inside will be moved to Unfiled.")) return;
    persistFolders(folders.filter((f) => f.id !== id && f.parentId !== id));
    // Reassign posts in this folder to unfiled (persist each)
    posts
      .filter((p) => p.folderId === id)
      .forEach((p) => {
        saveDraftFn({ data: { id: p.id, folderId: null } }).catch((e) =>
          toast.error(e instanceof Error ? e.message : "Failed to move post to Unfiled"),
        );
      });
    setPosts((prev) => prev.map((p) => (p.folderId === id ? { ...p, folderId: null } : p)));
    if (activeFolder === id) setActiveFolder("all");
  }

  async function createPost() {
    const now = new Date().toISOString();
    const draft: Post = {
      id: crypto.randomUUID(),
      folderId: activeFolder !== "all" && activeFolder !== "unfiled" ? activeFolder : null,
      title: "Untitled post",
      body: "",
      status: "Draft",
      scheduledAt: null,
      createdAt: now,
      updatedAt: now,
      tags: [],
      imageIds: [],
    };
    setPosts((prev) => [draft, ...prev]);
    setSelectedPost(draft);
    try {
      const saved = await saveDraftFn({
        data: {
          id: draft.id,
          folderId: draft.folderId,
          title: draft.title,
          body: draft.body,
          status: draft.status,
          scheduledAt: draft.scheduledAt,
          tags: draft.tags,
        },
      });
      setPosts((prev) => prev.map((p) => (p.id === draft.id ? saved : p)));
      setSelectedPost((s) => (s?.id === draft.id ? saved : s));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create post");
    }
  }

  function updatePost(id: string, patch: Partial<Post>) {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p,
      ),
    );
    if (selectedPost?.id === id) setSelectedPost((s) => (s ? { ...s, ...patch } : s));
    saveDraftFn({
      data: {
        id,
        ...(patch.folderId !== undefined ? { folderId: patch.folderId } : {}),
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.scheduledAt !== undefined ? { scheduledAt: patch.scheduledAt } : {}),
        ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
      },
    }).catch((e) => toast.error(e instanceof Error ? e.message : "Could not save post"));
  }

  function deletePost(id: string) {
    if (!confirm("Delete this post?")) return;
    setPosts((prev) => prev.filter((p) => p.id !== id));
    if (selectedPost?.id === id) setSelectedPost(null);
    removeDraftFn({ data: { id } }).catch((e) =>
      toast.error(e instanceof Error ? e.message : "Could not delete post"),
    );
  }

  function schedulePost(id: string, when: string) {
    updatePost(id, { scheduledAt: when, status: "Upcoming" });
    setScheduling(null);
  }

  const folderPath = (id: string): string => {
    const parts: string[] = [];
    let cur = folders.find((f) => f.id === id);
    while (cur) {
      parts.unshift(cur.name);
      cur = cur.parentId ? folders.find((f) => f.id === cur!.parentId) : undefined;
    }
    return parts.join(" / ");
  };

  const folderTabs: { key: string; label: string; count: number }[] = [
    { key: "all", label: "All posts", count: posts.length },
    {
      key: "unfiled",
      label: "Unfiled",
      count: posts.filter((p) => p.folderId === null).length,
    },
    ...folders.map((f) => ({
      key: f.id,
      label: folderPath(f.id),
      count: posts.filter((p) => p.folderId === f.id).length,
    })),
  ];

  return (
    <div>
      <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">

        {/* Header */}
        <div className="border-b border-border px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl">Post Storage</h1>
              <p className="text-sm text-muted-foreground">
                Save, organize, and schedule your generated posts.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCreatingFolder(true)}
                className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
              >
                <FolderPlus className="h-4 w-4" /> New folder
              </button>
              <button
                onClick={createPost}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> New post
              </button>
            </div>
          </div>
        </div>

        {/* Folder tabs (horizontal) */}
        <div className="border-b border-border bg-card/40 px-6">
          <nav
            role="tablist"
            aria-label="Folders"
            className="flex gap-1 overflow-x-auto"
          >
            {folderTabs.map((t) => {
              const active = activeFolder === t.key;
              const isFolder = t.key !== "all" && t.key !== "unfiled";
              return (
                <div key={t.key} className="group relative flex items-center">
                  <button
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveFolder(t.key as typeof activeFolder)}
                    className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition ${
                      active
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Folder className="h-3.5 w-3.5" />
                    {t.label}
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {t.count}
                    </span>
                  </button>
                  {isFolder && (
                    <button
                      onClick={() => deleteFolder(t.key)}
                      title="Delete folder"
                      className="mr-1 hidden rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive group-hover:inline-flex"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Filter row */}
        <div className="border-b border-border px-6 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {(["All", "Draft", "Upcoming", "Published", "Live"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  statusFilter === s
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {s} <span className="opacity-60">· {counts[s]}</span>
              </button>
            ))}
            <div className="ml-auto relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search posts…"
                className="w-64 rounded-md border border-border bg-background pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0 flex">
            <div className="flex-1 overflow-y-auto p-6">
              {filteredPosts.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                  <FileText className="mb-3 h-10 w-10 opacity-40" />
                  <p className="text-sm">No posts here yet.</p>
                  <button
                    onClick={createPost}
                    className="mt-3 inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
                  >
                    <Plus className="h-3.5 w-3.5" /> Create the first one
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {filteredPosts.map((p) => (
                    <PostCard
                      key={p.id}
                      post={p}
                      folderName={folders.find((f) => f.id === p.folderId)?.name}
                      onOpen={() => setSelectedPost(p)}
                      onDelete={() => deletePost(p.id)}
                      onSchedule={() => setScheduling(p)}
                      onStatus={(s) => updatePost(p.id, { status: s })}
                    />
                  ))}
                </div>
              )}
            </div>

            {selectedPost && (
              <PostEditor
                key={selectedPost.id}
                post={selectedPost}
                folders={folders}
                onClose={() => setSelectedPost(null)}
                onUpdate={(patch) => updatePost(selectedPost.id, patch)}
                onDelete={() => deletePost(selectedPost.id)}
                onSchedule={() => setScheduling(selectedPost)}
              />
            )}
          </div>
        </div>
      </div>

      {creatingFolder && (
        <Modal onClose={() => setCreatingFolder(false)} title="New folder">
          <div className="space-y-3">
            <label className="block text-xs text-muted-foreground">Folder name</label>
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="e.g. Ramadan campaign"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <label className="block text-xs text-muted-foreground">Parent folder (optional)</label>
            <select
              value={newFolderParent ?? ""}
              onChange={(e) => setNewFolderParent(e.target.value || null)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">— None (root) —</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setCreatingFolder(false)}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={createFolder}
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
              >
                Create
              </button>
            </div>
          </div>
        </Modal>
      )}

      {scheduling && (
        <ScheduleModal
          post={scheduling}
          onCancel={() => setScheduling(null)}
          onConfirm={(when) => schedulePost(scheduling.id, when)}
        />
      )}
    </div>


  );
}

function FolderRow({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm ${
        active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      <span className="flex items-center gap-2">
        <Folder className="h-4 w-4" /> {label}
      </span>
      <span className="text-xs opacity-70">{count}</span>
    </button>
  );
}

function FolderTreeNode({
  folder,
  depth,
  childrenOf,
  posts,
  activeFolder,
  setActiveFolder,
  onDelete,
  onAddChild,
}: {
  folder: Folder;
  depth: number;
  childrenOf: (id: string) => Folder[];
  posts: Post[];
  activeFolder: string;
  setActiveFolder: (id: string) => void;
  onDelete: (id: string) => void;
  onAddChild: (parentId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const kids = childrenOf(folder.id);
  const active = activeFolder === folder.id;
  const count = posts.filter((p) => p.folderId === folder.id).length;
  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-md pr-1 text-sm ${
          active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
        }`}
        style={{ paddingLeft: depth * 12 }}
      >
        {kids.length > 0 ? (
          <button
            onClick={() => setOpen((v) => !v)}
            className="p-1 opacity-70 hover:opacity-100"
          >
            <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
          </button>
        ) : (
          <span className="w-5" />
        )}
        <button
          onClick={() => setActiveFolder(folder.id)}
          className="flex flex-1 items-center gap-2 py-1.5 text-left"
        >
          <Folder className="h-4 w-4" />
          <span className="truncate">{folder.name}</span>
          <span className="ml-auto text-xs opacity-70">{count}</span>
        </button>
        <div className="hidden group-hover:flex items-center gap-0.5">
          <button
            onClick={() => onAddChild(folder.id)}
            className="rounded p-1 hover:bg-background/60"
            title="Add subfolder"
          >
            <Plus className="h-3 w-3" />
          </button>
          <button
            onClick={() => onDelete(folder.id)}
            className="rounded p-1 hover:bg-background/60"
            title="Delete folder"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      {open &&
        kids.map((k) => (
          <FolderTreeNode
            key={k.id}
            folder={k}
            depth={depth + 1}
            childrenOf={childrenOf}
            posts={posts}
            activeFolder={activeFolder}
            setActiveFolder={setActiveFolder}
            onDelete={onDelete}
            onAddChild={onAddChild}
          />
        ))}
    </div>
  );
}

function PostCard({
  post,
  folderName,
  onOpen,
  onDelete,
  onSchedule,
  onStatus,
}: {
  post: Post;
  folderName?: string;
  onOpen: () => void;
  onDelete: () => void;
  onSchedule: () => void;
  onStatus: (s: PostStatus) => void;
}) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="group rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <button onClick={onOpen} className="text-left flex-1 min-w-0">
          <h3 className="truncate font-medium">{post.title || "Untitled"}</h3>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {post.body || "No content yet…"}
          </p>
        </button>
        <div className="relative">
          <button
            onClick={() => setMenu((v) => !v)}
            className="rounded p-1 text-muted-foreground hover:bg-accent"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menu && (
            <div
              className="absolute right-0 z-10 mt-1 w-40 rounded-md border border-border bg-popover p-1 shadow-md text-sm"
              onMouseLeave={() => setMenu(false)}
            >
              {(["Draft", "Upcoming", "Published", "Live"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    onStatus(s);
                    setMenu(false);
                  }}
                  className="flex w-full items-center px-2 py-1 rounded hover:bg-accent"
                >
                  Mark {s}
                </button>
              ))}
              <div className="my-1 border-t border-border" />
              <button
                onClick={() => {
                  onSchedule();
                  setMenu(false);
                }}
                className="flex w-full items-center gap-2 px-2 py-1 rounded hover:bg-accent"
              >
                <CalendarClock className="h-3.5 w-3.5" /> Schedule
              </button>
              <button
                onClick={() => {
                  onDelete();
                  setMenu(false);
                }}
                className="flex w-full items-center gap-2 px-2 py-1 rounded text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full border px-2 py-0.5 ${STATUS_STYLES[(post.status as PostStatus) ?? "Draft"]}`}>
          {post.status}
        </span>
        {folderName && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Folder className="h-3 w-3" /> {folderName}
          </span>
        )}
        {post.scheduledAt && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <CalendarClock className="h-3 w-3" />
            {new Date(post.scheduledAt).toLocaleString()}
          </span>
        )}
        <span className="ml-auto text-muted-foreground/70">
          {new Date(post.updatedAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

function PostEditor({
  post,
  folders,
  onClose,
  onUpdate,
  onDelete,
  onSchedule,
}: {
  post: Post;
  folders: Folder[];
  onClose: () => void;
  onUpdate: (patch: Partial<Post>) => void;
  onDelete: () => void;
  onSchedule: () => void;
}) {
  return (
    <aside className="w-96 shrink-0 border-l border-border bg-card/40 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Edit post
        </span>
        <button
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <input
          value={post.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder="Title"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-medium"
        />
        <textarea
          value={post.body}
          onChange={(e) => onUpdate({ body: e.target.value })}
          placeholder="Write your post…"
          rows={10}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Status</label>
          <div className="flex flex-wrap gap-1.5">
            {(["Draft", "Upcoming", "Published", "Live"] as const).map((s) => (
              <button
                key={s}
                onClick={() => onUpdate({ status: s })}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${
                  post.status === s
                    ? STATUS_STYLES[s]
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Folder</label>
          <select
            value={post.folderId ?? ""}
            onChange={(e) => onUpdate({ folderId: e.target.value || null })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Unfiled</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        {post.scheduledAt && (
          <div className="rounded-md border border-border bg-background/50 px-3 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" />
              Scheduled for {new Date(post.scheduledAt).toLocaleString()}
            </div>
          </div>
        )}
      </div>
      <div className="border-t border-border p-3 flex items-center gap-2">
        <button
          onClick={onSchedule}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
        >
          <CalendarClock className="h-3.5 w-3.5" /> Schedule
        </button>
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </div>
    </aside>
  );
}

function ScheduleModal({
  post,
  onCancel,
  onConfirm,
}: {
  post: Post;
  onCancel: () => void;
  onConfirm: (when: string) => void;
}) {
  const [when, setWhen] = useState(
    post.scheduledAt
      ? new Date(post.scheduledAt).toISOString().slice(0, 16)
      : new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
  );
  return (
    <Modal onClose={onCancel} title={`Schedule "${post.title || "Untitled"}"`}>
      <div className="space-y-3">
        <label className="block text-xs text-muted-foreground">Publish at</label>
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(new Date(when).toISOString())}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
          >
            Schedule
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl"
      >
        <h2 className="mb-4 font-display text-lg">{title}</h2>
        {children}
      </div>
    </div>
  );
}
