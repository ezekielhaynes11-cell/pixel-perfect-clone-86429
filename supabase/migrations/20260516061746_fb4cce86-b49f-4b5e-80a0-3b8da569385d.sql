
-- Vendor / product taxonomy table
CREATE TABLE public.keyword_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('vendor','product_model','focus_concept','role_title','complaint_signal')),
  value text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, value)
);
ALTER TABLE public.keyword_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "keyword_lists readable by signed-in" ON public.keyword_lists FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage keyword_lists" ON public.keyword_lists FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- Accounts table (hospitals / health systems)
CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  state text,
  account_type text CHECK (account_type IN ('va','non_va','unknown')),
  system text,
  is_va boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accounts readable by signed-in" ON public.accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage accounts" ON public.accounts FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE TRIGGER accounts_set_updated_at BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Scraped pages (manual URL scraper for free hospital / fellowship pages)
CREATE TABLE public.scraped_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  url text NOT NULL,
  title text,
  extracted jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_text text,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.scraped_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scraped_pages readable by signed-in" ON public.scraped_pages FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage scraped_pages" ON public.scraped_pages FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- Extend leads
ALTER TABLE public.leads
  ADD COLUMN vendor_mentions text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN account_type text CHECK (account_type IN ('va','non_va','unknown')),
  ADD COLUMN signal_type text CHECK (signal_type IN ('recall','rfp','funding','expansion','sentiment','m_and_a','incumbency','other')),
  ADD COLUMN account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL;

-- Extend lead_physicians with role hint
ALTER TABLE public.lead_physicians
  ADD COLUMN role_hint text;

-- Seed taxonomy
INSERT INTO public.keyword_lists (kind, value) VALUES
  ('vendor','GE Healthcare'),('vendor','Mindray'),('vendor','SonoSite'),('vendor','Samsung Medison'),
  ('vendor','Canon Medical'),('vendor','Siemens Healthineers'),('vendor','Fujifilm Sonosite'),('vendor','Philips'),
  ('product_model','Venue'),('product_model','Venue Fit'),('product_model','Venue Go'),('product_model','Venue R3'),
  ('product_model','TE7'),('product_model','TE7 Max'),('product_model','TE8'),('product_model','M9'),
  ('product_model','LX'),('product_model','PX'),('product_model','S2'),('product_model','Lumify'),
  ('product_model','Vivid iq'),('product_model','Vivid E95'),('product_model','LOGIQ E10'),
  ('focus_concept','POCUS'),('focus_concept','point-of-care ultrasound'),('focus_concept','non-invasive cardiac output'),
  ('focus_concept','MSK ultrasound'),('focus_concept','interventional radiology'),('focus_concept','IR ultrasound'),
  ('focus_concept','echocardiography'),('focus_concept','cath lab'),('focus_concept','ultrasound fellowship'),
  ('focus_concept','VA hospital ultrasound'),('focus_concept','rural hospital imaging'),
  ('role_title','POCUS director'),('role_title','fellowship director'),('role_title','ultrasound fellowship director'),
  ('role_title','chief of emergency medicine'),('role_title','chief of cardiology'),('role_title','biomed director'),
  ('role_title','imaging director'),('role_title','medical director'),('role_title','department chair'),
  ('complaint_signal','what should we replace'),('complaint_signal','frustrated with'),('complaint_signal','looking to buy'),
  ('complaint_signal','end of life'),('complaint_signal','EOL'),('complaint_signal','breaking down'),
  ('complaint_signal','any recommendations'),('complaint_signal','better alternative')
ON CONFLICT (kind, value) DO NOTHING;
