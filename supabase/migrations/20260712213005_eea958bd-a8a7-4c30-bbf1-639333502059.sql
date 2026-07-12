
ALTER TABLE public.rank_alerts
  ADD COLUMN IF NOT EXISTS alert_type text NOT NULL DEFAULT 'overtake',
  ADD COLUMN IF NOT EXISTS rank_delta integer;

CREATE TABLE IF NOT EXISTS public.alert_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  threat_keyword_threshold integer NOT NULL DEFAULT 2,
  rank_improvement_delta integer NOT NULL DEFAULT 3,
  overtake_enabled boolean NOT NULL DEFAULT true,
  threat_enabled boolean NOT NULL DEFAULT true,
  improvement_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_settings TO authenticated;
GRANT ALL ON public.alert_settings TO service_role;

ALTER TABLE public.alert_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own alert settings"
  ON public.alert_settings
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_alert_settings_updated_at
  BEFORE UPDATE ON public.alert_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
