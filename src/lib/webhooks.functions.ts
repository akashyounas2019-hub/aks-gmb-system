import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WebhookInput = {
  id?: string;
  name: string;
  url: string;
  events: string[];
  secret?: string | null;
  enabled?: boolean;
};

export const listWebhooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("webhooks")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: WebhookInput) => input)
  .handler(async ({ data, context }) => {
    const row = {
      ...(data.id ? { id: data.id } : {}),
      owner_id: context.userId,
      name: data.name,
      url: data.url,
      events: data.events,
      secret: data.secret ?? null,
      enabled: data.enabled ?? true,
    };
    const { data: saved, error } = await context.supabase
      .from("webhooks")
      .upsert(row)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const deleteWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("webhooks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const recordWebhookFire = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: number }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("webhooks")
      .update({ last_fired_at: new Date().toISOString(), last_status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
