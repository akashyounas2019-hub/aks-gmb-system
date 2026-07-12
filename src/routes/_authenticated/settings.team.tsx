import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/team")({
  component: TeamSettings,
});

function TeamSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Team</h2>
        <p className="mt-1 text-sm text-muted-foreground">Invite teammates to collaborate on posts and rankings.</p>
      </div>
      <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
        <Users className="mx-auto h-8 w-8 text-muted-foreground" />
        <div className="mt-3 text-sm font-medium">Multi-user workspaces coming soon</div>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
          You'll be able to invite editors and viewers, with per-role access to keywords, posts, and analytics.
        </p>
      </div>
    </div>
  );
}
