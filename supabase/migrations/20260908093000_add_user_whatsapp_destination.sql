ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS whatsapp_destination TEXT NOT NULL DEFAULT '';

ALTER TABLE public.app_users
  DROP CONSTRAINT IF EXISTS app_users_whatsapp_destination_length;

ALTER TABLE public.app_users
  ADD CONSTRAINT app_users_whatsapp_destination_length
  CHECK (char_length(whatsapp_destination) <= 160);

NOTIFY pgrst, 'reload schema';
