CREATE TABLE public.agent_task_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  progress INTEGER,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_task_events TO authenticated;
GRANT ALL ON public.agent_task_events TO service_role;

ALTER TABLE public.agent_task_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own agent task events" ON public.agent_task_events
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX agent_task_events_user_idx ON public.agent_task_events(user_id, created_at DESC);
CREATE INDEX agent_task_events_agent_idx ON public.agent_task_events(agent_id, created_at DESC);
CREATE INDEX agent_task_events_task_idx ON public.agent_task_events(task_id, created_at DESC);