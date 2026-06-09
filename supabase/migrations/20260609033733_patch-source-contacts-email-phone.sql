-- Patch source_contacts: fill email / phone for named physicians.
-- These contacts already exist in source_contacts from original ingestion;
-- this update fills previously-missing values discovered through manual research.
-- Uses jsonb || to merge only the supplied keys, leaving all other fields intact.

-- 1. Richard Gordon Jr., MD — Memorial Hermann / UTHealth Houston
UPDATE public.leads
SET source_contacts = (
  SELECT jsonb_agg(
    CASE
      WHEN (elem->>'name') ILIKE '%Richard Gordon%'
      THEN elem || '{"email":"Richard.D.Gordon@uth.tmc.edu","phone":"(713) 500-7848"}'::jsonb
      ELSE elem
    END
  )
  FROM jsonb_array_elements(source_contacts) AS elem
)
WHERE source_contacts IS NOT NULL
  AND (hospital ILIKE '%Memorial Hermann%' OR hospital ILIKE '%UTHealth%');

-- 2. Jennifer Carnell, MD — Ben Taub Hospital
UPDATE public.leads
SET source_contacts = (
  SELECT jsonb_agg(
    CASE
      WHEN (elem->>'name') ILIKE '%Jennifer Carnell%' OR (elem->>'name') ILIKE '%Carnell%'
      THEN elem || '{"email":"carnell@bcm.edu","phone":"(713) 873-2626"}'::jsonb
      ELSE elem
    END
  )
  FROM jsonb_array_elements(source_contacts) AS elem
)
WHERE source_contacts IS NOT NULL
  AND hospital ILIKE '%Ben Taub%';

-- 3. Nicholas Saltarelli, MD — JPS Health Network
UPDATE public.leads
SET source_contacts = (
  SELECT jsonb_agg(
    CASE
      WHEN (elem->>'name') ILIKE '%Saltarelli%'
      THEN elem || '{"email":"nsaltare@jpshealth.org","phone":"(817) 702-6882"}'::jsonb
      ELSE elem
    END
  )
  FROM jsonb_array_elements(source_contacts) AS elem
)
WHERE source_contacts IS NOT NULL
  AND hospital ILIKE '%JPS%';

-- 4. Mark Laperouse, MD — Our Lady of the Lake
UPDATE public.leads
SET source_contacts = (
  SELECT jsonb_agg(
    CASE
      WHEN (elem->>'name') ILIKE '%Laperouse%'
      THEN elem || '{"phone":"(225) 765-6565"}'::jsonb
      ELSE elem
    END
  )
  FROM jsonb_array_elements(source_contacts) AS elem
)
WHERE source_contacts IS NOT NULL
  AND hospital ILIKE '%Our Lady%';

-- 5. Lori Whelan, MD — OU Health Tulsa
UPDATE public.leads
SET source_contacts = (
  SELECT jsonb_agg(
    CASE
      WHEN (elem->>'name') ILIKE '%Whelan%'
      THEN elem || '{"email":"Lori-whelan@ouhsc.edu"}'::jsonb
      ELSE elem
    END
  )
  FROM jsonb_array_elements(source_contacts) AS elem
)
WHERE source_contacts IS NOT NULL
  AND (hospital ILIKE '%OU Health%' OR hospital ILIKE '%Tulsa%');

-- 6. Bruce S. Bowers, MD — Medical City Heart Hospital
UPDATE public.leads
SET source_contacts = (
  SELECT jsonb_agg(
    CASE
      WHEN (elem->>'name') ILIKE '%Bowers%'
      THEN elem || '{"phone":"(972) 566-8855"}'::jsonb
      ELSE elem
    END
  )
  FROM jsonb_array_elements(source_contacts) AS elem
)
WHERE source_contacts IS NOT NULL
  AND hospital ILIKE '%Medical City%';

-- 7. Nilam J. Soni, MD — UT Health San Antonio
UPDATE public.leads
SET source_contacts = (
  SELECT jsonb_agg(
    CASE
      WHEN (elem->>'name') ILIKE '%Soni%'
      THEN elem || '{"phone":"(210) 567-5792"}'::jsonb
      ELSE elem
    END
  )
  FROM jsonb_array_elements(source_contacts) AS elem
)
WHERE source_contacts IS NOT NULL
  AND hospital ILIKE '%UT Health San Antonio%';
