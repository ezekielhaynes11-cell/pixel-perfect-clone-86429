ALTER TABLE public.physician_contacts
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS apollo_id text,
  ADD COLUMN IF NOT EXISTS apollo_enriched_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS physician_contacts_apollo_id_key
  ON public.physician_contacts (apollo_id)
  WHERE apollo_id IS NOT NULL;

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS domain text,
  ADD COLUMN IF NOT EXISTS apollo_org_id text,
  ADD COLUMN IF NOT EXISTS employee_count int,
  ADD COLUMN IF NOT EXISTS apollo_enriched_at timestamptz;

-- Allow authenticated users to insert/update physician_contacts so Apollo enrichment works
GRANT INSERT, UPDATE ON public.physician_contacts TO authenticated;

CREATE POLICY "authenticated insert physician_contacts"
  ON public.physician_contacts
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated update physician_contacts"
  ON public.physician_contacts
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);