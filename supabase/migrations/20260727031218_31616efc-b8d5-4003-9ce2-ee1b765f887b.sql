-- 1. Remove anon access to lookup + credential tables
REVOKE ALL ON public.tags FROM anon;
REVOKE ALL ON public.venues FROM anon;
REVOKE ALL ON public.gmb_credentials FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venues TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gmb_credentials TO authenticated;
GRANT ALL ON public.tags TO service_role;
GRANT ALL ON public.venues TO service_role;
GRANT ALL ON public.gmb_credentials TO service_role;

DROP POLICY IF EXISTS "tags readable by all" ON public.tags;
CREATE POLICY "tags readable by signed-in users" ON public.tags
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "venues readable by all" ON public.venues;
CREATE POLICY "venues readable by signed-in users" ON public.venues
  FOR SELECT TO authenticated USING (true);

-- 2. Videos bucket: explicit owner-scoped update policy (parity with frames)
DROP POLICY IF EXISTS "own video objects update" ON storage.objects;
CREATE POLICY "own video objects update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'videos' AND (storage.foldername(name))[1] = (auth.uid())::text)
  WITH CHECK (bucket_id = 'videos' AND (storage.foldername(name))[1] = (auth.uid())::text);