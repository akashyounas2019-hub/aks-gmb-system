
-- Folder hierarchy for keyword organization
CREATE TABLE public.keyword_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  parent_id UUID REFERENCES public.keyword_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.keyword_folders TO authenticated;
GRANT ALL ON public.keyword_folders TO service_role;

ALTER TABLE public.keyword_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own keyword folders"
  ON public.keyword_folders
  FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE INDEX idx_keyword_folders_owner ON public.keyword_folders(owner_id);
CREATE INDEX idx_keyword_folders_parent ON public.keyword_folders(parent_id);

CREATE TRIGGER trg_keyword_folders_updated_at
  BEFORE UPDATE ON public.keyword_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Attach keywords to folders (optional; NULL = "Unfiled")
ALTER TABLE public.keywords
  ADD COLUMN folder_id UUID REFERENCES public.keyword_folders(id) ON DELETE SET NULL;

CREATE INDEX idx_keywords_folder ON public.keywords(folder_id);
