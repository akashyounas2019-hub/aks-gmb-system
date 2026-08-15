import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getGmbCredentialsStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("gmb_credentials")
      .select("client_id, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { configured: false as const };
    const cid = data.client_id ?? "";
    return {
      configured: true as const,
      clientIdMasked: cid.length > 12 ? `${cid.slice(0, 8)}…${cid.slice(-4)}` : "••••",
      updatedAt: data.updated_at,
    };
  });

export const saveGmbCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { clientId: string; clientSecret: string }) => {
    if (!data.clientId || data.clientId.length < 10) throw new Error("Invalid client ID");
    if (!data.clientSecret || data.clientSecret.length < 8)
      throw new Error("Invalid client secret");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("gmb_credentials").upsert(
      {
        user_id: userId,
        client_id: data.clientId.trim(),
        client_secret: data.clientSecret.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearGmbCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("gmb_credentials").delete().eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
