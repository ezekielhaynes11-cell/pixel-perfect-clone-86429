-- Manually-sourced decision-maker contacts.
-- Creates a normalized `contacts` table, links each record to its matching
-- lead (case-insensitive fuzzy match on hospital/account name), and seeds the
-- 18 hand-verified contacts. Idempotent: re-running upserts on
-- (account_name, contact_name) so no duplicates are created.
--
-- Guardrail: institutional emails are preferred for outreach. Personal / alt
-- emails are stored only as backup (alt_email) and must not be used for cold
-- outreach.

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  account_name text not null,
  lead_id uuid null references public.leads(id) on delete set null,
  contact_name text null,
  title text null,
  alt_contact text null,
  direct_phone text null,
  department_phone text null,
  email text null,
  alt_email text null,
  email_domain_standard text null,
  facility_address text null,
  needs_manual_sourcing boolean not null default false,
  source text not null default 'manual_seed',
  created_at timestamptz not null default now()
);

-- Idempotent upsert key. NULLS NOT DISTINCT so rows with a null contact_name
-- (target-role-only "needs sourcing" rows) still dedupe per account on re-run.
create unique index if not exists contacts_account_contact_uniq
  on public.contacts (account_name, contact_name) nulls not distinct;

create index if not exists contacts_lead_id_idx on public.contacts (lead_id);

alter table public.contacts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'contacts'
      and policyname = 'contacts_read_authenticated'
  ) then
    create policy contacts_read_authenticated
      on public.contacts for select to authenticated using (true);
  end if;
end $$;

-- Seed / upsert the 18 records. lead_id is resolved by normalizing both the
-- account_name and lead.hospital (lowercased, parentheticals stripped,
-- non-alphanumerics collapsed to spaces) and testing containment either way.
with lead_norm as (
  select id,
    btrim(regexp_replace(regexp_replace(regexp_replace(lower(hospital),
      '\([^)]*\)', ' ', 'g'), '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g')) as nh
  from public.leads
  where hospital is not null
),
v (account_name, contact_name, title, alt_contact, direct_phone, department_phone,
   email, alt_email, email_domain_standard, facility_address, needs_manual_sourcing) as (
  values
  ('Washington Regional Medical Center','James Batey','Director of Imaging Services','Dr. Joel "Cam" Mosley, EM Residency Program Director','479-463-1000','479-463-3372 (EM GME Office)','jbatey@wregional.com','emresidencynwa@uams.edu','@wregional.com','3215 N. Northhills Blvd, Fayetteville, AR 72703',false),
  ('UTHealth Houston McGovern Medical School','Richard Gordon Jr., MD, FACEP','Professor & Clinical Ultrasound Fellowship Director',null,'713-500-7848','713-500-7878','Richard.D.Gordon@uth.tmc.edu',null,'@uth.tmc.edu','6431 Fannin Street, MMS G.420, Houston, TX 77030',false),
  ('Ochsner Health System','Sam S. Langberg, MD','Emergency Medicine & Director of Ultrasound',null,'504-842-3000','504-842-4000 (Main)','Sam.Langberg@ochsner.org','samlangberg@gmail.com','@ochsner.org','Ochsner Medical Center, 1514 Jefferson Hwy, New Orleans, LA 70121',false),
  ('University of Arkansas for Medical Sciences (UAMS)','Jason Arthur, MD, MPH','Associate Professor, Division of Emergency Ultrasound',null,'501-686-6562','501-686-7000 (Main)','jarthur@uams.edu','jason.arthur@uams.edu','@uams.edu','4301 W. Markham Mail Slot # 584, Little Rock, AR 72205',false),
  ('Fort Bliss Army Garrison',null,'Chief of Logistics / Materiel Acquisition (William Beaumont Army Medical Center)',null,'915-742-2273 (Appointments)','915-742-2692 (Patient Advocate)',null,null,'@health.mil / @mail.mil','William Beaumont Army Medical Center, 18511 Highlander Medics St, Fort Bliss, TX 79918',true),
  ('Texas A&M Rural Health Program','Greg Gilmer','Chief Development Officer, Texas A&M Health',null,'979-436-1000','979-436-1000 (Main Health Science Center)','ggilmer@tamu.edu',null,'@tamu.edu','Texas A&M Health Science Center, 8447 State Hwy 47, Bryan, TX 77807',false),
  ('Medical City Heart Hospital',null,'Cardiology Director / CVICU Director',null,'972-940-8000 (Main Hospital Line)','972-940-8000',null,null,'@hcahealthcare.com','11970 N Central Expressway, Dallas, TX 75243',true),
  ('Ben Taub Hospital','Jennifer Carnell, MD','Associate Professor & Emergency Ultrasound Fellowship Director',null,'713-873-2626 (Fellowship)','713-798-1000 (Baylor Medicine)','carnell@bcm.edu','jencarnell@gmail.com','@bcm.edu','Department of Emergency Medicine, 1504 Taub Loop, Houston, TX 77030',false),
  ('Our Lady of the Lake Regional Medical Center','Dr. Mark Laperouse','Emergency Medicine Director','Dr. Jennifer Mangione','225-765-6565 (Main Hospital Line)','225-765-6565',null,null,'@fmolhs.org','5000 Hennessy Blvd, Baton Rouge, LA 70808',true),
  ('University Hospital (UT Health San Antonio)','Nilam J. Soni, MD, MS','Professor of Medicine & IM POCUS Director',null,'210-743-6030',null,'sonin@uthscsa.edu',null,'@uthscsa.edu','UT Health San Antonio, 7703 Floyd Curl Drive, MC 7982, San Antonio, TX 78229',false),
  ('University of Oklahoma (OU) Health','Azeemuddin Ahmed, MD, MBA','Professor, Department Chair & Clinical Service Chief of EM',null,'405-271-2265 (Department Line)','405-271-2265',null,null,'@ouhsc.edu / @ouhealth.com','Department of Emergency Medicine, P.O. Box 26901, Oklahoma City, OK 73126',true),
  ('Houston Methodist Sugar Land Hospital',null,'Emergency Department Director',null,'281-274-7000 (Main)','281-274-7090 (Emergency Dept)',null,null,'@houstonmethodist.org','16655 Southwest Fwy, Sugar Land, TX 77479',true),
  ('Texas Health Presbyterian Hospital Plano',null,'IM Residency Director / Heart & Vascular Director',null,'972-981-8000 (Main Hospital Line)','972-981-8000',null,null,'@texashealth.org','6200 W Parker Rd, Plano, TX 75093',true),
  ('Lyndon B. Johnson Hospital',null,'Emergency Medicine Director',null,'713-566-5100 (Main)','713-500-7878 (UTHealth Dept)',null,null,'@harrishealth.org / @uth.tmc.edu','5656 Kelley St, Houston, TX 77026',true),
  ('OU Health - Tulsa','Dr. Lori Whelan','Emergency Ultrasound Director & Clinical Associate Professor',null,'918-660-3000 (OU-Tulsa Campus Line)','918-660-3000',null,null,'@ouhsc.edu','OU-Tulsa Schusterman Center, 4502 E 41st St, Tulsa, OK 74135',false),
  ('SAUSHEC / Brooke Army Medical Center',null,'Army Emergency Ultrasound Fellowship Director',null,'210-916-2500 (GME Office)','210-916-4141 (BAMC Main)',null,null,'@health.mil / @mail.mil','Brooke Army Medical Center, GME Dept, 3551 Roger Brooke Dr, Fort Sam Houston, TX 78234',true),
  ('Michael E. DeBakey VA Medical Center',null,'Cardiovascular Surgery Director or Logistics Chief',null,'713-791-1414 (Main)','713-794-7413 (Logistics Office)',null,null,'@va.gov','2002 Holcombe Blvd, Houston, TX 77030',true),
  ('UT Southwestern Medical Center',null,'Cardiology / NSICU Directors',null,'214-648-3111 (Main University Line)','214-648-3111',null,null,'@utsouthwestern.edu','5323 Harry Hines Blvd, Dallas, TX 75390',true)
),
v_norm as (
  select v.*,
    btrim(regexp_replace(regexp_replace(regexp_replace(lower(v.account_name),
      '\([^)]*\)', ' ', 'g'), '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g')) as na
  from v
)
insert into public.contacts
  (account_name, contact_name, title, alt_contact, direct_phone, department_phone,
   email, alt_email, email_domain_standard, facility_address, needs_manual_sourcing,
   lead_id, source)
select
  vn.account_name, vn.contact_name, vn.title, vn.alt_contact, vn.direct_phone, vn.department_phone,
  vn.email, vn.alt_email, vn.email_domain_standard, vn.facility_address, vn.needs_manual_sourcing,
  (select ln.id from lead_norm ln
     where length(ln.nh) > 3
       and (position(ln.nh in vn.na) > 0 or position(vn.na in ln.nh) > 0)
     -- Prefer an exact normalized match, then the closest-length (tightest)
     -- containment, so a short account name like "University Hospital" can't
     -- mis-link to a longer unrelated lead that merely contains the phrase.
     order by (ln.nh = vn.na) desc,
              abs(length(ln.nh) - length(vn.na)) asc,
              length(ln.nh) asc
     limit 1) as lead_id,
  'manual_seed'
from v_norm vn
on conflict (account_name, contact_name) do update set
  title                 = excluded.title,
  alt_contact           = excluded.alt_contact,
  direct_phone          = excluded.direct_phone,
  department_phone      = excluded.department_phone,
  email                 = excluded.email,
  alt_email             = excluded.alt_email,
  email_domain_standard = excluded.email_domain_standard,
  facility_address      = excluded.facility_address,
  needs_manual_sourcing = excluded.needs_manual_sourcing,
  lead_id               = excluded.lead_id,
  source                = excluded.source;
