ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS address_has_woodshop BOOLEAN NOT NULL DEFAULT false;

