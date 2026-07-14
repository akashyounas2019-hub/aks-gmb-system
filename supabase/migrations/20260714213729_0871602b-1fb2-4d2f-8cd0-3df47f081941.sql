ALTER TABLE public.agent_tasks
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS eta_at timestamptz,
  ADD COLUMN IF NOT EXISTS eta_confidence text;

-- Backfill started_at for already-running/paused tasks so ETA can be computed
UPDATE public.agent_tasks
SET started_at = COALESCE(started_at, created_at)
WHERE status IN ('running', 'paused') AND started_at IS NULL;