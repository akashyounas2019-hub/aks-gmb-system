
-- Profiles
CREATE TABLE public.ad_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  theme text NOT NULL DEFAULT 'light',
  colors jsonb NOT NULL DEFAULT '{"primary":"#1877F2","secondary":"#42B72A","background":"#FFFFFF","text":"#111111","accent":"#F02849"}'::jsonb,
  fonts jsonb NOT NULL DEFAULT '{"headline":"Inter","body":"Inter"}'::jsonb,
  default_template_id uuid,
  logo_path text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_profiles TO authenticated;
GRANT ALL ON public.ad_profiles TO service_role;
ALTER TABLE public.ad_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_ad_profiles" ON public.ad_profiles FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Templates (owner_id null = built-in)
CREATE TABLE public.ad_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  -- definition: { canvas:{w,h,bg}, slots:[ {id,type:'image'|'text'|'shape'|'logo', x,y,w,h, defaults:{...}} ] }
  definition jsonb NOT NULL,
  thumbnail_path text,
  is_builtin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_templates TO authenticated;
GRANT ALL ON public.ad_templates TO service_role;
ALTER TABLE public.ad_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_templates" ON public.ad_templates FOR SELECT
  TO authenticated USING (owner_id IS NULL OR auth.uid() = owner_id);
CREATE POLICY "write_own_templates" ON public.ad_templates FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "update_own_templates" ON public.ad_templates FOR UPDATE
  TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "delete_own_templates" ON public.ad_templates FOR DELETE
  TO authenticated USING (auth.uid() = owner_id);

-- Rendered creatives
CREATE TABLE public.ad_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  profile_id uuid REFERENCES public.ad_profiles(id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.ad_templates(id) ON DELETE SET NULL,
  name text NOT NULL,
  size_preset text NOT NULL,
  storage_path text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_creatives TO authenticated;
GRANT ALL ON public.ad_creatives TO service_role;
ALTER TABLE public.ad_creatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_ad_creatives" ON public.ad_creatives FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- updated_at triggers
CREATE TRIGGER trg_ad_profiles_updated BEFORE UPDATE ON public.ad_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ad_templates_updated BEFORE UPDATE ON public.ad_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed built-in templates
INSERT INTO public.ad_templates (owner_id, name, description, category, is_builtin, definition) VALUES
(NULL, 'Bold Product Promo', 'Big product photo, price tag, CTA bar', 'promo', true,
 '{"canvas":{"w":1080,"h":1080,"bg":"#FFFFFF"},"slots":[
   {"id":"photo","type":"image","x":0,"y":0,"w":1080,"h":720,"defaults":{"fit":"cover"}},
   {"id":"headline","type":"text","x":60,"y":760,"w":720,"h":80,"defaults":{"text":"Your Headline","size":56,"weight":700,"color":"#111111","align":"left"}},
   {"id":"subline","type":"text","x":60,"y":850,"w":720,"h":50,"defaults":{"text":"Supporting line goes here","size":28,"weight":400,"color":"#555555","align":"left"}},
   {"id":"pricetag","type":"shape","x":820,"y":760,"w":200,"h":120,"defaults":{"fill":"#F02849","radius":16}},
   {"id":"pricetext","type":"text","x":820,"y":785,"w":200,"h":80,"defaults":{"text":"$99","size":48,"weight":800,"color":"#FFFFFF","align":"center"}},
   {"id":"ctabar","type":"shape","x":60,"y":960,"w":960,"h":80,"defaults":{"fill":"#1877F2","radius":12}},
   {"id":"ctatext","type":"text","x":60,"y":975,"w":960,"h":50,"defaults":{"text":"Shop Now","size":36,"weight":700,"color":"#FFFFFF","align":"center"}}
 ]}'::jsonb),
(NULL, 'Clean Announcement', 'Text-forward announcement over hero image', 'announcement', true,
 '{"canvas":{"w":1080,"h":1080,"bg":"#0F172A"},"slots":[
   {"id":"photo","type":"image","x":0,"y":0,"w":1080,"h":1080,"defaults":{"fit":"cover","opacity":0.45}},
   {"id":"headline","type":"text","x":80,"y":420,"w":920,"h":180,"defaults":{"text":"Big News","size":96,"weight":800,"color":"#FFFFFF","align":"center"}},
   {"id":"subline","type":"text","x":80,"y":620,"w":920,"h":80,"defaults":{"text":"Something worth sharing","size":32,"weight":400,"color":"#E2E8F0","align":"center"}},
   {"id":"cta","type":"text","x":80,"y":900,"w":920,"h":60,"defaults":{"text":"Learn more →","size":28,"weight":600,"color":"#38BDF8","align":"center"}}
 ]}'::jsonb),
(NULL, 'Split Feature Card', 'Left photo, right feature list', 'feature', true,
 '{"canvas":{"w":1080,"h":1080,"bg":"#FFFFFF"},"slots":[
   {"id":"photo","type":"image","x":0,"y":0,"w":540,"h":1080,"defaults":{"fit":"cover"}},
   {"id":"headline","type":"text","x":580,"y":120,"w":460,"h":120,"defaults":{"text":"Why Choose Us","size":48,"weight":800,"color":"#111111","align":"left"}},
   {"id":"feature1","type":"text","x":580,"y":300,"w":460,"h":60,"defaults":{"text":"✓ Fast delivery","size":28,"weight":500,"color":"#111111","align":"left"}},
   {"id":"feature2","type":"text","x":580,"y":380,"w":460,"h":60,"defaults":{"text":"✓ Trusted by 10k+","size":28,"weight":500,"color":"#111111","align":"left"}},
   {"id":"feature3","type":"text","x":580,"y":460,"w":460,"h":60,"defaults":{"text":"✓ 5-star support","size":28,"weight":500,"color":"#111111","align":"left"}},
   {"id":"ctabar","type":"shape","x":580,"y":900,"w":420,"h":80,"defaults":{"fill":"#42B72A","radius":12}},
   {"id":"ctatext","type":"text","x":580,"y":915,"w":420,"h":50,"defaults":{"text":"Get Started","size":32,"weight":700,"color":"#FFFFFF","align":"center"}}
 ]}'::jsonb),
(NULL, 'Story Vertical', '9:16 story-friendly hero layout', 'story', true,
 '{"canvas":{"w":1080,"h":1920,"bg":"#111111"},"slots":[
   {"id":"photo","type":"image","x":0,"y":0,"w":1080,"h":1200,"defaults":{"fit":"cover"}},
   {"id":"headline","type":"text","x":80,"y":1280,"w":920,"h":200,"defaults":{"text":"Story Headline","size":88,"weight":800,"color":"#FFFFFF","align":"left"}},
   {"id":"subline","type":"text","x":80,"y":1500,"w":920,"h":100,"defaults":{"text":"A short supporting message","size":36,"weight":400,"color":"#E5E7EB","align":"left"}},
   {"id":"ctabar","type":"shape","x":80,"y":1720,"w":920,"h":100,"defaults":{"fill":"#F02849","radius":14}},
   {"id":"ctatext","type":"text","x":80,"y":1740,"w":920,"h":60,"defaults":{"text":"Swipe Up","size":40,"weight":700,"color":"#FFFFFF","align":"center"}}
 ]}'::jsonb),
(NULL, 'Minimal Type', 'Type-first, no photo required', 'minimal', true,
 '{"canvas":{"w":1080,"h":1080,"bg":"#F5F5F0"},"slots":[
   {"id":"eyebrow","type":"text","x":80,"y":260,"w":920,"h":60,"defaults":{"text":"NEW COLLECTION","size":28,"weight":600,"color":"#6B7280","align":"center"}},
   {"id":"headline","type":"text","x":80,"y":380,"w":920,"h":260,"defaults":{"text":"Made\nFor You","size":128,"weight":900,"color":"#111111","align":"center"}},
   {"id":"subline","type":"text","x":80,"y":720,"w":920,"h":80,"defaults":{"text":"Discover the range","size":32,"weight":400,"color":"#374151","align":"center"}}
 ]}'::jsonb);
