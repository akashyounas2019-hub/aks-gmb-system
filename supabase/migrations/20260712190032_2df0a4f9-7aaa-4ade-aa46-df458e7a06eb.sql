CREATE TABLE public.gmb_credentials (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gmb_credentials TO authenticated;
GRANT ALL ON public.gmb_credentials TO service_role;

ALTER TABLE public.gmb_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own gmb credentials" ON public.gmb_credentials
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);