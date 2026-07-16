import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Json =
  | string
  | number
  | boolean
  | null
  | { [k: string]: Json | undefined }
  | Json[];

export type AdProfile = {
  id: string;
  name: string;
  theme: string;
  colors: Json;
  fonts: Json;
  default_template_id: string | null;
  logo_path: string | null;
  is_active: boolean;
};

export type SlotDef = {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  defaults: Json;
};
export type TemplateDefinition = {
  canvas: { w: number; h: number; bg: string };
  slots: SlotDef[];
};
export type AdTemplate = {
  id: string;
  owner_id: string | null;
  name: string;
  description: string | null;
  category: string;
  definition: Json;
  is_builtin: boolean;
};

export const listAdProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ad_profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as AdProfile[];
  });

export const saveAdProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: Partial<AdProfile> & { name: string }) => i)
  .handler(async ({ data, context }) => {
    const row = { ...data, owner_id: context.userId };
    if (data.id) {
      const { error } = await context.supabase
        .from("ad_profiles")
        .update(row as never)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase
      .from("ad_profiles")
      .insert(row as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (ins as { id: string }).id };
  });

export const deleteAdProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ad_profiles")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setActiveProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("ad_profiles")
      .update({ is_active: false })
      .eq("owner_id", context.userId);
    const { error } = await context.supabase
      .from("ad_profiles")
      .update({ is_active: true })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAdTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ad_templates")
      .select("*")
      .order("is_builtin", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as AdTemplate[];
  });

export const saveAdTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: {
    id?: string;
    name: string;
    description?: string;
    category?: string;
    definition: TemplateDefinition;
  }) => i)
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { error } = await context.supabase
        .from("ad_templates")
        .update({
          name: data.name,
          description: data.description ?? null,
          category: data.category ?? "custom",
          definition: data.definition as never,
        })
        .eq("id", data.id)
        .eq("owner_id", context.userId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase
      .from("ad_templates")
      .insert({
        owner_id: context.userId,
        name: data.name,
        description: data.description ?? null,
        category: data.category ?? "custom",
        is_builtin: false,
        definition: data.definition as never,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (ins as { id: string }).id };
  });

export const deleteAdTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ad_templates")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAdCreatives = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ad_creatives")
      .select("id,name,size_preset,storage_path,created_at,profile_id,template_id,meta")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const recordAdCreative = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: {
    name: string;
    size_preset: string;
    storage_path: string;
    profile_id?: string | null;
    template_id?: string | null;
    meta?: Record<string, unknown>;
  }) => i)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ad_creatives").insert({
      owner_id: context.userId,
      name: data.name,
      size_preset: data.size_preset,
      storage_path: data.storage_path,
      profile_id: data.profile_id ?? null,
      template_id: data.template_id ?? null,
      meta: (data.meta ?? {}) as never,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAdCreative = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; storage_path: string }) => i)
  .handler(async ({ data, context }) => {
    await context.supabase.storage.from("frames").remove([data.storage_path]);
    const { error } = await context.supabase
      .from("ad_creatives")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
