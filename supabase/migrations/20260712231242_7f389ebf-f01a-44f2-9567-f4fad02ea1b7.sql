-- Phase 1: Data model foundation

-- 1) Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read their own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 2) Automations
CREATE TABLE public.automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL, -- 'rank_refresh' | 'auto_publish' | 'auto_tag' | 'alert_scan'
  cron text NOT NULL DEFAULT '0 * * * *',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automations TO authenticated;
GRANT ALL ON public.automations TO service_role;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own automations" ON public.automations
  FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER automations_updated_at BEFORE UPDATE ON public.automations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Automation runs
CREATE TABLE public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL, -- 'success' | 'error' | 'running'
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error text,
  output jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_runs TO authenticated;
GRANT ALL ON public.automation_runs TO service_role;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own runs" ON public.automation_runs
  FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX ON public.automation_runs (automation_id, started_at DESC);

-- 4) Post drafts
CREATE TABLE public.post_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  body text NOT NULL DEFAULT '',
  image_ids uuid[] NOT NULL DEFAULT '{}',
  platforms text[] NOT NULL DEFAULT '{}',
  scheduled_for timestamptz,
  status text NOT NULL DEFAULT 'draft', -- 'draft' | 'scheduled' | 'published' | 'archived'
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_drafts TO authenticated;
GRANT ALL ON public.post_drafts TO service_role;
ALTER TABLE public.post_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own drafts" ON public.post_drafts
  FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER post_drafts_updated_at BEFORE UPDATE ON public.post_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Webhooks
CREATE TABLE public.webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  secret text,
  enabled boolean NOT NULL DEFAULT true,
  last_fired_at timestamptz,
  last_status int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhooks TO authenticated;
GRANT ALL ON public.webhooks TO service_role;
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own webhooks" ON public.webhooks
  FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER webhooks_updated_at BEFORE UPDATE ON public.webhooks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6) User preferences (general + appearance + notifications)
CREATE TABLE public.user_preferences (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme text NOT NULL DEFAULT 'dark',
  general jsonb NOT NULL DEFAULT '{}'::jsonb,
  notifications jsonb NOT NULL DEFAULT '{}'::jsonb,
  appearance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
GRANT ALL ON public.user_preferences TO service_role;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prefs" ON public.user_preferences
  FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER user_preferences_updated_at BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7) Rank snapshots (real GMB rank data)
CREATE TABLE public.rank_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  keyword_id uuid REFERENCES public.keywords(id) ON DELETE CASCADE,
  keyword_phrase text NOT NULL,
  venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  rank int,
  source text NOT NULL DEFAULT 'manual',
  checked_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rank_snapshots TO authenticated;
GRANT ALL ON public.rank_snapshots TO service_role;
ALTER TABLE public.rank_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ranks" ON public.rank_snapshots
  FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX ON public.rank_snapshots (owner_id, keyword_id, checked_at DESC);
CREATE INDEX ON public.rank_snapshots (owner_id, checked_at DESC);

-- 8) Auto-create default 'user' role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_role ON auth.users;
CREATE TRIGGER on_auth_user_created_role
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();
