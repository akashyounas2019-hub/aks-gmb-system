-- Location keywords: area / neighbourhood names the user serves.
-- The GMB post generator picks a random handful of these for every post
-- (see src/rules/gmb-post-rules.md).
-- Idempotent: safe to run more than once.
CREATE TABLE IF NOT EXISTS public.location_keywords (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness per user.
CREATE UNIQUE INDEX IF NOT EXISTS location_keywords_owner_name_uidx
  ON public.location_keywords (owner_id, lower(btrim(name)));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.location_keywords TO authenticated;
GRANT ALL ON public.location_keywords TO service_role;

ALTER TABLE public.location_keywords ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own location_keywords" ON public.location_keywords;
CREATE POLICY "own location_keywords" ON public.location_keywords
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);
