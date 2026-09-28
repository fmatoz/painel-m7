DO $test$
DECLARE
 a JSONB := '{"sessionValid":true,"active":true,"isAdmin":true,"canInicio":true,"canCrm":true,"userId":"00000000-0000-4000-8000-000000000011","userName":"Admin auditoria"}';
 b JSONB := '{"sessionValid":true,"active":true,"isAdmin":false,"canInicio":true,"canCrm":true,"userId":"00000000-0000-4000-8000-000000000012","userName":"Vendedora teste"}';
 c JSONB := '{"sessionValid":true,"active":true,"isAdmin":false,"canInicio":true,"canCrm":true,"userId":"00000000-0000-4000-8000-000000000013","userName":"Outro SDR"}';
 sale JSONB := '{"client_name":"Teste transacional delegado","service":"Site","sale_value":1000,"sale_date":"2026-09-28","seller_id":"00000000-0000-4000-8000-000000000012","seller_name":"Nome forjado","created_by":"00000000-0000-4000-8000-000000000013","commission_rate":99,"status":"paid"}';
 seller JSONB := '{"id":"00000000-0000-4000-8000-000000000012","name":"Vendedora teste","active":true,"canCrm":true}';
 r JSONB;
 sid UUID;
 rate NUMERIC;
BEGIN
 SELECT commission_rate INTO rate FROM public.team_settings WHERE id='global';
 r:=m7_private.sales_api(a || jsonb_build_object('action','sale-create','changes',sale));
 IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL unverified seller accepted'; END IF;
 r:=m7_private.sales_api(a || jsonb_build_object('action','sale-create','changes',sale,'verifiedSeller',seller || '{"active":false}'));
 IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL inactive seller'; END IF;
 r:=m7_private.sales_api(a || jsonb_build_object('action','sale-create','changes',sale,'verifiedSeller',seller || '{"canCrm":false}'));
 IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL seller without access'; END IF;
 r:=m7_private.sales_api(c || jsonb_build_object('action','sale-create','changes',sale,'verifiedSeller',seller));
 IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL SDR delegates'; END IF;
 r:=m7_private.sales_api(a || jsonb_build_object('action','sale-create','changes',sale,'verifiedSeller',seller));
 IF NOT COALESCE((r->>'ok')::boolean,false) THEN RAISE EXCEPTION 'FAIL delegated create: %',r; END IF;
 sid:=(r->'data'->>'id')::uuid;
 IF r->'data'->>'seller_id'<>b->>'userId' OR r->'data'->>'seller_name'<>'Vendedora teste'
 OR r->'data'->>'created_by'<>a->>'userId' OR r->'data'->>'created_by_name'<>'Admin auditoria'
 OR (r->'data'->>'commission_rate')::numeric<>rate OR (r->'data'->>'commission_value')::numeric<>round(1000*rate/100,2)
 OR r->'data'->>'status'<>'pending' THEN RAISE EXCEPTION 'FAIL attribution or commission: %',r; END IF;
 r:=m7_private.sales_api(b || '{"action":"sales-list"}');
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'data') x WHERE x->>'id'=sid::text) THEN RAISE EXCEPTION 'FAIL seller visibility'; END IF;
 r:=m7_private.sales_api(c || '{"action":"sales-list"}');
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(r->'data') x WHERE x->>'id'=sid::text) THEN RAISE EXCEPTION 'FAIL other visibility'; END IF;
 r:=m7_private.sales_api(a || '{"action":"sales-list"}');
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'data') x WHERE x->>'id'=sid::text) THEN RAISE EXCEPTION 'FAIL admin visibility'; END IF;
 r:=m7_private.sales_api(a || jsonb_build_object('action','sale-status','saleId',sid,'changes','{"status":"approved"}'::jsonb));
 IF NOT (r->>'ok')::boolean OR r->'data'->>'created_by'<>a->>'userId' OR r->'data'->>'reviewed_by'<>a->>'userId' THEN RAISE EXCEPTION 'FAIL audit on approval'; END IF;
 r:=m7_private.sales_api(a || jsonb_build_object('action','sale-create','changes',sale-'seller_id'));
 IF NOT (r->>'ok')::boolean OR r->'data'->>'seller_id'<>a->>'userId' OR r->'data'->>'created_by'<>a->>'userId' THEN RAISE EXCEPTION 'FAIL self sale after delegation'; END IF;
 r:=m7_private.sales_api(c || '{"action":"sellers-list","eligibleSellers":[{"id":"fake","name":"fake"}]}');
 IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL SDR seller list'; END IF;
 r:=m7_private.sales_api(a || jsonb_build_object('action','sellers-list','eligibleSellers',jsonb_build_array(jsonb_build_object('id',b->>'userId','name','Vendedora teste'))));
 IF NOT (r->>'ok')::boolean OR jsonb_array_length(r->'data')<>1 THEN RAISE EXCEPTION 'FAIL admin seller list'; END IF;
 IF has_function_privilege('authenticated','m7_private.sales_api(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'FAIL private permissions'; END IF;
END;
$test$;
