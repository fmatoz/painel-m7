-- Run after the migration. All test data is rolled back.
BEGIN;
DO $$
DECLARE lead_id_test uuid; activity_count integer;
BEGIN
  INSERT INTO public.crm_leads(company_name) VALUES ('__contact_history_test__') RETURNING id INTO lead_id_test;
  UPDATE public.crm_leads SET last_message_on='2026-11-05', follow_up_count=1 WHERE id=lead_id_test;
  SELECT count(*) INTO activity_count FROM public.crm_activities
    WHERE lead_id=lead_id_test AND metadata->>'field' IN ('last_message_on','follow_up_count');
  IF activity_count <> 2 THEN RAISE EXCEPTION 'Expected two contact history records'; END IF;
  UPDATE public.crm_leads SET last_message_on='2026-11-05', follow_up_count=1 WHERE id=lead_id_test;
  SELECT count(*) INTO activity_count FROM public.crm_activities
    WHERE lead_id=lead_id_test AND metadata->>'field' IN ('last_message_on','follow_up_count');
  IF activity_count <> 2 THEN RAISE EXCEPTION 'Unchanged save duplicated history'; END IF;
  UPDATE public.crm_leads SET last_message_on='2026-11-07', follow_up_count=2 WHERE id=lead_id_test;
  IF NOT EXISTS (SELECT 1 FROM public.crm_activities WHERE lead_id=lead_id_test
    AND metadata @> '{"field":"last_message_on","from":"2026-11-05","to":"2026-11-07"}')
  THEN RAISE EXCEPTION 'Previous date lost'; END IF;
  UPDATE public.crm_leads SET last_message_on=NULL, follow_up_count=0 WHERE id=lead_id_test;
  SELECT count(*) INTO activity_count FROM public.crm_activities
    WHERE lead_id=lead_id_test AND metadata->>'field' IN ('last_message_on','follow_up_count');
  IF activity_count <> 6 THEN RAISE EXCEPTION 'Clear or second update not logged'; END IF;
  BEGIN
    UPDATE public.crm_leads SET follow_up_count=4 WHERE id=lead_id_test;
    RAISE EXCEPTION 'Invalid count accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;
ROLLBACK;
