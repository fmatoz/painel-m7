ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS address_verified BOOLEAN NOT NULL DEFAULT false;

UPDATE public.crm_leads
SET address_verified = address_has_woodshop
WHERE address_has_woodshop = true
  AND address_verified = false;
