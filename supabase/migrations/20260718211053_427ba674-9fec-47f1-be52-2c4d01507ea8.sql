
CREATE OR REPLACE FUNCTION public.ingest_image(
  p_storage_path text,
  p_name text DEFAULT NULL,
  p_folder_id uuid DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_source text DEFAULT 'heartbeat'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_storage_path IS NULL OR length(btrim(p_storage_path)) = 0 THEN
    RAISE EXCEPTION 'storage_path is required' USING ERRCODE = '22023';
  END IF;

  IF p_folder_id IS NOT NULL THEN
    PERFORM 1 FROM public.image_folders
      WHERE id = p_folder_id AND owner_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'folder not found' USING ERRCODE = '42P01';
    END IF;
  END IF;

  INSERT INTO public.images (
    owner_id, storage_path, name, folder_id, title, description, source
  ) VALUES (
    v_uid,
    p_storage_path,
    COALESCE(NULLIF(btrim(p_name), ''), regexp_replace(p_storage_path, '^.*/', '')),
    p_folder_id,
    p_title,
    p_description,
    COALESCE(NULLIF(btrim(p_source), ''), 'heartbeat')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
