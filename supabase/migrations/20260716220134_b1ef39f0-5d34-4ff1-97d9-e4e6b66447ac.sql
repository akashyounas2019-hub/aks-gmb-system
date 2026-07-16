ALTER TABLE public.images ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS images_deleted_at_idx ON public.images (owner_id, deleted_at);