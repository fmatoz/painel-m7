BEGIN;
DO $test$
DECLARE uid text; r jsonb; cid uuid:='3b5a386b-7a50-4251-bdc9-0146452ca001'; token_before text;
BEGIN
 SELECT user_id::text INTO uid FROM public.app_users WHERE email='gestaom7ia@gmail.com' AND active AND is_admin;
 IF uid IS NULL THEN RAISE EXCEPTION 'QA requires a real active admin'; END IF;
 r:=utm7.dispatch('',jsonb_build_object('action','dashboard','since','2026-11-26','until','2026-11-26'));
 IF r->>'ok'<>'false' OR r->>'status'<>'403' THEN RAISE EXCEPTION 'Unauthenticated request accepted'; END IF;
 r:=utm7.dispatch(uid,jsonb_build_object('action','dashboard','since','2026-11-26','until','2026-11-26','connection_id',cid));
 IF r->>'ok'<>'true' OR r#>'{data,connections,0,access_token}' IS NOT NULL THEN RAISE EXCEPTION 'Connection secret leaked'; END IF;
 r:=utm7.dispatch(uid,jsonb_build_object('action','prepare_budget','connection_id',cid,'adset_id','120255050101080580','new_budget_minor',1500,'expected_budget_minor',1000,'confirmed',false,'request_id','00000000-0000-4000-8000-000000000007'));
 IF r->>'ok'<>'false' THEN RAISE EXCEPTION 'Missing budget confirmation accepted'; END IF;
 r:=utm7.dispatch(uid,jsonb_build_object('action','save_offer','name','QA unsafe','pixel_id','not-a-number'));
 IF r->>'ok'<>'false' THEN RAISE EXCEPTION 'Invalid pixel accepted'; END IF;
 r:=utm7.dispatch(uid,jsonb_build_object('action','prepare_budget','connection_id',cid,'adset_id','120255050101080580','new_budget_minor',1500,'expected_budget_minor',1000,'confirmed',true,'request_id','00000000-0000-4000-8000-000000000007'));
 IF r->>'ok'<>'true' THEN RAISE EXCEPTION 'Valid prepare failed'; END IF;
 r:=utm7.dispatch(uid,jsonb_build_object('action','prepare_budget','connection_id',cid,'adset_id','120255050101080580','new_budget_minor',1500,'expected_budget_minor',1000,'confirmed',true,'request_id','00000000-0000-4000-8000-000000000007'));
 IF r->>'status'<>'409' THEN RAISE EXCEPTION 'Duplicate budget request accepted'; END IF;
 SELECT access_token INTO token_before FROM utm7.connections WHERE id=cid;
 r:=utm7.dispatch(uid,jsonb_build_object('action','save_connection','id',cid,'name','QA rolled back','account_id','233896209622152','access_token',''));
 IF r->>'ok'<>'true' OR (SELECT access_token FROM utm7.connections WHERE id=cid)<>token_before THEN RAISE EXCEPTION 'Blank token replaced existing secret'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='utm7' AND grantee IN ('anon','authenticated','PUBLIC')) THEN RAISE EXCEPTION 'Private storage has public grants'; END IF;
END;
$test$;
ROLLBACK;
SELECT 'UTM7 storage and authorization checks passed; all mutations rolled back' AS result;
