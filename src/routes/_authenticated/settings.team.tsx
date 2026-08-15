import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Users, Shield, ShieldOff, Crown, UserPlus } from "lucide-react";
import {
  getMyRoles,
  listMembers,
  assignRole,
  revokeRole,
  claimAdminIfUnowned,
  type AppRole,
  type Member,
} from "@/lib/roles.functions";

export const Route = createFileRoute("/_authenticated/settings/team")({
  component: TeamSettings,
});

function TeamSettings() {
  const [myRoles, setMyRoles] = useState<AppRole[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("moderator");
  const [busy, setBusy] = useState(false);

  const loadRoles = useServerFn(getMyRoles);
  const loadMembers = useServerFn(listMembers);
  const claim = useServerFn(claimAdminIfUnowned);
  const grant = useServerFn(assignRole);
  const revoke = useServerFn(revokeRole);

  const isAdmin = myRoles.includes("admin");

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const roles = await loadRoles();
      setMyRoles(roles);
      if (roles.includes("admin")) {
        const ms = await loadMembers();
        setMembers(ms);
      } else {
        setMembers([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load team");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleClaim() {
    setBusy(true);
    try {
      await claim();
      toast.success("You are now the workspace admin");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not claim admin");
    } finally {
      setBusy(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setBusy(true);
    try {
      await grant({ data: { email: inviteEmail.trim(), role: inviteRole } });
      toast.success(`Granted ${inviteRole} to ${inviteEmail}`);
      setInviteEmail("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not grant role");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(userId: string, role: AppRole) {
    if (!confirm(`Revoke ${role} from this user?`)) return;
    setBusy(true);
    try {
      await revoke({ data: { userId, role } });
      toast.success("Role revoked");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not revoke role");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Team & Roles</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Grant admin or moderator access to other users in this workspace.
        </p>
      </div>

      {loading && (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Loading…
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !isAdmin && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Shield className="h-4 w-4 text-primary" />
            Your role: {myRoles.length ? myRoles.join(", ") : "user"}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Only admins can manage team roles. If no admin exists yet in this workspace, you can
            claim admin now.
          </p>
          <button
            onClick={handleClaim}
            disabled={busy}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Crown className="h-4 w-4" /> Claim admin
          </button>
        </div>
      )}

      {!loading && isAdmin && (
        <>
          <form
            onSubmit={handleInvite}
            className="rounded-2xl border border-border bg-card p-5 space-y-3"
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <UserPlus className="h-4 w-4 text-primary" /> Grant role
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
                className="flex-1 min-w-[220px] rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as AppRole)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="admin">admin</option>
                <option value="moderator">moderator</option>
                <option value="user">user</option>
              </select>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Grant
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              The user must already have an account. Roles are additive per user.
            </p>
          </form>

          <div className="rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Users className="h-4 w-4 text-primary" /> Members ({members.length})
              </div>
            </div>
            {members.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No members yet.</div>
            ) : (
              <div className="divide-y divide-border">
                {members.map((m) => (
                  <div key={m.userId} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {m.email || m.userId.slice(0, 8)}
                        {m.isSelf && (
                          <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">
                            you
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {m.roles.map((r) => (
                          <span
                            key={r}
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
                              r === "admin"
                                ? "border-primary/40 bg-primary/10 text-primary"
                                : r === "moderator"
                                  ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
                                  : "border-border text-muted-foreground"
                            }`}
                          >
                            {r === "admin" && <Crown className="h-3 w-3" />}
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {m.roles
                        .filter((r) => r !== "user")
                        .map((r) => (
                          <button
                            key={r}
                            onClick={() => handleRevoke(m.userId, r)}
                            disabled={busy}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                          >
                            <ShieldOff className="h-3 w-3" /> Revoke {r}
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
