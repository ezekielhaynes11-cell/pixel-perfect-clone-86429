CREATE TABLE public.contact_enrichment (
  lead_id uuid PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('found','none')),
  name text,
  title text,
  organization text,
  phone text,
  email text,
  linkedin_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.contact_enrichment TO authenticated;
GRANT ALL ON public.contact_enrichment TO service_role;

ALTER TABLE public.contact_enrichment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contact_enrichment readable by signed-in"
ON public.contact_enrichment FOR SELECT TO authenticated USING (true);