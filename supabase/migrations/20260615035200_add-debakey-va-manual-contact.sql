-- Manually-sourced decision-maker contact for Michael E. DeBakey VA Medical Center.
-- This lead's source_contacts was empty (null); this migration seeds it with a
-- single human-verified contact. Idempotent: skips the row if the contact
-- (matched by email) is already present, so re-running is a no-op.

UPDATE public.leads
SET source_contacts = COALESCE(source_contacts, '[]'::jsonb) || jsonb_build_array(
  jsonb_build_object(
    'name', 'Dr. Salim S. Virani',
    'title', 'Staff Cardiologist',
    'organization', 'Michael E. DeBakey VA Medical Center',
    'email', 'salim.virani@va.gov',
    'phone', '713-791-1414 ext. 10266',
    'address', NULL,
    'type', 'decision_maker',
    'source_origin', 'manual'
  )
)
WHERE hospital ILIKE '%DeBakey%'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(source_contacts, '[]'::jsonb)) AS elem
    WHERE elem->>'email' = 'salim.virani@va.gov'
  );
