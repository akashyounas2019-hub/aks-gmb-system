CREATE TABLE public.image_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  thumb_image_id uuid REFERENCES public.images(id) ON DELETE SET NULL,
  image_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.image_collections TO authenticated;
GRANT ALL ON public.image_collections TO service_role;

ALTER TABLE public.image_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their collections"
  ON public.image_collections
  FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER image_collections_set_updated_at
  BEFORE UPDATE ON public.image_collections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX image_collections_owner_idx ON public.image_collections(owner_id, updated_at DESC);