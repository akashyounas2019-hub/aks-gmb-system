# Path to 10/10 — Execution Plan

Everything in the audit, sequenced so each phase leaves the app in a shippable state. I'll execute phase by phase in this thread; after each phase I'll show you what changed and move to the next.

## Phase 1 — Data model foundation (DB migration)
One migration adds every table we need for the rest of the work, so we don't ping-pong migrations later.

- `automations` — user-defined workflows (name, kind, cron, config jsonb, enabled, last_run_at, next_run_at)
- `automation_runs` — execution log (automation_id, status, started_at, finished_at, error, output jsonb)
- `post_drafts` — replaces localStorage post storage (owner_id, title, body, image_ids[], platforms[], scheduled_for, status)
- `webhooks` — replaces localStorage webhooks (owner_id, name, url, events[], secret, enabled)
- `user_preferences` — replaces General/Appearance/Notifications localStorage (owner_id, theme, notifications jsonb, general jsonb)
- `app_role` enum + `user_roles` + `has_role()` security-definer function
- `rank_snapshots` — real GMB rank storage (owner_id, keyword_id, lat, lng, rank, checked_at) so Analytics stops mocking
- All with GRANTs + RLS scoped to `auth.uid()`.

## Phase 2 — Real Automation engine
- Server route `src/routes/api/public/hooks/run-automations.ts` (verifies caller via anon key, iterates due automations, dispatches by `kind`: `rank_refresh`, `auto_publish`, `auto_tag`, `alert_scan`).
- `pg_cron` job every 5 min hitting that route.
- Rewrite `_authenticated/automation.tsx` to CRUD real `automations` rows, show real `automation_runs` history, replace the fake `setTimeout` toggle with true enable/disable.

## Phase 3 — Real GMB Analytics
- Server fn `refreshRankGrid` uses existing `rank-source.functions.ts` to write `rank_snapshots` at a 3×3 or 5×5 grid.
- Replace `MOCK_KEYWORDS` + seeded heatmap in `gmb-analytics.tsx` with a query over `rank_snapshots`. Manual "Refresh now" + automation-driven refresh both work.

## Phase 4 — Kill localStorage drift
- Post Storage: read/write `post_drafts`; add `draft` status flow with server fns.
- Webhooks: `webhooks` table + server fns; test/fire endpoint.
- General / Appearance / Notifications: single `user_preferences` row via server fns; existing UI keeps working, just persistent.

## Phase 5 — Roles, team, Google OAuth
- `user_roles` UI in `settings.team.tsx`: invite by email (writes a pending role), list members, remove.
- Re-enable Google in `auth.tsx` via `lovable.auth.signInWithOAuth("google", …)` and call `supabase--configure_social_auth` in the same turn.
- Gate admin-only server fns with `has_role(..., 'admin')`.

## Phase 6 — Cleanup
- Remove `TRACKED_KEYWORDS`, `PLACES`, `MOCK_KEYWORDS` fallback arrays; source from DB (`keywords`, `venues`, `rank_snapshots`). Keep as seed data in a migration only.
- Drop `location_history` if still unused, or wire the geotagging screen to write/read it.
- Remove silent `catch {}` blocks in `automation.tsx`, `post-storage.tsx`, OAuth revoke — surface errors via toast.

## Technical notes
- Cron auth uses the anon `apikey` header pattern (no new secret).
- Every new public table gets `GRANT ... TO authenticated` + `GRANT ALL ... TO service_role` + RLS `auth.uid() = owner_id`.
- All new server fns live in `src/lib/*.functions.ts` with `requireSupabaseAuth`; admin imports happen inside handler bodies only.
- No breaking UI moves — the nav stays as it is today.

## What you'll see between phases
After each phase I'll post: files changed, migration summary (if any), and a one-line "verify this works" instruction. If anything drifts from what you want, we course-correct before the next phase.

Approve this and I'll start with Phase 1 (the migration) on the next turn.