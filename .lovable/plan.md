## Plan: Patch contact emails & phones into existing leads

Update the `source_contacts` JSONB on 6 existing leads, matching by contact `name`, filling the `email` and `phone` fields only (keep all other fields intact). One UPDATE per lead using `jsonb_set` / array reconstruction so unmatched contacts (e.g. Jack Schwade, Andrea Daniels, E.J. Kuiper) remain untouched.

### Mapping

**Ben Taub Hospital** (`b1b493a7…`)
- Jennifer Carnell, MD → email `carnell@bcm.edu`, phone `713-873-2626`
- Esmaeil Porsa, MD → email `esmaeil.porsa@harrishealth.org`

**JPS Health Network** (`78a2255d…`)
- Nicholas Saltarelli, MD → email `nsaltare@jpshealth.org`, phone `817-702-6882`
- Lynn Roppolo, MD → email `lynn.roppolo@utsouthwestern.edu`, phone `817-702-3623`
- Jennifer Byrd, DO → email `JPSEM@jpshealth.org`, phone `817-702-3623`

**UT Health San Antonio** (`ed3c9752…`)
- Nilam J. Soni, MD → email `sonin@uthscsa.edu`
- Jessica Solis-McCarthy, MD → email `SolisJ4@uthscsa.edu`

**Medical City Heart Hospital** (`b9b0e538…`)
- Bruce S. Bowers, MD → phone `972-940-8000`

**Our Lady of the Lake** (`77138e23…`)
- Mark Laperouse, MD → email `info@pepaem.com`

**OU Health (Tulsa)** (`d5495c9a…`)
- Lori Whelan, MD → phone `918-660-3900`

### Execution

Run as a single `supabase--insert` (UPDATE) batch. For each lead, rebuild `source_contacts` via a SQL expression that maps over the existing array and merges the new email/phone into the matching name's object — preserving all other contacts and fields. Verify after with a SELECT.

No schema changes, no UI changes.