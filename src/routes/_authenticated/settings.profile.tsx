import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/profile")({
  component: ProfileSettings,
});

function ProfileSettings() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? "");
      setName((data.user?.user_metadata as { full_name?: string })?.full_name ?? "");
    });
  }, []);
  async function save() {
    const { error } = await supabase.auth.updateUser({ data: { full_name: name } });
    if (error) toast.error(error.message);
    else toast.success("Profile updated");
  }
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">Your account details.</p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div>
          <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Email</div>
          <div className="text-sm">{email || "—"}</div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
            Full name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <button
          onClick={save}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Save changes
        </button>
      </div>
    </div>
  );
}
