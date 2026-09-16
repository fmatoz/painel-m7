ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS site_quality TEXT
    CHECK (site_quality IN ('none', 'bad', 'good')),
  ADD COLUMN IF NOT EXISTS paid_traffic_status TEXT
    CHECK (paid_traffic_status IN ('yes', 'no'));

NOTIFY pgrst, 'reload schema';
