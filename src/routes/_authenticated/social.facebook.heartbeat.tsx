import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Heart, ImageIcon, Loader2, ExternalLink, Settings as SettingsIcon, RefreshCw, PenSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  buildHeartbeatCatalog,
  getHeartbeatBaseUrl,
  setHeartbeatBaseUrl,
  resolveHeartbeatUrl,
  validateHeartbeatBaseUrl,
  HB_OFFER_GROUPS,
  HB_PHOTO_CATEGORIES,
  type HeartbeatItem,
} from "@/lib/heartbeat";

export const Route = createFileRoute("/_authenticated/social/facebook/heartbeat")({
  component: HeartbeatGalleryPage,
});

const LS_FAVS = "heartbeat:favs";

function useLocalSet(key: string): [Set<string>, (id: string) => void] {
  const [set, setSet] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setSet(new Set(JSON.parse(raw)));
    } catch {}
  }, [key]);
  const toggle = (id: string) => {
    setSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try { localStorage.setItem(key, JSON.stringify([...next])); } catch {}
      return next;
    });
  };
  return [set, toggle];
}

type Tab = "offers" | "photos" | "favs";

function HeartbeatGalleryPage() {
  const navigate = useNavigate();
  const catalog = useMemo(() => buildHeartbeatCatalog(), []);
  const [baseUrl, setBaseUrlState] = useState("");
  const [urlDraft, setUrlDraft] = useState("");
  const [tab, setTab] = useState<Tab>("offers");
  const [offerSub, setOfferSub] = useState<string>(HB_OFFER_GROUPS[0].key);
  const [photoSub, setPhotoSub] = useState<string>(HB_PHOTO_CATEGORIES[0].key);
  const [favs, toggleFav] = useLocalSet(LS_FAVS);
  const [busy, setBusy] = useState<Record<string, "import" | "post" | undefined>>({});
  const [reachable, setReachable] = useState<boolean | null>(null);

  useEffect(() => {
    const url = getHeartbeatBaseUrl();
    setBaseUrlState(url);
    setUrlDraft(url);
  }, []);

  // Probe reachability of the base URL with a lightweight image ping.
  useEffect(() => {
    if (!baseUrl) { setReachable(null); return; }
    let cancelled = false;
    const probe = new Image();
    probe.onload = () => { if (!cancelled) setReachable(true); };
    probe.onerror = () => { if (!cancelled) setReachable(false); };
    probe.src = resolveHeartbeatUrl(baseUrl, "/offers/house-01.png") + `?_=${Date.now()}`;
    return () => { cancelled = true; };
  }, [baseUrl]);

  const saveBaseUrl = () => {
    const v = validateHeartbeatBaseUrl(urlDraft);
    if (!v.valid) { toast.error(v.message); return; }
    setHeartbeatBaseUrl(urlDraft);
    setBaseUrlState(urlDraft.replace(/\/+$/, ""));
    toast.success("HeartBeat URL saved");
  };

  const items = useMemo(() => {
    if (tab === "favs") return catalog.filter((it) => favs.has(it.id));
    if (tab === "offers") return catalog.filter((it) => it.group === "offer" && it.groupKey === offerSub);
    return catalog.filter((it) => it.group === "photo" && it.groupKey === photoSub);
  }, [tab, offerSub, photoSub, catalog, favs]);

  async function importImage(item: HeartbeatItem, opts?: { openPostGen?: boolean }) {
    if (!baseUrl) { toast.error("Set HeartBeat URL first"); return; }
    const key = item.id;
    setBusy((b) => ({ ...b, [key]: opts?.openPostGen ? "post" : "import" }));
    try {
      const url = resolveHeartbeatUrl(baseUrl, item.src);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
      const blob = await res.blob();

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");

      const ext = (item.src.split(".").pop() || "png").toLowerCase();
      const cat = item.group === "offer" ? "post" : "post"; // both land in Facebook post feed
      const path = `${uid}/social-facebook-${cat}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("frames")
        .upload(path, blob, { contentType: blob.type || "image/png", upsert: false });
      if (upErr) throw upErr;

      // Use the stable ingest_image RPC — insulates us from future required
      // columns being added to the images table.
      const { error: dbErr } = await supabase.rpc("ingest_image", {
        p_storage_path: path,
        p_name: item.title,
        p_title: item.title,
        p_description: `Imported from HeartBeat · ${item.badge}`,
        p_source: "heartbeat",
      });
      if (dbErr) throw dbErr;

      toast.success(`Imported "${item.title}"`);
      if (opts?.openPostGen) {
        navigate({ to: "/post-generator" });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy((b) => ({ ...b, [key]: undefined }));
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <span>Facebook</span>
            <span className="text-muted-foreground/50">/</span>
            <span className="text-foreground">HeartBeat Gallery</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">HeartBeat Gallery</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse creatives generated in HeartBeat. Import into this project's Facebook library to schedule or post.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 " +
              (reachable === true
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                : reachable === false
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-600"
                  : "border-border bg-muted/40 text-muted-foreground")
            }
          >
            <span className={"h-1.5 w-1.5 rounded-full " + (reachable === true ? "bg-emerald-500" : reachable === false ? "bg-rose-500" : "bg-muted-foreground/60")} />
            {reachable === true ? "Connected" : reachable === false ? "Not reachable" : "Not configured"}
          </span>
          <Link
            to="/settings/integrations"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 hover:bg-accent"
          >
            <SettingsIcon className="h-3.5 w-3.5" /> Integration
          </Link>
        </div>
      </header>

      {/* Base URL bar */}
      <section className="mb-6 rounded-xl border border-border bg-card p-4">
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          HeartBeat published URL
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="url"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="https://your-heartbeat.lovable.app"
            className="min-w-[280px] flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary"
          />
          <button
            onClick={saveBaseUrl}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Save
          </button>
          {baseUrl && (
            <a
              href={baseUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs hover:bg-accent"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open HeartBeat
            </a>
          )}
          <button
            onClick={() => setBaseUrlState((s) => s + "")}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs hover:bg-accent"
            title="Re-probe reachability"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Paste the published URL of your HeartBeat project (e.g. <code className="rounded bg-muted px-1">https://heartbeat-helper.lovable.app</code>). Images are pulled live from <code className="rounded bg-muted px-1">/offers/*</code> and <code className="rounded bg-muted px-1">/photos/*</code>.
        </p>
      </section>

      {!baseUrl && (
        <div className="rounded-xl border-2 border-dashed border-border bg-muted/20 p-10 text-center">
          <ImageIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Set the HeartBeat URL above to load the catalog.</p>
        </div>
      )}

      {baseUrl && (
        <>
          {/* Tab bar */}
          <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-border">
            {([
              { k: "offers", label: "Offers", hint: "15 ads" },
              { k: "photos", label: "Photo Library", hint: "52 photos" },
              { k: "favs", label: "Favorites", hint: `${favs.size}` },
            ] as const).map((t) => (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                className={
                  "inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition " +
                  (tab === t.k
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground")
                }
              >
                {t.label}
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold">{t.hint}</span>
              </button>
            ))}
          </div>

          {/* Sub-tabs */}
          {tab === "offers" && (
            <SubTabs
              tabs={HB_OFFER_GROUPS.map((g) => ({ key: g.key, title: g.title, subtitle: g.subtitle, count: g.count }))}
              active={offerSub}
              onChange={setOfferSub}
            />
          )}
          {tab === "photos" && (
            <SubTabs
              tabs={HB_PHOTO_CATEGORIES.map((c) => ({ key: c.key, title: c.name, subtitle: `${c.count} photos`, count: c.count }))}
              active={photoSub}
              onChange={setPhotoSub}
            />
          )}

          {/* Grid */}
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => (
              <HbCard
                key={item.id}
                item={item}
                baseUrl={baseUrl}
                isFav={favs.has(item.id)}
                onFav={() => toggleFav(item.id)}
                busy={busy[item.id]}
                onImport={() => importImage(item)}
                onImportAndPost={() => importImage(item, { openPostGen: true })}
              />
            ))}
            {items.length === 0 && (
              <div className="col-span-full rounded-xl border-2 border-dashed border-border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
                {tab === "favs" ? "No favorites yet — tap the heart on any image." : "Nothing in this category."}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SubTabs({
  tabs, active, onChange,
}: {
  tabs: { key: string; title: string; subtitle: string; count: number }[];
  active: string;
  onChange: (k: string) => void;
}) {
  return (
    <div className="mt-4 flex gap-1 overflow-x-auto rounded-lg border border-border bg-muted/30 p-1">
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={
              "shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition " +
              (isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground")
            }
          >
            {t.title}
            <span className="ml-1.5 rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums dark:bg-white/10">
              {t.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function HbCard({
  item, baseUrl, isFav, onFav, busy, onImport, onImportAndPost,
}: {
  item: HeartbeatItem;
  baseUrl: string;
  isFav: boolean;
  onFav: () => void;
  busy: "import" | "post" | undefined;
  onImport: () => void;
  onImportAndPost: () => void;
}) {
  const url = resolveHeartbeatUrl(baseUrl, item.src);
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:shadow-md">
      <div className={"overflow-hidden bg-muted " + (item.vertical ? "aspect-[9/16]" : "aspect-square")}>
        <img src={url} alt={item.title} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
      </div>
      <button
        onClick={onFav}
        aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
        className={
          "absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full shadow-md transition " +
          (isFav ? "bg-rose-500 text-white" : "bg-background/90 text-muted-foreground hover:text-rose-500")
        }
      >
        <Heart className={"h-4 w-4 " + (isFav ? "fill-current" : "")} />
      </button>
      <span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
        {item.badge}
      </span>
      <div className="p-3">
        <div className="truncate text-sm font-semibold">{item.title}</div>
        <div className="mt-2 flex gap-1.5">
          <button
            onClick={onImport}
            disabled={!!busy}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy === "import" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
            Import
          </button>
          <button
            onClick={onImportAndPost}
            disabled={!!busy}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-50"
            title="Import and open Post Generator"
          >
            {busy === "post" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenSquare className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
