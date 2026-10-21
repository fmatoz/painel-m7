-- Execute with the migration inside BEGIN / ROLLBACK. No real lead is changed.
DO $test$
DECLARE
  sid uuid;
  sdr jsonb := '{"sessionValid":true,"authorized":true,"isAdmin":false,"userId":"00000000-0000-4000-8000-000000000071","userName":"SDR teste","userEmail":"sdr@example.invalid"}';
  admin jsonb := '{"sessionValid":true,"authorized":true,"isAdmin":true,"userId":"00000000-0000-4000-8000-000000000072","userName":"Admin teste","userEmail":"admin@example.invalid"}';
  outsider jsonb := '{"sessionValid":true,"authorized":true,"isAdmin":false,"userId":"00000000-0000-4000-8000-000000000073","userName":"Outro teste"}';
  req jsonb;
  r jsonb;
  bad jsonb;
  activity_count integer;
BEGIN
  UPDATE m7_private.crm_share_recipient SET user_id=(admin->>'userId')::uuid,
    name=admin->>'userName',email=admin->>'userEmail' WHERE singleton;
  INSERT INTO public.crm_leads(company_name,notes,stage) VALUES ('Teste transacional corresponsáveis','Preservar','proposta') RETURNING id INTO sid;
  req:=jsonb_build_object('leadId',sid,'assignmentMode','claim');
  r:=m7_private.assign_crm_lead(sdr || req);
  IF r->'ok' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'claim failed: %',r; END IF;
  r:=m7_private.assign_crm_lead(admin || req);
  IF r->'ok' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'second claim overwrote owner'; END IF;
  req:=req || '{"assignmentMode":"join"}';
  FOREACH bad IN ARRAY ARRAY[admin || '{"sessionValid":false}',admin || '{"authorized":false}',outsider] LOOP
    r:=m7_private.assign_crm_lead(bad || req);
    IF r->'ok' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'unauthorized join'; END IF;
  END LOOP;
  r:=m7_private.assign_crm_lead(admin || req);
  IF r->'ok' IS DISTINCT FROM 'true'::jsonb OR r->'data'->>'assigned_to' <> sdr->>'userId'
     OR jsonb_array_length(r->'data'->'co_assignees') <> 1
     OR r->'data'->>'notes' <> 'Preservar' OR r->'data'->>'stage' <> 'proposta' THEN
    RAISE EXCEPTION 'join did not preserve lead: %',r;
  END IF;
  SELECT count(*) INTO activity_count FROM public.crm_activities WHERE lead_id=sid;
  r:=m7_private.assign_crm_lead(admin || req);
  IF jsonb_array_length(r->'data'->'co_assignees') <> 1 OR
     (SELECT count(*) FROM public.crm_activities WHERE lead_id=sid) <> activity_count THEN
    RAISE EXCEPTION 'duplicate join was not idempotent';
  END IF;
  req:=req || '{"assignmentMode":"release"}';
  r:=m7_private.assign_crm_lead(outsider || req);
  IF r->'ok' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'outsider removed participants'; END IF;
  r:=m7_private.assign_crm_lead(admin || req);
  IF r->'data'->>'assigned_to' <> sdr->>'userId' OR jsonb_array_length(r->'data'->'co_assignees') <> 0 THEN
    RAISE EXCEPTION 'leaving collaborator removed original owner';
  END IF;
  r:=m7_private.assign_crm_lead(outsider || req || '{"assignmentMode":"share"}');
  IF r->'ok' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'outsider shared another lead'; END IF;
  r:=m7_private.assign_crm_lead(sdr || req || '{"assignmentMode":"share","targetUserId":"00000000-0000-4000-8000-000000000073"}');
  IF r->'ok' IS DISTINCT FROM 'true'::jsonb OR r->'data'->>'assigned_to' <> sdr->>'userId'
    OR r->'data'->'co_assignees'->0->>'id' <> admin->>'userId' THEN
    RAISE EXCEPTION 'SDR share lost owner or trusted recipient';
  END IF;
  SELECT count(*) INTO activity_count FROM public.crm_activities WHERE lead_id=sid;
  r:=m7_private.assign_crm_lead(sdr || req || '{"assignmentMode":"share"}');
  IF jsonb_array_length(r->'data'->'co_assignees') <> 1 OR
    (SELECT count(*) FROM public.crm_activities WHERE lead_id=sid) <> activity_count THEN
    RAISE EXCEPTION 'duplicate sharing created extra entries';
  END IF;
  r:=m7_private.assign_crm_lead(admin || req || '{"assignmentMode":"takeover"}');
  IF r->'data'->>'assigned_to' <> sdr->>'userId' OR jsonb_array_length(r->'data'->'co_assignees') <> 1 THEN
    RAISE EXCEPTION 'old client takeover removed original owner';
  END IF;
  r:=m7_private.assign_crm_lead(sdr || req);
  IF r->'data'->>'assigned_to' <> admin->>'userId' OR jsonb_array_length(r->'data'->'co_assignees') <> 0 THEN
    RAISE EXCEPTION 'primary leaving did not retain collaborator';
  END IF;
  r:=m7_private.assign_crm_lead(admin || req);
  IF r->'data'->>'assigned_to' IS NOT NULL THEN RAISE EXCEPTION 'last participant could not leave'; END IF;
  r:=m7_private.assign_crm_lead(admin || req || '{"assignmentMode":"join"}');
  IF r->'ok' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'stale join claimed free lead'; END IF;
  IF has_function_privilege('anon','m7_private.assign_crm_lead(jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','m7_private.assign_crm_lead(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'trusted function publicly callable';
  END IF;
END;
$test$;
SELECT 'shared_assignment_tests_passed' AS result;
