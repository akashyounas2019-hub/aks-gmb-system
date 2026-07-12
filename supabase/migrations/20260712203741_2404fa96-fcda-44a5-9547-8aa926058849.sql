CREATE TABLE public.rank_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  competitor_id UUID NOT NULL REFERENCES public.competitors(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  competitor_rank INTEGER NOT NULL,
  user_rank INTEGER NOT NULL,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);
CREATE INDEX rank_alerts_user_unread_idx ON public.rank_alerts(user_id, read_at, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rank_alerts TO authenticated;
GRANT ALL ON public.rank_alerts TO service_role;
ALTER TABLE public.rank_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own rank alerts" ON public.rank_alerts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);