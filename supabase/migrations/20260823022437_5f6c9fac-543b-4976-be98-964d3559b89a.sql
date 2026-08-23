CREATE TABLE public.refresh_state (
  id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'idle',
  trigger text,
  last_attempted_at timestamptz,
  last_succeeded_at timestamptz,
  records_scanned integer NOT NULL DEFAULT 0,
  records_updated integer NOT NULL DEFAULT 0,
  sources_ok integer NOT NULL DEFAULT 0,
  sources_failed integer NOT NULL DEFAULT 0,
  error_message text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.refresh_state TO authenticated;
GRANT ALL ON public.refresh_state TO service_role;

ALTER TABLE public.refresh_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "refresh_state read rep or admin" ON public.refresh_state
FOR SELECT USING (has_role(auth.uid(), 'rep'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.refresh_state (id, status) VALUES ('global', 'idle');