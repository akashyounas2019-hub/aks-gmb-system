CREATE TABLE public.agent_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  related_agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  task_id UUID REFERENCES public.agent_tasks(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_notifications TO authenticated;
GRANT ALL ON public.agent_notifications TO service_role;

ALTER TABLE public.agent_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own agent notifications" ON public.agent_notifications
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX agent_notifications_user_idx ON public.agent_notifications(user_id, created_at DESC);
CREATE INDEX agent_notifications_agent_idx ON public.agent_notifications(agent_id, created_at DESC);
CREATE INDEX agent_notifications_unread_idx ON public.agent_notifications(user_id, read_at) WHERE read_at IS NULL;