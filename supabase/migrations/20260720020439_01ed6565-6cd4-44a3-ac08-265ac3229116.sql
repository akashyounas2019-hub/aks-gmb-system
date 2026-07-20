ALTER TABLE public.images ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS images_owner_favorite_idx ON public.images(owner_id) WHERE is_favorite = true;