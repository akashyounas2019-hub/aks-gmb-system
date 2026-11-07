import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Loader2, RefreshCw, Send } from "lucide-react";
import { ghlListTargets, ghlSaveTarget, ghlSendTestDraft } from "@/lib/ghl.functions";

type Account = {
  id: string;
  name: string;
  platform: string;
  type: string;
  isExpired: boolean;
  active: boolean;
};
type User = { id: string; name: string; email?: string };

/**
 * Settings → Integrations → GoHighLevel: pick which connected Google Business
 * account posts go to, and which GHL user they are posted as.
 */
export function GhlGmbAccountPanel() {
  const listTargets = useServerFn(ghlListTargets);
  const saveTarget = useServerFn(ghlSaveTarget);
  const sendTest = useServerFn(ghlSendTestDraft);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState("");
  const [userId, setUserId] = useState("");
  const [savedAccountId, setSavedAccountId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await listTargets();
      setAccounts(res.accounts);
      setUsers(res.users);
      setUsersError(res.usersError ?? null);
      const google = res.accounts.filter((a) => a.platform === "google");
      setAccountId(res.selected.accountId ?? google[0]?.id ?? "");
      setUserId(res.selected.userId ?? res.users[0]?.id ?? "");
      setSavedAccountId(res.selected.accountId ?? null);
      if (google.length === 0) {
        toast.warning("No Google Business account is connected in GHL Social Planner yet.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load GHL accounts");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    const acc = accounts?.find((a) => a.id === accountId);
    if (!acc) return toast.error("Pick an account first.");
    setSaving(true);
    try {
      await saveTarget({
        data: { accountId: acc.id, accountName: acc.name, userId: userId.trim() || undefined },
      });
      setSavedAccountId(acc.id);
      toast.success(`Posts will go to "${acc.name}" via GoHighLevel.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    try {
      await sendTest();
      toast.success("Test draft created — check GHL → Marketing → Social Planner → Drafts.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(false);
    }
  }

  const google = (accounts ?? []).filter((a) => a.platform === "google");
  const others = (accounts ?? []).filter((a) => a.platform !== "google");

  return (
    <div className="mt-3 rounded-xl border border-border bg-background/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">Google Business account for posting</div>
          <div className="text-xs text-muted-foreground">
            Posts and schedules are sent to this account through GHL Social Planner.
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {accounts ? "Reload accounts" : "Load my GHL accounts"}
        </button>
      </div>

      {accounts && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs">
            <span className="mb-1 block text-muted-foreground">Account</span>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm"
            >
              <option value="">— Select —</option>
              {google.length > 0 && (
                <optgroup label="Google Business Profile">
                  {google.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.isExpired ? " (connection expired)" : ""}
                    </option>
                  ))}
                </optgroup>
              )}
              {others.length > 0 && (
                <optgroup label="Other networks">
                  {others.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.platform}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>

          <label className="block text-xs">
            <span className="mb-1 block text-muted-foreground">Post as GHL user</span>
            {users.length > 0 ? (
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {u.email ? ` · ${u.email}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="GHL User ID"
                className="w-full rounded-md border border-border bg-background px-2.5 py-2 font-mono text-sm"
              />
            )}
            {users.length === 0 && (
              <span className="mt-1 block text-[11px] text-amber-600 dark:text-amber-400">
                Couldn&apos;t list users{usersError ? ` (${usersError.slice(0, 80)})` : ""}. Add the
                &quot;users.readonly&quot; scope, or paste your User ID.
              </span>
            )}
          </label>
        </div>
      )}

      {accounts && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving || !accountId}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Save account
          </button>
          <button
            type="button"
            onClick={test}
            disabled={testing || !savedAccountId}
            title={savedAccountId ? "Creates a draft post in GHL" : "Save an account first"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            {testing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Send test draft
          </button>
          {savedAccountId && (
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
              Saved: {accounts.find((a) => a.id === savedAccountId)?.name ?? savedAccountId}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
