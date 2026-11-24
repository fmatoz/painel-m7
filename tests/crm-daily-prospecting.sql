-- Run after the migration in the same transaction, then roll back all test rows.
SELECT set_config('m7.crm_actor', '{"id":"11111111-1111-4111-8111-111111111111","name":"SDR de teste A"}', true);
INSERT INTO public.crm_leads(id,company_name,stage)
VALUES ('d13ba09e-2078-4f00-b443-9b5ad06326ff','TESTE TRANSACIONAL PROSPECÇÃO','novo');
UPDATE public.crm_leads SET stage='primeiro_contato' WHERE id='d13ba09e-2078-4f00-b443-9b5ad06326ff';
UPDATE public.crm_leads SET stage='respondeu' WHERE id='d13ba09e-2078-4f00-b443-9b5ad06326ff';
SELECT set_config('m7.crm_actor', '{"id":"22222222-2222-4222-8222-222222222222","name":"SDR de teste B"}', true);
UPDATE public.crm_leads SET stage='primeiro_contato' WHERE id='d13ba09e-2078-4f00-b443-9b5ad06326ff';
DO $$ BEGIN
  IF (SELECT count(*) FROM m7_private.crm_first_contacts WHERE lead_id='d13ba09e-2078-4f00-b443-9b5ad06326ff') <> 1
    OR (SELECT actor_id FROM m7_private.crm_first_contacts WHERE lead_id='d13ba09e-2078-4f00-b443-9b5ad06326ff') <> '11111111-1111-4111-8111-111111111111'::uuid THEN
    RAISE EXCEPTION 'Re-entry changed first-contact attribution';
  END IF;
END $$;

-- Use a day outside production history; verify São Paulo midnight (03:00 UTC).
INSERT INTO m7_private.crm_first_contacts(lead_id,contacted_at,actor_id,actor_name) VALUES
 (gen_random_uuid(),'2040-01-15 03:00:00+00','11111111-1111-4111-8111-111111111111','SDR de teste A'),
 (gen_random_uuid(),'2040-01-16 02:59:59+00','22222222-2222-4222-8222-222222222222','SDR de teste B'),
 (gen_random_uuid(),'2040-01-15 12:00:00+00',NULL,''),
 (gen_random_uuid(),'2040-01-15 02:59:59+00','11111111-1111-4111-8111-111111111111','SDR de teste A'),
 (gen_random_uuid(),'2040-01-16 03:00:00+00','11111111-1111-4111-8111-111111111111','SDR de teste A');
DO $$
DECLARE p jsonb := '{"sessionValid":true,"authorized":true,"userId":"11111111-1111-4111-8111-111111111111","reportDate":"2040-01-15","isAdmin":false}'; r jsonb;
BEGIN
  r := m7_private.crm_prospecting_summary(p);
  IF (r#>>'{data,total}')::int <> 1 OR r#>'{data,by_sdr}' <> '[]'::jsonb
    OR (r#>>'{data,unattributed}')::int <> 0 THEN RAISE EXCEPTION 'SDR privacy or date boundary failed'; END IF;
  r := m7_private.crm_prospecting_summary(p || '{"isAdmin":true}');
  IF (r#>>'{data,total}')::int <> 3 OR (r#>>'{data,own_total}')::int <> 1
    OR (r#>>'{data,unattributed}')::int <> 1 OR jsonb_array_length(r#>'{data,by_sdr}') <> 3 THEN
    RAISE EXCEPTION 'Team summary failed'; END IF;
  r := m7_private.crm_prospecting_summary(p || '{"sessionValid":false}');
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'Invalid session accepted'; END IF;
  r := m7_private.crm_prospecting_summary(p || '{"authorized":false}');
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'Unauthorized access accepted'; END IF;
  r := m7_private.crm_prospecting_summary(p || '{"reportDate":"2026-02-31"}');
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'Invalid date accepted'; END IF;
  IF has_table_privilege('authenticated','m7_private.crm_first_contacts','SELECT')
    OR has_function_privilege('authenticated','m7_private.crm_prospecting_summary(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Private reporting exposed'; END IF;
END $$;
