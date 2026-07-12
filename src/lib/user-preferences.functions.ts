import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PrefsPatch = {
  theme?: string;
  general?: Record<string, unknown>;
  notifications?: Record<string, unknown>;
  appearance?: Record<string, unknown>;
};

export const getPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_preferences")
      .select("theme, general, notifications, appearance")
      .eq("owner_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (
      data ?? {
        theme: "system",
        general: {},
        notifications: {},
        appearance: {},
      }
    );
  });

export const savePreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: PrefsPatch) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const row: Record<string, unknown> = { owner_id: userId };
    if (data.theme !== undefined) row.theme = data.theme;
    if (data.general !== undefined) row.general = data.general;
    if (data.notifications !== undefined) row.notifications = data.notifications;
    if (data.appearance !== undefined) row.appearance = data.appearance;
    const { error } = await supabase
      .from("user_preferences")
      .upsert(row, { onConflict: "owner_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
