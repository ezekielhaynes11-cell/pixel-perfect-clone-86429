-- Single-user tool: drop FKs to auth.users so we can operate without real auth users
ALTER TABLE public.profiles       DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;
ALTER TABLE public.user_roles     DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
ALTER TABLE public.lead_actions   DROP CONSTRAINT IF EXISTS lead_actions_user_id_fkey;
ALTER TABLE public.saved_searches DROP CONSTRAINT IF EXISTS saved_searches_user_id_fkey;
ALTER TABLE public.alerts         DROP CONSTRAINT IF EXISTS alerts_user_id_fkey;
ALTER TABLE public.briefings      DROP CONSTRAINT IF EXISTS briefings_user_id_fkey;
ALTER TABLE public.outreach_drafts DROP CONSTRAINT IF EXISTS outreach_drafts_user_id_fkey;

INSERT INTO public.profiles (user_id, email, display_name)
VALUES ('00000000-0000-0000-0000-000000000001', 'owner@local', 'Owner')
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
VALUES ('00000000-0000-0000-0000-000000000001', 'admin')
ON CONFLICT DO NOTHING;