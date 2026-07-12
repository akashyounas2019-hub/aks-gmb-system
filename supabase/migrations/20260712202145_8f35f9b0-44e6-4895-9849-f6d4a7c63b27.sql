
CREATE TABLE public.gmb_tokens (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  token_type TEXT,
  account_name TEXT,
  location_name TEXT,
  location_title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gmb_tokens TO authenticated;
GRANT ALL ON public.gmb_tokens TO service_role;
ALTER TABLE public.gmb_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own gmb tokens" ON public.gmb_tokens
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_gmb_tokens_updated_at
BEFORE UPDATE ON public.gmb_tokens
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
