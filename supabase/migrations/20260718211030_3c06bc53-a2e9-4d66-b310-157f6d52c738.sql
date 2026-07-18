
-- 1. Origin tracker; default keeps existing inserts working.
ALTER TABLE public.images
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'gmb-rank-pilot';

-- 2. Defensive BEFORE INSERT trigger: fill required fields we can derive.
CREATE OR REPLACE FUNCTION public.images_fill_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN
    NEW.owner_id := auth.uid();
  END IF;
  IF NEW.name IS NULL OR length(btrim(NEW.name)) = 0 THEN
    NEW.name := COALESCE(
      regexp_replace(NEW.storage_path, '^.*/', ''),
      'Untitled'
    );
  END IF;
  IF NEW.source IS NULL OR length(btrim(NEW.source)) = 0 THEN
    NEW.source := 'gmb-rank-pilot';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS images_fill_defaults_trigger ON public.images;
CREATE TRIGGER images_fill_defaults_trigger
BEFORE INSERT ON public.images
FOR EACH ROW EXECUTE FUNCTION public.images_fill_defaults();

-- 3. Stable ingest RPC: minimal, versioned input contract for external callers
--    (Heartbeat Helper, n8n, webhooks). New required columns on images can be
--    added later with defaults without changing this function's signature.
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
SECURITY DEFINER
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

  -- If a folder is passed, make sure it belongs to the caller.
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

REVOKE ALL ON FUNCTION public.ingest_image(text, text, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ingest_image(text, text, uuid, text, text, text) TO authenticated;
