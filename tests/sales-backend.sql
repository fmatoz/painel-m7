-- Execute inside BEGIN/ROLLBACK after applying the migration in the same transaction.
DO $test$
DECLARE
  admin JSONB := '{"sessionValid":true,"active":true,"isAdmin":true,"canInicio":true,"canCrm":true,"userId":"00000000-0000-4000-8000-000000000001","userName":"Teste administrador"}';
  sdr JSONB := '{"sessionValid":true,"active":true,"isAdmin":false,"canInicio":true,"canCrm":true,"userId":"00000000-0000-4000-8000-000000000002","userName":"Teste SDR"}';
  other_sdr JSONB := '{"sessionValid":true,"active":true,"isAdmin":false,"canInicio":true,"canCrm":true,"userId":"00000000-0000-4000-8000-000000000003","userName":"Outro SDR"}';
  r JSONB;
  first_sale UUID;
  second_sale UUID;
BEGIN
  IF has_schema_privilege('authenticated','m7_private','USAGE')
    OR has_function_privilege('anon','m7_private.sales_api(jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','m7_private.sales_api(jsonb)','EXECUTE')
    OR has_function_privilege('service_role','m7_private.sales_api(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL private API permissions';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid='m7_private.panel_identities'::regclass
      AND conrelid IN ('public.team_settings'::regclass,'public.sdr_sales'::regclass)) <> 3 THEN
    RAISE EXCEPTION 'FAIL preserved foreign keys';
  END IF;
  r:=m7_private.sales_api('{"action":"sales-list","sessionValid":false}');
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL invalid session'; END IF;
  r:=m7_private.sales_api(sdr || '{"action":"settings-update","changes":{"commission_rate":20}}');
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL SDR settings'; END IF;
  r:=m7_private.sales_api(admin || '{"action":"settings-update","changes":{"commission_rate":20,"announcement_title":"Teste rollback","announcement_message":"Não publicado"}}');
  IF NOT (r->>'ok')::boolean OR (r->'data'->>'commission_rate')::numeric<>20 THEN RAISE EXCEPTION 'FAIL rate 20: %',r; END IF;
  r:=m7_private.sales_api(sdr || '{"action":"sale-create","changes":{"client_name":"Teste rollback","service":"Site","sale_value":600,"sale_date":"2026-09-22","seller_id":"00000000-0000-4000-8000-000000000001","commission_rate":99,"status":"paid"}}');
  IF NOT (r->>'ok')::boolean OR (r->'data'->>'commission_value')::numeric<>120
    OR r->'data'->>'seller_id'<>sdr->>'userId' OR r->'data'->>'seller_name'<>'Teste SDR'
    OR r->'data'->>'status'<>'pending' THEN RAISE EXCEPTION 'FAIL sale creation: %',r; END IF;
  first_sale:=(r->'data'->>'id')::uuid;
  r:=m7_private.sales_api(admin || '{"action":"settings-update","changes":{"commission_rate":15}}');
  r:=m7_private.sales_api(sdr || '{"action":"sale-create","changes":{"client_name":"Teste rollback 2","service":"Automação","sale_value":1000,"sale_date":"2026-09-22"}}');
  IF NOT (r->>'ok')::boolean OR (r->'data'->>'commission_value')::numeric<>150 THEN RAISE EXCEPTION 'FAIL rate 15: %',r; END IF;
  second_sale:=(r->'data'->>'id')::uuid;
  IF (SELECT commission_value FROM public.sdr_sales WHERE id=first_sale)<>120 THEN RAISE EXCEPTION 'FAIL old commission changed'; END IF;
  r:=m7_private.sales_api(other_sdr || '{"action":"sales-list"}');
  IF jsonb_array_length(r->'data')<>0 THEN RAISE EXCEPTION 'FAIL other SDR can see sales'; END IF;
  r:=m7_private.sales_api(sdr || '{"action":"sales-list"}');
  IF jsonb_array_length(r->'data')<>2 THEN RAISE EXCEPTION 'FAIL own list'; END IF;
  r:=m7_private.sales_api(sdr || jsonb_build_object('action','sale-status','saleId',first_sale,'changes',jsonb_build_object('status','paid')));
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL SDR approved sale'; END IF;
  r:=m7_private.sales_api(other_sdr || jsonb_build_object('action','sale-delete','saleId',first_sale));
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL other SDR deleted sale'; END IF;
  r:=m7_private.sales_api(admin || jsonb_build_object('action','sale-status','saleId',first_sale,'changes',jsonb_build_object('status','approved')));
  IF NOT (r->>'ok')::boolean OR r->'data'->>'reviewed_by'<>admin->>'userId' THEN RAISE EXCEPTION 'FAIL admin approval'; END IF;
  r:=m7_private.sales_api(sdr || jsonb_build_object('action','sale-delete','saleId',first_sale));
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL SDR deleted approved sale'; END IF;
  r:=m7_private.sales_api(sdr || jsonb_build_object('action','sale-delete','saleId',second_sale));
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL own pending delete'; END IF;
  r:=m7_private.sales_api(admin || '{"action":"settings-update","changes":{"commission_rate":101}}');
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL invalid rate'; END IF;
  r:=m7_private.sales_api(sdr || '{"action":"sale-create","changes":{"client_name":"bad","service":"Site","sale_value":-10,"sale_date":"2026-09-22"}}');
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL invalid sale'; END IF;
  r:=m7_private.sales_api(sdr || '{"action":"sales-list","active":false}');
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL inactive'; END IF;
  r:=m7_private.sales_api(sdr || '{"action":"sales-list","canCrm":false}');
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL missing CRM permission'; END IF;
  r:=m7_private.sales_api(sdr || '{"action":"settings-get","canCrm":false}');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL Inicio-only settings'; END IF;
END;
$test$;
