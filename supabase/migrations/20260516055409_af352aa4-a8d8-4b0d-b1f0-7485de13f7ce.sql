
CREATE TABLE public.physician_contacts (
  npi text PRIMARY KEY,
  full_name text NOT NULL,
  credentials text,
  primary_specialty text,
  practice_address text,
  practice_city text,
  practice_state text,
  practice_zip text,
  practice_phone text,
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.physician_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "physician_contacts readable by signed-in"
  ON public.physician_contacts FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE public.lead_physicians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  npi text NOT NULL REFERENCES public.physician_contacts(npi) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'named_in_source',
  match_confidence numeric NOT NULL DEFAULT 1.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, npi)
);

CREATE INDEX idx_lead_physicians_lead ON public.lead_physicians(lead_id);
CREATE INDEX idx_lead_physicians_npi ON public.lead_physicians(npi);

ALTER TABLE public.lead_physicians ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_physicians readable by signed-in"
  ON public.lead_physicians FOR SELECT
  TO authenticated
  USING (true);
