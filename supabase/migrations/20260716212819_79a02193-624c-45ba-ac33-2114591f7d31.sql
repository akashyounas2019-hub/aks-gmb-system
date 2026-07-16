-- Video folders (mirrors image_folders) and a folder_id on videos so users
-- can organize their uploaded videos the same way they organize raw images.

CREATE TABLE IF NOT EXISTS public.video_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_folders TO authenticated;
GRANT ALL ON public.video_folders TO service_role;

ALTER TABLE public.video_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own video folders"
  ON public.video_folders
  FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER update_video_folders_updated_at
  BEFORE UPDATE ON public.video_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Attach videos to folders (nullable = unfiled). ON DELETE SET NULL so
-- deleting a folder leaves the videos in "Unfiled" rather than removing them.
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS folder_id UUID
    REFERENCES public.video_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS videos_folder_id_idx ON public.videos(folder_id);