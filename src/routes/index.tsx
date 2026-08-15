import { createFileRoute, Link } from "@tanstack/react-router";
import { Film, MapPin, Sparkles, Tag, Upload } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-hero-gradient">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <img src="/favicon.png" alt="" width={32} height={32} className="h-8 w-8 rounded-md" />
          <span className="font-display text-lg font-semibold">GMB Rank Pilot</span>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/auth" className="text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
          <Link
            to="/auth"
            className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
          >
            Get started
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-4xl px-6 pb-20 pt-16 text-center">
        <span className="inline-block rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs uppercase tracking-widest text-primary">
          Local SEO · Rank tracking · Content automation
        </span>
        <h1 className="mt-6 text-5xl leading-tight sm:text-6xl">
          Pilot your Google Business <span className="text-gold-gradient">local rankings</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Track keyword rankings across your service area, visualize local visibility on a heat map,
          and push AI-generated posts and media straight into GoHighLevel — from a single control
          center.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            to="/auth"
            className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground hover:opacity-90"
          >
            Start uploading
          </Link>
          <a
            href="#features"
            className="rounded-md border border-border px-6 py-3 font-medium hover:bg-accent"
          >
            How it works
          </a>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Upload,
              title: "Drop any video",
              body: "MP4, MOV, WebM. Uploads to your private storage.",
            },
            {
              icon: Film,
              title: "Sharpest frames",
              body: "Browser-side ffmpeg + Laplacian scoring — no server GPU needed.",
            },
            {
              icon: Sparkles,
              title: "AI tag suggestions",
              body: "Gemini vision proposes tags from your keyword list.",
            },
            {
              icon: MapPin,
              title: "Dubai geotags",
              body: "Bulk-attach venues from a curated library of Dubai landmarks.",
            },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-card p-6">
              <f.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-3xl border border-border bg-card/50 p-8">
          <div className="flex items-center gap-2 text-primary">
            <Tag className="h-5 w-5" />
            <span className="text-sm uppercase tracking-widest">The workflow</span>
          </div>
          <ol className="mt-6 grid gap-6 sm:grid-cols-3">
            {[
              ["1", "Upload", "Drag a video into your browser."],
              [
                "2",
                "Extract",
                "GMB Rank Pilot runs ffmpeg.wasm locally, scores every frame for sharpness, and keeps the winners.",
              ],
              [
                "3",
                "Tag & geotag",
                "Rename, pick tags (AI-assisted), and attach a Dubai venue with real coordinates.",
              ],
            ].map(([n, t, d]) => (
              <li key={n}>
                <div className="text-4xl font-display text-primary">{n}</div>
                <div className="mt-2 font-semibold">{t}</div>
                <p className="mt-1 text-sm text-muted-foreground">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        Built for Dubai. Powered by ffmpeg.wasm + Lovable Cloud.
      </footer>
    </div>
  );
}
