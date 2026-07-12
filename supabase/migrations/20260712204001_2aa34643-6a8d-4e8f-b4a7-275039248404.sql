DROP POLICY IF EXISTS "Users manage own competitors" ON public.competitors;
CREATE POLICY "Users manage own competitors" ON public.competitors
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own gmb tokens" ON public.gmb_tokens;
DROP POLICY IF EXISTS "Users can manage own gmb tokens" ON public.gmb_tokens;
DROP POLICY IF EXISTS "gmb_tokens_owner_all" ON public.gmb_tokens;
CREATE POLICY "Users manage own gmb tokens" ON public.gmb_tokens
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own integrations" ON public.user_integrations;
DROP POLICY IF EXISTS "Users can manage own integrations" ON public.user_integrations;
CREATE POLICY "Users manage own integrations" ON public.user_integrations
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);