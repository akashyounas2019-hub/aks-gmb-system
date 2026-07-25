ALTER TABLE public.images DROP CONSTRAINT images_video_id_fkey;
ALTER TABLE public.images ADD CONSTRAINT images_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE SET NULL;