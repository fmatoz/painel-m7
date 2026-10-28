ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS last_message_on date;
COMMENT ON COLUMN public.crm_leads.last_message_on IS
  'Date of the latest message sent, manually recorded by the CRM user.';

CREATE OR REPLACE FUNCTION public.touch_crm_last_message()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.last_message_on IS DISTINCT FROM OLD.last_message_on THEN
    NEW.last_touched_at := now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS touch_crm_last_message ON public.crm_leads;
CREATE TRIGGER touch_crm_last_message BEFORE UPDATE ON public.crm_leads
FOR EACH ROW EXECUTE FUNCTION public.touch_crm_last_message();
NOTIFY pgrst, 'reload schema';
