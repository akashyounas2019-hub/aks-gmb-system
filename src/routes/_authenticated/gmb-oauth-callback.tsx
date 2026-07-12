import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { exchangeGmbCode } from "@/lib/gmb-oauth.functions";

export const Route = createFileRoute("/_authenticated/gmb-oauth-callback")({
  component: CallbackPage,
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
    state: typeof search.state === "string" ? search.state : undefined,
  }),
});

function CallbackPage() {
  const { code, error } = Route.useSearch();
  const exchange = useServerFn(exchangeGmbCode);
  const navigate = useNavigate();
  const [status, setStatus] = useState<"pending" | "ok" | "err">("pending");
  const [msg, setMsg] = useState<string>("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (error) {
      setStatus("err");
      setMsg(`Google rejected the request: ${error}`);
      return;
    }
    if (!code) {
      setStatus("err");
      setMsg("Missing authorization code.");
      return;
    }
    exchange({ data: { code, origin: window.location.origin } })
      .then(() => {
        setStatus("ok");
        setTimeout(() => navigate({ to: "/settings/integrations" }), 900);
      })
      .catch((e) => {
        setStatus("err");
        setMsg(e instanceof Error ? e.message : "Exchange failed");
      });
  }, [code, error, exchange, navigate]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      {status === "pending" && (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="text-lg font-semibold">Finishing Google sign-in…</div>
          <p className="text-sm text-muted-foreground">Exchanging authorization code for tokens.</p>
        </>
      )}
      {status === "ok" && (
        <>
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          <div className="text-lg font-semibold">Google connected</div>
          <p className="text-sm text-muted-foreground">Redirecting to Integrations…</p>
        </>
      )}
      {status === "err" && (
        <>
          <XCircle className="h-10 w-10 text-destructive" />
          <div className="text-lg font-semibold">Couldn't complete sign-in</div>
          <p className="max-w-sm text-sm text-muted-foreground">{msg}</p>
          <button
            onClick={() => navigate({ to: "/settings/integrations" })}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
          >
            Back to Integrations
          </button>
        </>
      )}
    </div>
  );
}
