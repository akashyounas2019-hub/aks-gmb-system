CREATE TABLE public.image_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.image_folders TO authenticated;
GRANT ALL ON public.image_folders TO service_role;

ALTER TABLE public.image_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own folders"
  ON public.image_folders
  FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER update_image_folders_updated_at
  BEFORE UPDATE ON public.image_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX image_folders_owner_idx ON public.image_folders(owner_id);

ALTER TABLE public.images
  ADD COLUMN folder_id UUID NULL REFERENCES public.image_folders(id) ON DELETE SET NULL;

CREATE INDEX images_folder_idx ON public.images(folder_id);
