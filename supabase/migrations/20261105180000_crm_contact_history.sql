BEGIN;
SET LOCAL lock_timeout = '3s';

ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS follow_up_count smallint NOT NULL DEFAULT 0
  CHECK (follow_up_count BETWEEN 0 AND 3);

CREATE OR REPLACE FUNCTION public.log_crm_contact_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
  IF OLD.last_message_on IS DISTINCT FROM NEW.last_message_on THEN
    INSERT INTO public.crm_activities (lead_id, activity_type, description, metadata, created_by)
    VALUES (NEW.id, 'updated',
      CASE WHEN NEW.last_message_on IS NULL THEN
        'Data da última mensagem removida (anterior: ' || to_char(OLD.last_message_on, 'DD/MM/YYYY') || ').'
      ELSE 'Última mensagem enviada: ' || to_char(NEW.last_message_on, 'DD/MM/YYYY') ||
        CASE WHEN OLD.last_message_on IS NULL THEN '.' ELSE
          ' (anterior: ' || to_char(OLD.last_message_on, 'DD/MM/YYYY') || ').' END END,
      jsonb_build_object('field','last_message_on','from',OLD.last_message_on,'to',NEW.last_message_on), NULL);
  END IF;
  IF OLD.follow_up_count IS DISTINCT FROM NEW.follow_up_count THEN
    INSERT INTO public.crm_activities (lead_id, activity_type, description, metadata, created_by)
    VALUES (NEW.id, 'updated',
      'Follow-ups realizados: ' || NEW.follow_up_count || ' (anterior: ' || OLD.follow_up_count || ').',
      jsonb_build_object('field','follow_up_count','from',OLD.follow_up_count,'to',NEW.follow_up_count), NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_crm_contact_change ON public.crm_leads;
CREATE TRIGGER log_crm_contact_change AFTER UPDATE OF last_message_on, follow_up_count
ON public.crm_leads FOR EACH ROW EXECUTE FUNCTION public.log_crm_contact_change();

CREATE OR REPLACE FUNCTION public.touch_crm_last_message()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.last_message_on IS DISTINCT FROM OLD.last_message_on
     OR NEW.follow_up_count IS DISTINCT FROM OLD.follow_up_count THEN
    NEW.last_touched_at := now();
  END IF;
  RETURN NEW;
END;
$$;
COMMIT;
