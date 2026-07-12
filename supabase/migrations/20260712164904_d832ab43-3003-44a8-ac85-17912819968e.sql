
-- Tighten tags INSERT policy
DROP POLICY IF EXISTS "authenticated can add tags" ON public.tags;
CREATE POLICY "authenticated can add tags" ON public.tags
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Storage policies: users can only touch their own folder within videos/ and frames/
-- Path convention: <bucket>/<user_id>/<file>
CREATE POLICY "own video objects select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own video objects insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own video objects delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "own frame objects select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'frames' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own frame objects insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'frames' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own frame objects update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'frames' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own frame objects delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'frames' AND (storage.foldername(name))[1] = auth.uid()::text);
