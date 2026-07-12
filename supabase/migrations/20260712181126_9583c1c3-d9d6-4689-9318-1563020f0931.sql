
-- Keywords (Semrush imports + manual)
CREATE TABLE public.keywords (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  phrase text not null,
  volume integer,
  keyword_difficulty numeric,
  cpc numeric,
  intent text,
  cluster text,
  source text default 'manual',
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.keywords TO authenticated;
GRANT ALL ON public.keywords TO service_role;
ALTER TABLE public.keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own keywords" ON public.keywords FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX keywords_owner_idx ON public.keywords(owner_id);

-- Image ↔ keyword join
CREATE TABLE public.image_keywords (
  image_id uuid not null,
  keyword_id uuid not null,
  owner_id uuid not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (image_id, keyword_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.image_keywords TO authenticated;
GRANT ALL ON public.image_keywords TO service_role;
ALTER TABLE public.image_keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own image_keywords" ON public.image_keywords FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Location history (MRU picker for geotagging)
CREATE TABLE public.location_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  label text not null,
  place_id text,
  lat numeric not null,
  lng numeric not null,
  used_count integer not null default 1,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.location_history TO authenticated;
GRANT ALL ON public.location_history TO service_role;
ALTER TABLE public.location_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own location_history" ON public.location_history FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX location_history_owner_recent_idx ON public.location_history(owner_id, last_used_at DESC);

-- Scheduled/queued social posts (for GHL Social Planner push)
CREATE TABLE public.social_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  caption text not null,
  image_ids uuid[] not null default '{}',
  primary_keyword_id uuid,
  location_label text,
  lat numeric,
  lng numeric,
  ghl_location_id text,
  scheduled_at timestamptz,
  status text not null default 'draft',
  provider_response jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_posts TO authenticated;
GRANT ALL ON public.social_posts TO service_role;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own social_posts" ON public.social_posts FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX social_posts_owner_idx ON public.social_posts(owner_id, created_at DESC);
