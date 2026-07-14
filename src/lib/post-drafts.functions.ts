import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DraftFolder = { id: string; name: string; parentId: string | null; createdAt: string };

export type PostDraft = {
  id: string;
  folderId: string | null;
  title: string;
  body: string;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  imageIds: string[];
};

export type UpsertDraftInput = {
  id?: string;
  folderId?: string | null;
  title?: string;
  body?: string;
  status?: string;
  scheduledAt?: string | null;
  tags?: string[];
  imageIds?: string[];
};

// Simple row shape returned by the DB query
type Row = {
  id: string;
  title: string | null;
  body: string;
  status: string;
  scheduled_for: string | null;
  created_at: string;
  updated_at: string;
  meta: Record<string, unknown> | null;
};

function rowToDraft(r: Row): PostDraft {
  const meta = (r.meta ?? {}) as { folderId?: string | null; tags?: string[]; imageIds?: string[] };
  return {
    id: r.id,
    folderId: meta.folderId ?? null,
    title: r.title ?? "",
    body: r.body ?? "",
    status: r.status,
    scheduledAt: r.scheduled_for,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    tags: meta.tags ?? [],
    imageIds: meta.imageIds ?? [],
  };
}

export const listDrafts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("post_drafts")
      .select("id,title,body,status,scheduled_for,created_at,updated_at,meta")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map(rowToDraft);
  });

export const upsertDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: UpsertDraftInput) => input)
  .handler(async ({ data, context }) => {
    // Load existing meta so we can merge folderId/tags without wiping other fields.
    let existingMeta: Record<string, unknown> = {};
    if (data.id) {
      const { data: prior } = await context.supabase
        .from("post_drafts")
        .select("meta")
        .eq("id", data.id)
        .maybeSingle();
      if (prior?.meta && typeof prior.meta === "object")
        existingMeta = prior.meta as Record<string, unknown>;
    }
    const meta = {
      ...existingMeta,
      ...(data.folderId !== undefined ? { folderId: data.folderId } : {}),
      ...(data.tags !== undefined ? { tags: data.tags } : {}),
    };
    const row = {
      ...(data.id ? { id: data.id } : {}),
      owner_id: context.userId,
      title: data.title ?? "",
      body: data.body ?? "",
      status: data.status ?? "Draft",
      scheduled_for: data.scheduledAt ?? null,
      meta,
    };
    const { data: saved, error } = await context.supabase
      .from("post_drafts")
      .upsert(row)
      .select("id,title,body,status,scheduled_for,created_at,updated_at,meta")
      .single();
    if (error) throw new Error(error.message);
    return rowToDraft(saved as unknown as Row);
  });

export const deleteDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("post_drafts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Folders live inside user_preferences.general.postFolders (no separate table needed).
export const listFolders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_preferences")
      .select("general")
      .eq("owner_id", context.userId)
      .maybeSingle();
    const general = (data?.general ?? {}) as { postFolders?: DraftFolder[] };
    return general.postFolders ?? [];
  });

export const saveFolders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { folders: DraftFolder[] }) => input)
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("user_preferences")
      .select("general")
      .eq("owner_id", context.userId)
      .maybeSingle();
    const general = { ...((existing?.general ?? {}) as Record<string, unknown>), postFolders: data.folders };
    const { error } = await context.supabase
      .from("user_preferences")
      .upsert({ owner_id: context.userId, general }, { onConflict: "owner_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
