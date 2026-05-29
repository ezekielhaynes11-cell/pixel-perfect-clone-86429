DROP POLICY IF EXISTS "authenticated insert physician_contacts" ON public.physician_contacts;
DROP POLICY IF EXISTS "authenticated update physician_contacts" ON public.physician_contacts;
REVOKE INSERT, UPDATE ON public.physician_contacts FROM authenticated;