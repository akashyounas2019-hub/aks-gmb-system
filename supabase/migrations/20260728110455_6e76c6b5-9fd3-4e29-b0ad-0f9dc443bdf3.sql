ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS cta_type text,
  ADD COLUMN IF NOT EXISTS cta_url text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS primary_keyword text,
  ADD COLUMN IF NOT EXISTS networks text[] NOT NULL DEFAULT '{gmb}'::text[];