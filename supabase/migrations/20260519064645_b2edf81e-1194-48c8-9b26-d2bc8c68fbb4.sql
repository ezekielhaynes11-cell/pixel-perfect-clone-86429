CREATE TABLE public.account_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  markdown text NOT NULL,
  structured jsonb NOT NULL DEFAULT '{}'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX account_briefs_account_id_created_at_idx
  ON public.account_briefs (account_id, created_at DESC);

ALTER TABLE public.account_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_briefs readable by signed-in"
  ON public.account_briefs FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins manage account_briefs"
  ON public.account_briefs FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));