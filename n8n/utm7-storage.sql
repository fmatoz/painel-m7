BEGIN;
CREATE SCHEMA IF NOT EXISTS utm7;
REVOKE ALL ON SCHEMA utm7 FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS utm7.offers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
 product_id text NOT NULL DEFAULT '', pixel_id text NOT NULL DEFAULT '',
 price numeric(12,2) NOT NULL DEFAULT 0 CHECK(price >= 0),
 cost_per_sale numeric(12,2) NOT NULL DEFAULT 0 CHECK(cost_per_sale >= 0),
 landing_url text NOT NULL DEFAULT '', checkout_url text NOT NULL DEFAULT '',
 tracking_names jsonb NOT NULL DEFAULT '[]', campaign_ids jsonb NOT NULL DEFAULT '[]',
 active boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS utm7.connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
 account_id text NOT NULL UNIQUE CHECK(account_id ~ '^[0-9]+$'),
 access_token text NOT NULL, currency text NOT NULL DEFAULT 'BRL',
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS utm7.reports (
 connection_id uuid REFERENCES utm7.connections(id), since date NOT NULL, until date NOT NULL,
 payload jsonb NOT NULL, synced_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(connection_id,since,until)
);
CREATE TABLE IF NOT EXISTS utm7.audit (
 id uuid PRIMARY KEY, user_id uuid NOT NULL, connection_id uuid NOT NULL,
 adset_id text NOT NULL, previous_budget integer NOT NULL, new_budget integer NOT NULL,
 status text NOT NULL DEFAULT 'prepared', created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
-- Private, short-lived identity bridge. Only n8n writes after live Supabase checks.
-- The metrics database's public.app_users is legacy and is not an auth source.
CREATE TABLE IF NOT EXISTS utm7.admin_identities (
 user_id uuid PRIMARY KEY, active boolean NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS utm7.status_audit (
 id uuid PRIMARY KEY, user_id uuid NOT NULL, connection_id uuid NOT NULL,
 entity_id text NOT NULL, entity_level text NOT NULL,
 desired_status text NOT NULL CHECK(desired_status IN ('ACTIVE','PAUSED')),
 expected_status text NOT NULL, previous_status text,
 status text NOT NULL DEFAULT 'prepared', created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
ALTER TABLE utm7.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE utm7.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE utm7.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE utm7.audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE utm7.admin_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE utm7.status_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA utm7 FROM PUBLIC, anon, authenticated;

INSERT INTO utm7.offers(id,name,product_id,pixel_id,price,landing_url,checkout_url,tracking_names)
VALUES ('7c0dbd4a-dff7-4c73-bccb-a6466aff5401','Reconquiste seu Marido — Plano de 21 Dias',
 '6b065f34f3f790ea294e1363','1795323998419205',14.97,
 'https://desafioreconquiste21dias.vercel.app/','https://pay.wiapy.com/v9l2cgEla5fk',
 '["Reconquiste seu Marido — Plano de 21 Dias","Reconquiste seu Marido – Plano de 21 Dias","Reconquiste seu Marido - Plano de 21 Dias"]')
ON CONFLICT(id) DO NOTHING;
UPDATE utm7.offers SET campaign_ids='["120255050101070580"]'::jsonb
WHERE id='7c0dbd4a-dff7-4c73-bccb-a6466aff5401' AND campaign_ids='[]'::jsonb;

CREATE OR REPLACE FUNCTION utm7.is_admin(uid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,utm7 AS $$
 SELECT EXISTS(SELECT 1 FROM utm7.admin_identities
 WHERE user_id::text=uid AND active=true AND verified_at>now()-interval '5 minutes');
$$;

CREATE OR REPLACE FUNCTION utm7.dispatch(uid text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,utm7 AS $$
DECLARE a text:=p->>'action'; c utm7.connections%ROWTYPE; oid uuid; cid uuid;
 b integer; old_b integer; request_id uuid; result jsonb; offers jsonb; connections jsonb;
 from_date date; to_date date;
BEGIN
 IF NOT utm7.is_admin(uid) THEN
  RETURN jsonb_build_object('ok',false,'status',403,'error','Acesso exclusivo de administradores ativos.');
 END IF;
 IF a='save_offer' THEN
  IF length(trim(coalesce(p->>'name','')))<2 OR length(p->>'name')>200 THEN
   RETURN jsonb_build_object('ok',false,'status',400,'error','Informe o nome da oferta.');
  END IF;
  IF coalesce(p->>'pixel_id','') !~ '^[0-9]*$' THEN
   RETURN jsonb_build_object('ok',false,'status',400,'error','Pixel deve conter somente números.');
  END IF;
  IF coalesce(p->>'landing_url','') !~ '^(https://|$)' OR coalesce(p->>'checkout_url','') !~ '^(https://|$)' THEN
   RETURN jsonb_build_object('ok',false,'status',400,'error','Use links HTTPS.');
  END IF;
  IF jsonb_typeof(p->'tracking_names') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'tracking_names')>30
   OR jsonb_typeof(p->'campaign_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'campaign_ids')>100 THEN
   RETURN jsonb_build_object('ok',false,'status',400,'error','Mapeamento da oferta inválido.');
  END IF;
  oid:=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid());
  INSERT INTO utm7.offers(id,name,product_id,pixel_id,price,cost_per_sale,landing_url,checkout_url,tracking_names,campaign_ids,active)
  VALUES(oid,trim(p->>'name'),left(coalesce(p->>'product_id',''),200),p->>'pixel_id',
   coalesce((p->>'price')::numeric,0),coalesce((p->>'cost_per_sale')::numeric,0),
   left(coalesce(p->>'landing_url',''),2000),left(coalesce(p->>'checkout_url',''),2000),
   p->'tracking_names',p->'campaign_ids',coalesce((p->>'active')::boolean,true))
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,product_id=excluded.product_id,pixel_id=excluded.pixel_id,
   price=excluded.price,cost_per_sale=excluded.cost_per_sale,landing_url=excluded.landing_url,
   checkout_url=excluded.checkout_url,tracking_names=excluded.tracking_names,campaign_ids=excluded.campaign_ids,
   active=excluded.active,updated_at=now();
  RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('id',oid));
 ELSIF a='save_connection' THEN
  IF coalesce(p->>'account_id','') !~ '^[0-9]{5,30}$' OR length(trim(coalesce(p->>'name','')))<2 THEN
   RETURN jsonb_build_object('ok',false,'status',400,'error','Nome e ID da conta de anúncios são obrigatórios.');
  END IF;
  cid:=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid());
  SELECT * INTO c FROM utm7.connections WHERE id=cid;
  IF NOT FOUND AND length(coalesce(p->>'access_token',''))<20 THEN
   RETURN jsonb_build_object('ok',false,'status',400,'error','Informe o token de acesso da Marketing API.');
  END IF;
  INSERT INTO utm7.connections(id,name,account_id,access_token)
  VALUES(cid,left(trim(p->>'name'),150),p->>'account_id',coalesce(nullif(p->>'access_token',''),c.access_token))
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,account_id=excluded.account_id,
   access_token=excluded.access_token,updated_at=now();
  DELETE FROM utm7.reports WHERE connection_id=cid;
  RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('id',cid));
 ELSIF a IN ('sync_meta','prepare_budget','prepare_status') THEN
  cid:=(p->>'connection_id')::uuid;
  SELECT * INTO c FROM utm7.connections WHERE id=cid;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'status',400,'error','Cadastre a conta Meta primeiro.'); END IF;
  IF c.currency<>'BRL' THEN RETURN jsonb_build_object('ok',false,'status',400,'error','Esta versão trabalha com contas em reais (BRL).'); END IF;
  IF a='prepare_budget' THEN
   b:=(p->>'new_budget_minor')::integer; old_b:=(p->>'expected_budget_minor')::integer;
   request_id:=(p->>'request_id')::uuid;
   IF coalesce((p->>'confirmed')::boolean,false) IS NOT TRUE OR b<100 OR b>1000000 OR old_b<=0
    OR coalesce(p->>'adset_id','') !~ '^[0-9]{5,30}$' THEN
    RETURN jsonb_build_object('ok',false,'status',400,'error','Confirme um orçamento diário válido, entre R$ 1 e R$ 10.000.');
   END IF;
   IF EXISTS(SELECT 1 FROM utm7.audit WHERE id=request_id) THEN
    RETURN jsonb_build_object('ok',false,'status',409,'error','Esta solicitação já foi processada. Atualize os dados antes de repetir.');
   END IF;
   INSERT INTO utm7.audit(id,user_id,connection_id,adset_id,previous_budget,new_budget)
   VALUES(request_id,uid::uuid,cid,p->>'adset_id',old_b,b);
  END IF;
  IF a='prepare_status' THEN
   IF coalesce((p->>'confirmed')::boolean,false) IS NOT TRUE
    OR coalesce(p->>'level','') NOT IN ('campaign','adset','ad')
    OR coalesce(p->>'desired_status','') NOT IN ('ACTIVE','PAUSED')
    OR coalesce(p->>'entity_id','') !~ '^[0-9]{5,30}$'
    OR coalesce(p->>'request_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR length(coalesce(p->>'expected_status','')) NOT BETWEEN 2 AND 60 THEN
    RETURN jsonb_build_object('ok',false,'status',400,'error','Confirme uma alteração de veiculação válida.');
   END IF;
   request_id:=(p->>'request_id')::uuid;
   IF EXISTS(SELECT 1 FROM utm7.status_audit WHERE id=request_id) THEN
    RETURN jsonb_build_object('ok',false,'status',409,'error','Esta solicitação já foi processada. Sincronize antes de repetir.');
   END IF;
   INSERT INTO utm7.status_audit(id,user_id,connection_id,entity_id,entity_level,desired_status,expected_status)
   VALUES(request_id,uid::uuid,cid,p->>'entity_id',p->>'level',p->>'desired_status',p->>'expected_status');
  END IF;
  RETURN jsonb_build_object('ok',true,'internal',jsonb_build_object(
   'connection_id',c.id,'account_id',c.account_id,'access_token',c.access_token));
 ELSIF a='dashboard' THEN
  from_date:=(p->>'since')::date; to_date:=(p->>'until')::date;
  IF to_date<from_date OR to_date-from_date>92 THEN
   RETURN jsonb_build_object('ok',false,'status',400,'error','Selecione um período de até 93 dias.');
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.name),'[]') INTO offers FROM utm7.offers o;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'account_id',account_id,
   'currency',currency,'has_token',length(access_token)>0) ORDER BY name),'[]') INTO connections FROM utm7.connections;
  SELECT jsonb_build_object('payload',r.payload,'synced_at',r.synced_at) INTO result
  FROM utm7.reports r WHERE r.connection_id=nullif(p->>'connection_id','')::uuid
   AND r.since=from_date AND r.until=to_date;
  RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('offers',offers,'connections',connections,
   'report',result,'since',from_date,'until',to_date,
   'audit',coalesce((SELECT jsonb_agg(x) FROM (SELECT id,adset_id,previous_budget,new_budget,status,created_at
    FROM utm7.audit ORDER BY created_at DESC LIMIT 20) x),'[]')));
 END IF;
 RETURN jsonb_build_object('ok',false,'status',400,'error','Operação não reconhecida.');
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation OR unique_violation
 OR invalid_datetime_format OR datetime_field_overflow THEN
 RETURN jsonb_build_object('ok',false,'status',400,'error','Dados inválidos ou registro já cadastrado.');
END;
$$;

CREATE OR REPLACE FUNCTION utm7.save_report(uid text,cid uuid,from_date date,to_date date,p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,utm7 AS $$
BEGIN
 IF NOT utm7.is_admin(uid) THEN RETURN jsonb_build_object('ok',false,'status',403,'error','Acesso negado.'); END IF;
 IF p->>'error' IS NOT NULL THEN
  RETURN jsonb_build_object('ok',false,'status',502,'error',left(p->>'error',500));
 END IF;
 IF coalesce(p#>>'{account,currency}','')<>'BRL' THEN
  RETURN jsonb_build_object('ok',false,'status',400,'error','A conta Meta precisa usar BRL.');
 END IF;
 INSERT INTO utm7.reports(connection_id,since,until,payload) VALUES(cid,from_date,to_date,p)
 ON CONFLICT(connection_id,since,until) DO UPDATE SET payload=excluded.payload,synced_at=now();
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('synced_at',now()));
END;
$$;

CREATE OR REPLACE FUNCTION utm7.finish_budget(uid text,rid uuid,success boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,utm7 AS $$
BEGIN
 IF NOT utm7.is_admin(uid) THEN RETURN jsonb_build_object('ok',false,'status',403,'error','Acesso negado.'); END IF;
 UPDATE utm7.audit SET status=CASE WHEN success THEN 'confirmed' ELSE 'failed' END,completed_at=now()
 WHERE id=rid AND user_id::text=uid AND status='prepared';
 RETURN jsonb_build_object('ok',success,'data',jsonb_build_object('request_id',rid));
END;
$$;
CREATE OR REPLACE FUNCTION utm7.authorize_and_dispatch(uid text,verified_admin boolean,p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,utm7 AS $$
BEGIN
 IF coalesce(uid,'') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RETURN jsonb_build_object('ok',false,'status',401,'error','Sua sessão expirou. Entre novamente no M7.');
 END IF;
 IF verified_admin IS NOT TRUE THEN
  UPDATE utm7.admin_identities SET active=false WHERE user_id=uid::uuid;
  RETURN jsonb_build_object('ok',false,'status',403,'error','Acesso exclusivo de administradores ativos.');
 END IF;
 INSERT INTO utm7.admin_identities(user_id,active,verified_at) VALUES(uid::uuid,true,now())
 ON CONFLICT(user_id) DO UPDATE SET active=true,verified_at=now();
 RETURN utm7.dispatch(lower(uid),p);
END;
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA utm7 FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION utm7.finish_status(uid text,rid uuid,success boolean,previous text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,utm7 AS $$
DECLARE cid uuid;
BEGIN
 IF NOT utm7.is_admin(uid) THEN RETURN jsonb_build_object('ok',false,'status',403,'error','Acesso negado.'); END IF;
 UPDATE utm7.status_audit SET status=CASE WHEN success THEN 'confirmed' ELSE 'unconfirmed' END,
  previous_status=left(previous,60),completed_at=now()
 WHERE id=rid AND user_id::text=uid AND status='prepared' RETURNING connection_id INTO cid;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'status',409,'error','Solicitação já finalizada ou indisponível.'); END IF;
 IF success THEN DELETE FROM utm7.reports WHERE connection_id=cid; END IF;
 RETURN jsonb_build_object('ok',success,'data',jsonb_build_object('request_id',rid));
END;
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA utm7 FROM PUBLIC,anon,authenticated;
COMMIT;
