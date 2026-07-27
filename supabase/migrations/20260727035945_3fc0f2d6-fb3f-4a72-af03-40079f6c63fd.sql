-- Real scheduled-post dispatch: adds the columns the composer already writes
-- to (previously silently dropped), and registers a pg_cron job that
-- actually invokes the automations dispatcher on a schedule. Before this
-- migration, "scheduled" posts sat in social_posts forever — nothing ever
-- checked whether their time had arrived.

-- 1) social_posts: persist the CTA button choice (was collected in Compose
--    but never stored/sent — the CSV export and webhook payload need it).
ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS cta_type text,
  ADD COLUMN IF NOT EXISTS cta_url text;

-- 2) Enable the extensions needed to call an HTTP endpoint on a schedule.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 3) Schedule the dispatcher every 5 minutes. Uses net.http_post (from
--    pg_net) to call the app's public run-automations endpoint, which in
--    turn queries due social_posts rows and sends each one for real.
--
--    ⚠️ REQUIRED MANUAL STEP: replace the placeholder URL below with your
--    app's actual deployed origin before/after applying this migration —
--    e.g. https://<your-app>.lovable.app/api/public/hooks/run-automations.
--    pg_net can only reach a public HTTPS URL; it cannot reach localhost.
--
--    The endpoint checks the `x-automations-secret` header against the
--    AUTOMATIONS_CRON_SECRET environment variable — set the same value
--    both here (via `app.automations_cron_secret`, below) and in your
--    deployment's environment variables.
SELECT set_config('app.automations_cron_secret', 'REPLACE_WITH_A_RANDOM_SECRET', false);

SELECT cron.schedule(
  'dispatch-scheduled-posts',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://REPLACE-WITH-YOUR-APP-DOMAIN/api/public/hooks/run-automations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-automations-secret', 'REPLACE_WITH_A_RANDOM_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);
