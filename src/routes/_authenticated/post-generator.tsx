import { createFileRoute } from "@tanstack/react-router";
import { Copy, Send, Sparkles, Terminal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/post-generator")({
  component: PostGeneratorPage,
});

const TEMPLATES = [
  {
    id: "offer",
    name: "Local offer",
    body:
      "🔥 {{offer}} in {{city}} this week!\n\n" +
      "Serving {{service_area}} — book your {{service}} today.\n\n" +
      "📞 Call {{phone}} or reply to this post.\n\n" +
      "{{keywords}}",
  },
  {
    id: "howto",
    name: "How-to tip",
    body:
      "Homeowner tip: {{tip_title}}\n\n" +
      "{{tip_body}}\n\n" +
      "Need help in {{city}}? We're {{service}} specialists — {{phone}}.\n\n" +
      "{{keywords}}",
  },
  {
    id: "review",
    name: "Review highlight",
    body:
      '⭐️⭐️⭐️⭐️⭐️ "{{quote}}" — {{customer}}\n\n' +
      "Thank you! We love serving {{city}}. Book your {{service}} today.\n\n" +
      "{{keywords}}",
  },
];

function PostGeneratorPage() {
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [keywords, setKeywords] = useState(
    "plumber dubai, emergency plumber, 24 hour service",
  );
  const [vars, setVars] = useState<Record<string, string>>({});
  const [output, setOutput] = useState("");

  const template = TEMPLATES.find((t) => t.id === templateId)!;
  const placeholders = Array.from(
    new Set([...template.body.matchAll(/{{(\w+)}}/g)].map((m) => m[1])),
  ).filter((p) => p !== "keywords");

  function generate() {
    let text = template.body;
    for (const p of placeholders) {
      text = text.replaceAll(`{{${p}}}`, vars[p] || `[${p}]`);
    }
    const hashtags = keywords
      .split(",")
      .map((k) => "#" + k.trim().replace(/\s+/g, ""))
      .filter((h) => h.length > 1)
      .join(" ");
    text = text.replaceAll("{{keywords}}", hashtags);
    setOutput(text);
  }

  async function copyOut() {
    await navigator.clipboard.writeText(output);
    toast.success("Copied");
  }

  return (
    <div className="p-6 md:p-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">Post Generator</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Build Google Business posts from templates + keyword lists, then push
            to GoHighLevel for scheduling.
          </p>
        </div>
        <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs uppercase tracking-widest text-primary">
          Preview
        </span>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Left column: template + inputs */}
        <div className="space-y-5">
          <div>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">
              Template
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplateId(t.id)}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    t.id === templateId
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">
              Keywords (comma separated)
            </label>
            <textarea
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              rows={2}
              className="mt-2 w-full rounded-md border border-border bg-background p-3 text-sm"
            />
          </div>

          <div className="space-y-3">
            {placeholders.map((p) => (
              <div key={p}>
                <label className="text-xs uppercase tracking-widest text-muted-foreground">
                  {p.replace(/_/g, " ")}
                </label>
                <input
                  value={vars[p] || ""}
                  onChange={(e) => setVars({ ...vars, [p]: e.target.value })}
                  className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm"
                />
              </div>
            ))}
          </div>

          <button
            onClick={generate}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Sparkles className="h-4 w-4" /> Generate
          </button>
        </div>

        {/* Right column: output */}
        <div>
          <label className="text-xs uppercase tracking-widest text-muted-foreground">
            Preview
          </label>
          <textarea
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            rows={16}
            placeholder="Click Generate to build a post…"
            className="mt-2 w-full rounded-md border border-border bg-background p-4 text-sm"
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={copyOut}
              disabled={!output}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-40"
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </button>
            <button
              disabled
              className="inline-flex items-center gap-2 rounded-md bg-primary/40 px-3 py-1.5 text-sm text-primary-foreground"
              title="Wire this to sendPostToGhl server fn"
            >
              <Send className="h-3.5 w-3.5" /> Send to GHL (coming)
            </button>
          </div>
        </div>
      </div>

      {/* AKS Worker CLI integration notes */}
      <section className="mt-12 rounded-2xl border border-primary/30 bg-primary/5 p-6">
        <div className="flex items-center gap-2 text-primary">
          <Terminal className="h-5 w-5" />
          <h2 className="text-lg font-semibold">
            AKS Worker CLI — content generation options
          </h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Content generation must run through your local AKS Worker CLI (Claude
          Pro). Three integration shapes are viable — pick one after you upload
          the CLI docs.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <IntegrationCard
            title="1 · Local HTTP + tunnel"
            body="Run AKS Worker as an HTTP server on your PC, expose via ngrok/Cloudflare Tunnel, save the URL as AKS_WORKER_URL. App calls it from a server function. Simplest, but tunnel must stay up."
            tag="Easiest"
          />
          <IntegrationCard
            title="2 · Queue + polling"
            body="App writes a row to a `post_jobs` table. Your PC runs a small watcher that polls the job table, runs AKS Worker, and posts the result back. No tunnel, resilient to your PC being offline."
            tag="Robust"
          />
          <IntegrationCard
            title="3 · n8n bridge"
            body="Your existing n8n instance triggers the CLI via a `Execute Command` node on a self-hosted worker, and posts results back to a Lovable webhook. Reuses your n8n setup."
            tag="Reuses n8n"
          />
        </div>

        <div className="mt-5 rounded-lg border border-border bg-background p-4 text-xs text-muted-foreground">
          Waiting on: the AKS Worker CLI docs / binary details so we can pick
          option 1/2/3 and wire the exact request/response shape.
        </div>
      </section>
    </div>
  );
}

function IntegrationCard({
  title,
  body,
  tag,
}: {
  title: string;
  body: string;
  tag: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] uppercase tracking-widest text-primary">
          {tag}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
