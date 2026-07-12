CREATE TABLE public.competitor_rank_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  competitor_id UUID REFERENCES public.competitors(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  city TEXT,
  rank INTEGER,
  source TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX competitor_rank_history_lookup_idx ON public.competitor_rank_history(user_id, keyword, recorded_at DESC);
CREATE INDEX competitor_rank_history_competitor_idx ON public.competitor_rank_history(competitor_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitor_rank_history TO authenticated;
GRANT ALL ON public.competitor_rank_history TO service_role;
ALTER TABLE public.competitor_rank_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own competitor rank history" ON public.competitor_rank_history FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);