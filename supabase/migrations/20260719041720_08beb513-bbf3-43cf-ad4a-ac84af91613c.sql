
-- Profiles: users see own row; admins see all
DROP POLICY IF EXISTS "profiles readable by signed-in" ON public.profiles;
CREATE POLICY "profiles read own or admin" ON public.profiles FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Internal/config tables: admin only
DROP POLICY IF EXISTS "account_briefs readable by signed-in" ON public.account_briefs;
CREATE POLICY "account_briefs read admin" ON public.account_briefs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "signed-in read ingestion runs" ON public.ingestion_runs;
CREATE POLICY "ingestion_runs read admin" ON public.ingestion_runs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "keyword_lists readable by signed-in" ON public.keyword_lists;
CREATE POLICY "keyword_lists read admin" ON public.keyword_lists FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "scraped_pages readable by signed-in" ON public.scraped_pages;
CREATE POLICY "scraped_pages read admin" ON public.scraped_pages FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Sales data: require explicit rep or admin role (no anonymous or role-less users)
DROP POLICY IF EXISTS "accounts readable by signed-in" ON public.accounts;
CREATE POLICY "accounts read rep or admin" ON public.accounts FOR SELECT
  USING (public.has_role(auth.uid(), 'rep') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "leads readable by signed-in users" ON public.leads;
CREATE POLICY "leads read rep or admin" ON public.leads FOR SELECT
  USING (public.has_role(auth.uid(), 'rep') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "lead_physicians readable by signed-in" ON public.lead_physicians;
CREATE POLICY "lead_physicians read rep or admin" ON public.lead_physicians FOR SELECT
  USING (public.has_role(auth.uid(), 'rep') OR public.has_role(auth.uid(), 'admin'));

-- PII tables: restrict to rep or admin (still requires an assigned role, not any authenticated user)
DROP POLICY IF EXISTS "contacts_read_authenticated" ON public.contacts;
CREATE POLICY "contacts read rep or admin" ON public.contacts FOR SELECT
  USING (public.has_role(auth.uid(), 'rep') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "contact_enrichment readable by signed-in" ON public.contact_enrichment;
CREATE POLICY "contact_enrichment read rep or admin" ON public.contact_enrichment FOR SELECT
  USING (public.has_role(auth.uid(), 'rep') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "physician_contacts readable by signed-in" ON public.physician_contacts;
CREATE POLICY "physician_contacts read rep or admin" ON public.physician_contacts FOR SELECT
  USING (public.has_role(auth.uid(), 'rep') OR public.has_role(auth.uid(), 'admin'));
