import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { getPreferences, savePreferences } from "@/lib/user-preferences.functions";
import {
  Building2,
  MapPin,
  Globe,
  Mail,
  Phone,
  Clock,
  Hash,
  Briefcase,
  Users,
  Calendar,
  DollarSign,
  Instagram,
  Facebook,
  Linkedin,
  Twitter,
  Save,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/general")({
  component: GeneralSettings,
});

const KEY = "settings_general_v2";

type General = {
  // Identity
  businessName: string;
  legalName: string;
  tagline: string;
  description: string;
  industry: string;
  businessType: string;
  foundedYear: string;
  employeeCount: string;
  // Location
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  defaultCity: string;
  timezone: string;
  // Contact
  email: string;
  phone: string;
  altPhone: string;
  website: string;
  bookingUrl: string;
  // Corporate
  taxId: string;
  registrationNumber: string;
  currency: string;
  // Hours
  hoursMonFri: string;
  hoursSat: string;
  hoursSun: string;
  // Social
  instagram: string;
  facebook: string;
  linkedin: string;
  twitter: string;
};

const DEFAULTS: General = {
  businessName: "Pearl Home Cleaning",
  legalName: "",
  tagline: "",
  description: "",
  industry: "Home Services",
  businessType: "LLC",
  foundedYear: "",
  employeeCount: "1-10",
  addressLine1: "",
  addressLine2: "",
  city: "Dubai",
  state: "",
  postalCode: "",
  country: "United Arab Emirates",
  defaultCity: "Dubai",
  timezone: "Asia/Dubai",
  email: "",
  phone: "",
  altPhone: "",
  website: "",
  bookingUrl: "",
  taxId: "",
  registrationNumber: "",
  currency: "AED",
  hoursMonFri: "09:00 – 18:00",
  hoursSat: "10:00 – 16:00",
  hoursSun: "Closed",
  instagram: "",
  facebook: "",
  linkedin: "",
  twitter: "",
};

const INDUSTRIES = [
  "Home Services",
  "Retail",
  "Restaurant / Food",
  "Healthcare",
  "Professional Services",
  "Real Estate",
  "Beauty & Wellness",
  "Automotive",
  "Construction",
  "Education",
  "Other",
];

const BUSINESS_TYPES = [
  "Sole Proprietor",
  "LLC",
  "Corporation",
  "Partnership",
  "Non-profit",
  "Other",
];
const EMPLOYEE_RANGES = ["1-10", "11-50", "51-200", "201-500", "500+"];
const CURRENCIES = ["AED", "USD", "EUR", "GBP", "SAR", "INR", "AUD", "CAD"];
const TIMEZONES = [
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
];

function normalizeUrl(v: string): string {
  const s = v.trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}
function isEmail(v: string) {
  return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
function isUrl(v: string) {
  if (!v) return true;
  try {
    new URL(normalizeUrl(v));
    return true;
  } catch {
    return false;
  }
}
function isPhone(v: string) {
  return !v || /^[+()\-.\s\d]{6,}$/.test(v.trim());
}

function GeneralSettings() {
  const [form, setForm] = useState<General>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const load = useServerFn(getPreferences);
  const savePrefs = useServerFn(savePreferences);

  useEffect(() => {
    load()
      .then((p) => {
        const g = (p.general as Partial<General> | null) ?? {};
        setForm({ ...DEFAULTS, ...g });
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load"));
  }, [load]);

  const errors = useMemo(() => {
    const e: Partial<Record<keyof General, string>> = {};
    if (!form.businessName.trim()) e.businessName = "Business name is required";
    if (form.businessName.length > 120) e.businessName = "Keep under 120 characters";
    if (!isEmail(form.email)) e.email = "Invalid email address";
    if (!isPhone(form.phone)) e.phone = "Invalid phone number";
    if (!isPhone(form.altPhone)) e.altPhone = "Invalid phone number";
    if (!isUrl(form.website)) e.website = "Invalid URL";
    if (!isUrl(form.bookingUrl)) e.bookingUrl = "Invalid URL";
    if (form.foundedYear && !/^\d{4}$/.test(form.foundedYear))
      e.foundedYear = "Enter a 4-digit year";
    if (form.description.length > 500) e.description = "Keep under 500 characters";
    return e;
  }, [form]);

  const completeness = useMemo(() => {
    const check: Array<keyof General> = [
      "businessName",
      "addressLine1",
      "city",
      "country",
      "email",
      "phone",
      "website",
      "industry",
      "description",
      "hoursMonFri",
    ];
    const filled = check.filter((k) => (form[k] ?? "").toString().trim().length > 0).length;
    return Math.round((filled / check.length) * 100);
  }, [form]);

  function set<K extends keyof General>(key: K, value: General[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (Object.keys(errors).length > 0) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    setSaving(true);
    const normalized: General = {
      ...form,
      website: normalizeUrl(form.website),
      bookingUrl: normalizeUrl(form.bookingUrl),
    };
    try {
      await savePrefs({ data: { general: normalized as unknown as Record<string, unknown> } });
      setForm(normalized);
      toast.success("Business profile saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const barColor =
    completeness >= 80 ? "bg-emerald-500" : completeness >= 50 ? "bg-amber-500" : "bg-orange-500";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">General</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Core business information — used across analytics, posts, and public listings.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving || Object.keys(errors).length > 0}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      {/* Completeness */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {completeness === 100 ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <AlertCircle className="h-4 w-4 text-amber-500" />
            )}
            <span className="text-sm font-medium">Profile completeness</span>
          </div>
          <span className="text-sm font-semibold">{completeness}%</span>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full ${barColor} transition-all`}
            style={{ width: `${completeness}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Complete profiles rank higher on Google Business Profile and improve local SEO signals.
        </p>
      </div>

      {/* Business identity */}
      <Section
        icon={<Building2 className="h-4 w-4" />}
        title="Business identity"
        desc="How your business is named and described."
      >
        <Grid>
          <Field label="Business name" required error={errors.businessName}>
            <Input
              value={form.businessName}
              onChange={(v) => set("businessName", v)}
              placeholder="Pearl Home Cleaning"
            />
          </Field>
          <Field label="Legal / registered name">
            <Input
              value={form.legalName}
              onChange={(v) => set("legalName", v)}
              placeholder="Pearl Home Cleaning LLC"
            />
          </Field>
          <Field label="Tagline">
            <Input
              value={form.tagline}
              onChange={(v) => set("tagline", v)}
              placeholder="Dubai's trusted home cleaners"
              maxLength={140}
            />
          </Field>
          <Field label="Industry">
            <Select
              value={form.industry}
              onChange={(v) => set("industry", v)}
              options={INDUSTRIES}
            />
          </Field>
          <Field label="Business type">
            <Select
              value={form.businessType}
              onChange={(v) => set("businessType", v)}
              options={BUSINESS_TYPES}
            />
          </Field>
          <Field label="Employees">
            <Select
              value={form.employeeCount}
              onChange={(v) => set("employeeCount", v)}
              options={EMPLOYEE_RANGES}
            />
          </Field>
          <Field label="Founded" error={errors.foundedYear}>
            <Input
              value={form.foundedYear}
              onChange={(v) => set("foundedYear", v)}
              placeholder="2015"
              inputMode="numeric"
              maxLength={4}
            />
          </Field>
        </Grid>
        <Field label="Business description" error={errors.description} full>
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Short description used on your Business Profile and public pages."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="mt-1 text-right text-[11px] text-muted-foreground">
            {form.description.length}/500
          </div>
        </Field>
      </Section>

      {/* Location */}
      <Section
        icon={<MapPin className="h-4 w-4" />}
        title="Location & address"
        desc="Physical address and default service area."
      >
        <Field label="Address line 1" full>
          <Input
            value={form.addressLine1}
            onChange={(v) => set("addressLine1", v)}
            placeholder="Street address"
          />
        </Field>
        <Field label="Address line 2" full>
          <Input
            value={form.addressLine2}
            onChange={(v) => set("addressLine2", v)}
            placeholder="Suite, unit, floor (optional)"
          />
        </Field>
        <Grid>
          <Field label="City">
            <Input value={form.city} onChange={(v) => set("city", v)} />
          </Field>
          <Field label="State / region">
            <Input value={form.state} onChange={(v) => set("state", v)} />
          </Field>
          <Field label="Postal code">
            <Input value={form.postalCode} onChange={(v) => set("postalCode", v)} />
          </Field>
          <Field label="Country">
            <Input value={form.country} onChange={(v) => set("country", v)} />
          </Field>
          <Field label="Default service city">
            <Input value={form.defaultCity} onChange={(v) => set("defaultCity", v)} />
          </Field>
          <Field label="Timezone">
            <Select
              value={form.timezone}
              onChange={(v) => set("timezone", v)}
              options={TIMEZONES}
            />
          </Field>
        </Grid>
      </Section>

      {/* Contact */}
      <Section
        icon={<Phone className="h-4 w-4" />}
        title="Contact channels"
        desc="How customers and platforms reach you."
      >
        <Grid>
          <Field label="Contact email" error={errors.email} icon={<Mail className="h-3.5 w-3.5" />}>
            <Input
              value={form.email}
              onChange={(v) => set("email", v)}
              type="email"
              placeholder="hello@business.com"
            />
          </Field>
          <Field
            label="Primary phone"
            error={errors.phone}
            icon={<Phone className="h-3.5 w-3.5" />}
          >
            <Input
              value={form.phone}
              onChange={(v) => set("phone", v)}
              placeholder="+971 4 123 4567"
            />
          </Field>
          <Field label="Alternate phone" error={errors.altPhone}>
            <Input
              value={form.altPhone}
              onChange={(v) => set("altPhone", v)}
              placeholder="Optional"
            />
          </Field>
          <Field label="Website" error={errors.website} icon={<Globe className="h-3.5 w-3.5" />}>
            <Input
              value={form.website}
              onChange={(v) => set("website", v)}
              placeholder="https://pearlhomecleaning.com"
            />
          </Field>
          <Field label="Booking URL" error={errors.bookingUrl} full>
            <Input
              value={form.bookingUrl}
              onChange={(v) => set("bookingUrl", v)}
              placeholder="https://book.example.com"
            />
          </Field>
        </Grid>
      </Section>

      {/* Hours */}
      <Section
        icon={<Clock className="h-4 w-4" />}
        title="Business hours"
        desc="Displayed on your Business Profile and website."
      >
        <Grid>
          <Field label="Monday – Friday">
            <Input
              value={form.hoursMonFri}
              onChange={(v) => set("hoursMonFri", v)}
              placeholder="09:00 – 18:00"
            />
          </Field>
          <Field label="Saturday">
            <Input
              value={form.hoursSat}
              onChange={(v) => set("hoursSat", v)}
              placeholder="10:00 – 16:00"
            />
          </Field>
          <Field label="Sunday">
            <Input
              value={form.hoursSun}
              onChange={(v) => set("hoursSun", v)}
              placeholder="Closed"
            />
          </Field>
        </Grid>
      </Section>

      {/* Corporate */}
      <Section
        icon={<Briefcase className="h-4 w-4" />}
        title="Corporate details"
        desc="Tax and registration data used in invoices and legal documents."
      >
        <Grid>
          <Field label="Tax / VAT ID" icon={<Hash className="h-3.5 w-3.5" />}>
            <Input
              value={form.taxId}
              onChange={(v) => set("taxId", v)}
              placeholder="TRN / VAT number"
            />
          </Field>
          <Field label="Registration number" icon={<Hash className="h-3.5 w-3.5" />}>
            <Input
              value={form.registrationNumber}
              onChange={(v) => set("registrationNumber", v)}
              placeholder="Trade license #"
            />
          </Field>
          <Field label="Default currency" icon={<DollarSign className="h-3.5 w-3.5" />}>
            <Select
              value={form.currency}
              onChange={(v) => set("currency", v)}
              options={CURRENCIES}
            />
          </Field>
        </Grid>
      </Section>

      {/* Social */}
      <Section
        icon={<Users className="h-4 w-4" />}
        title="Social profiles"
        desc="Linked from your Business Profile posts and share cards."
      >
        <Grid>
          <Field label="Instagram" icon={<Instagram className="h-3.5 w-3.5" />}>
            <Input
              value={form.instagram}
              onChange={(v) => set("instagram", v)}
              placeholder="@handle or URL"
            />
          </Field>
          <Field label="Facebook" icon={<Facebook className="h-3.5 w-3.5" />}>
            <Input
              value={form.facebook}
              onChange={(v) => set("facebook", v)}
              placeholder="Page URL"
            />
          </Field>
          <Field label="LinkedIn" icon={<Linkedin className="h-3.5 w-3.5" />}>
            <Input
              value={form.linkedin}
              onChange={(v) => set("linkedin", v)}
              placeholder="Company page URL"
            />
          </Field>
          <Field label="X / Twitter" icon={<Twitter className="h-3.5 w-3.5" />}>
            <Input
              value={form.twitter}
              onChange={(v) => set("twitter", v)}
              placeholder="@handle or URL"
            />
          </Field>
        </Grid>
      </Section>

      {/* Footer save */}
      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t border-border bg-background/80 px-4 py-3 backdrop-blur">
        {Object.keys(errors).length > 0 && (
          <span className="text-xs text-destructive">
            {Object.keys(errors).length} field{Object.keys(errors).length === 1 ? "" : "s"} need
            attention
          </span>
        )}
        <button
          onClick={save}
          disabled={saving || Object.keys(errors).length > 0}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

/* ---------- Presentational helpers ---------- */

function Section({
  icon,
  title,
  desc,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <header className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

function Field({
  label,
  required,
  error,
  icon,
  full,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  icon?: React.ReactNode;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${full ? "sm:col-span-2 lg:col-span-3" : ""}`}>
      <span className="mb-1 flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground">
        {icon}
        {label}
        {required && <span className="text-destructive">*</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-[11px] text-destructive">{error}</span>}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  maxLength,
  inputMode,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  maxLength?: number;
  inputMode?: "text" | "numeric" | "tel" | "email" | "url";
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      type={type}
      maxLength={maxLength}
      inputMode={inputMode}
      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
    />
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/* Unused import guard */
void Calendar;
