import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/general")({
  component: GeneralSettings,
});

const KEY = "settings_general_v1";
type General = { businessName: string; timezone: string; defaultCity: string };
const DEFAULTS: General = { businessName: "Pearl Home Cleaning", timezone: "Asia/Dubai", defaultCity: "Dubai" };

function GeneralSettings() {
  const [form, setForm] = useState<General>(DEFAULTS);
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
      if (raw) setForm({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {}
  }, []);
  function save() {
    localStorage.setItem(KEY, JSON.stringify(form));
    toast.success("Saved");
  }
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">General</h2>
        <p className="mt-1 text-sm text-muted-foreground">Basic business information used across the app.</p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <Field label="Business name">
          <input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} className="input" />
        </Field>
        <Field label="Default city">
          <input value={form.defaultCity} onChange={(e) => setForm({ ...form, defaultCity: e.target.value })} className="input" />
        </Field>
        <Field label="Timezone">
          <input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className="input" />
        </Field>
        <button onClick={save} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          Save changes
        </button>
      </div>
      <style>{`.input{width:100%;border-radius:.5rem;border:1px solid hsl(var(--border));background:hsl(var(--background));padding:.5rem .75rem;font-size:.875rem}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
