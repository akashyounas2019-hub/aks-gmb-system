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
    const row = {
      owner_id: userId,
      ...(data.theme !== undefined ? { theme: data.theme } : {}),
      ...(data.general !== undefined ? { general: data.general as never } : {}),
      ...(data.notifications !== undefined ? { notifications: data.notifications as never } : {}),
      ...(data.appearance !== undefined ? { appearance: data.appearance as never } : {}),
    };
    const { error } = await supabase
      .from("user_preferences")
      .upsert(row, { onConflict: "owner_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
