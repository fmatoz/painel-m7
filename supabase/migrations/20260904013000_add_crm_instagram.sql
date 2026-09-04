ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS instagram_url TEXT NOT NULL DEFAULT ''
  CHECK (char_length(instagram_url) <= 500);
