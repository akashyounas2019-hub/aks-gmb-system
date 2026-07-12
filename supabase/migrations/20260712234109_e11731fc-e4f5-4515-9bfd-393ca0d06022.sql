CREATE TABLE public.tracked_keywords (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phrase TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  user_rank INTEGER NOT NULL DEFAULT 20,
  volume INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'Residential',
  sort_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, phrase)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracked_keywords TO authenticated;
GRANT ALL ON public.tracked_keywords TO service_role;

ALTER TABLE public.tracked_keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own tracked_keywords" ON public.tracked_keywords
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE INDEX tracked_keywords_owner_sort_idx
  ON public.tracked_keywords(owner_id, sort_index, created_at);

CREATE TRIGGER update_tracked_keywords_updated_at
  BEFORE UPDATE ON public.tracked_keywords
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();