-- Run inside BEGIN / ROLLBACK only. All sales and identities are synthetic.
DO $test$
DECLARE
  actor jsonb := '{"sessionValid":true,"active":true,"isAdmin":true,"canCrm":true,"userId":"00000000-0000-4000-8000-000000000041","userName":"Admin teste edição"}';
  sdr jsonb := '{"sessionValid":true,"active":true,"isAdmin":false,"canCrm":true,"userId":"00000000-0000-4000-8000-000000000042","userName":"SDR teste edição"}';
  changes jsonb := '{"client_name":"Cliente teste","service":"Site","sale_value":500,"sale_date":"2026-10-13","notes":"original"}';
  original jsonb;
  edited jsonb;
  req jsonb;
  r jsonb;
  bad jsonb;
  sid uuid;
BEGIN
  r := m7_private.sales_api(sdr || jsonb_build_object('action','sale-create','changes',changes));
  IF r->'ok' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Cannot create test sale: %',r; END IF;
  original:=r->'data'; sid:=(original->>'id')::uuid;
  changes := changes || jsonb_build_object('expected_updated_at',original->>'updated_at',
    'client_name','Cliente corrigido','service','Serviço personalizado','sale_value',1000.55,
    'sale_date','2026-10-12','notes','Revisado','commission_rate',99,'status','paid',
    'seller_id',actor->>'userId','created_by',actor->>'userId');
  req:=jsonb_build_object('action','sale-update','saleId',sid,'changes',changes);
  r:=m7_private.edit_sale(sdr || req);
  IF r->'ok' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'SDR edited own pending sale'; END IF;
  FOREACH bad IN ARRAY ARRAY['{"sessionValid":false}'::jsonb,'{"active":false}'::jsonb,'{"canCrm":false}'::jsonb,'{"isAdmin":false}'::jsonb] LOOP
    r:=m7_private.edit_sale(actor || req || bad);
    IF r->'ok' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'Access bypass: %',bad; END IF;
  END LOOP;
  r:=m7_private.edit_sale(actor || req || jsonb_build_object('changes',changes || '{"expected_updated_at":"2000-01-01T00:00:00Z"}'));
  IF r->'ok' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'Stale edit accepted'; END IF;
  r:=m7_private.edit_sale(actor || req || jsonb_build_object('changes',changes-'expected_updated_at'));
  IF r->'ok' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'Missing version accepted'; END IF;
  FOREACH bad IN ARRAY ARRAY['{"sale_value":-1}'::jsonb,'{"sale_value":"NaN"}'::jsonb,'{"sale_value":0}'::jsonb,'{"sale_value":9999999999.999}'::jsonb,'{"sale_date":"invalid"}'::jsonb,'{"sale_date":"infinity"}'::jsonb,'{"client_name":" "}'::jsonb,'{"service":""}'::jsonb] LOOP
    r:=m7_private.edit_sale(actor || req || jsonb_build_object('changes',changes || bad));
    IF r->'ok' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'Invalid data accepted: %',bad; END IF;
  END LOOP;
  r:=m7_private.edit_sale(actor || req);
  IF r->'ok' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Admin edit failed: %',r; END IF;
  edited:=r->'data';
  IF edited->>'client_name'<>'Cliente corrigido' OR edited->>'service'<>'Serviço personalizado'
    OR edited->>'notes'<>'Revisado' OR edited->>'sale_date'<>'2026-10-12'
    OR (edited->>'sale_value')::numeric<>1000.55
    OR edited->'commission_rate' IS DISTINCT FROM original->'commission_rate'
    OR edited->'seller_id' IS DISTINCT FROM original->'seller_id'
    OR edited->'created_by' IS DISTINCT FROM original->'created_by'
    OR edited->'status' IS DISTINCT FROM original->'status'
    OR (edited->>'commission_value')::numeric<>round(1000.55*(original->>'commission_rate')::numeric/100,2) THEN
      RAISE EXCEPTION 'Incorrect update: %',edited;
  END IF;
  r:=m7_private.sales_api(actor || jsonb_build_object('action','sale-status','saleId',sid,'changes','{"status":"paid"}'::jsonb));
  IF r->'ok' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Paid setup failed'; END IF;
  original:=r->'data';
  r:=m7_private.edit_sale(actor || req || jsonb_build_object('changes',changes || jsonb_build_object('expected_updated_at',original->>'updated_at','sale_value',800)));
  IF r->'ok' IS DISTINCT FROM 'true'::jsonb OR r->'data'->>'status'<>'paid'
    OR r->'data'->'reviewed_at' IS DISTINCT FROM original->'reviewed_at'
    OR r->'data'->'commission_rate' IS DISTINCT FROM original->'commission_rate' THEN RAISE EXCEPTION 'Paid sale edit failed: %',r; END IF;
  IF has_function_privilege('authenticated','m7_private.edit_sale(jsonb)','EXECUTE')
    OR has_function_privilege('anon','m7_private.edit_sale(jsonb)','EXECUTE')
    OR has_function_privilege('service_role','m7_private.edit_sale(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Private API exposed'; END IF;
END;
$test$;
