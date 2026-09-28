-- Additive change: old sales stay unchanged; actor and seller remain separate.
ALTER TABLE public.sdr_sales
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES m7_private.panel_identities(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT;

CREATE OR REPLACE FUNCTION public.prepare_sdr_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  configured_rate NUMERIC(5,2);
  configured_name TEXT;
  selected_seller UUID := auth.uid();
  creator_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;
  SELECT commission_rate INTO configured_rate FROM public.team_settings WHERE id='global';
  IF configured_rate IS NULL THEN
    RAISE EXCEPTION 'Comissão vigente indisponível. Tente novamente.';
  END IF;
  SELECT NULLIF(btrim(full_name),'') INTO configured_name
    FROM public.app_users WHERE user_id=auth.uid() AND active;
  creator_name := configured_name;
  IF session_user='postgres' THEN
    selected_seller := COALESCE(NULLIF(current_setting('m7.sales.seller_id',true),'')::uuid,auth.uid());
    SELECT full_name INTO configured_name FROM m7_private.panel_identities WHERE id=selected_seller;
    SELECT full_name INTO creator_name FROM m7_private.panel_identities WHERE id=auth.uid();
  END IF;
  NEW.created_by := auth.uid();
  NEW.created_by_name := left(COALESCE(creator_name,'SDR'),160);
  NEW.seller_id := selected_seller;
  NEW.seller_name := left(COALESCE(configured_name,'SDR'),160);
  NEW.commission_rate := configured_rate;
  NEW.status := 'pending';
  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;
  NEW.created_at := COALESCE(NEW.created_at,now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.touch_sdr_sale()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.created_by := OLD.created_by;
  NEW.created_by_name := OLD.created_by_name;
  NEW.updated_at := now();
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.reviewed_by := auth.uid();
    NEW.reviewed_at := now();
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION m7_private.sales_api(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  action TEXT := COALESCE(p->>'action','');
  actor UUID;
  seller UUID;
  seller_name TEXT;
  sale_id UUID;
  admin BOOLEAN := COALESCE((p->>'isAdmin')::boolean,false);
  can_crm BOOLEAN := COALESCE((p->>'canCrm')::boolean,false);
  can_inicio BOOLEAN := COALESCE((p->>'canInicio')::boolean,false);
  changes JSONB := COALESCE(p->'changes','{}'::jsonb);
  result JSONB;
  amount NUMERIC;
  rate NUMERIC;
  target_date DATE;
  client TEXT;
  service_name TEXT;
  memo TEXT;
  title TEXT;
  message TEXT;
  target_status TEXT;
BEGIN
  IF session_user <> 'postgres' THEN
    RAISE EXCEPTION 'Acesso exclusivo do backend';
  END IF;
  IF NOT COALESCE((p->>'sessionValid')::boolean,false) THEN
    RETURN jsonb_build_object('ok',false,'error','Sessão inválida ou expirada.');
  END IF;
  IF NOT COALESCE((p->>'active')::boolean,false) THEN
    RETURN jsonb_build_object('ok',false,'error','Usuário sem acesso ativo.');
  END IF;
  actor := NULLIF(p->>'userId','')::uuid;
  IF actor IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error','Sessão inválida ou expirada.');
  END IF;
  IF action NOT IN ('settings-get','settings-update','sales-list','sale-create','sale-status','sale-delete','sellers-list') THEN
    RETURN jsonb_build_object('ok',false,'error','Ação inválida.');
  END IF;
  IF (action='settings-get' AND NOT (can_inicio OR can_crm))
    OR (action='settings-update' AND NOT (admin AND can_inicio))
    OR (action IN ('sales-list','sale-create','sale-status','sale-delete') AND NOT can_crm)
    OR (action IN ('sale-status','sellers-list') AND NOT admin)
    OR (action='sellers-list' AND NOT can_crm) THEN
    RETURN jsonb_build_object('ok',false,'error','Você não tem permissão para esta operação.');
  END IF;
  PERFORM set_config('m7.sales.seller_id','',true);
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor)::text,true);
  IF action IN ('settings-update','sale-create','sale-status') THEN
    INSERT INTO m7_private.panel_identities(id,full_name,verified_at)
      VALUES(actor,left(COALESCE(NULLIF(btrim(p->>'userName'),''),'SDR'),160),now())
    ON CONFLICT(id) DO UPDATE SET full_name=EXCLUDED.full_name,verified_at=EXCLUDED.verified_at;
  END IF;

  IF action='sellers-list' THEN
    RETURN jsonb_build_object('ok',true,'data',COALESCE(p->'eligibleSellers','[]'::jsonb));
  ELSIF action='settings-get' THEN
    SELECT to_jsonb(s) INTO result FROM public.team_settings s WHERE id='global';
    IF result IS NULL THEN
      RETURN jsonb_build_object('ok',false,'error','Configuração de comissão não encontrada.');
    END IF;
  ELSIF action='settings-update' THEN
    rate := NULLIF(changes->>'commission_rate','')::numeric;
    title := btrim(COALESCE(changes->>'announcement_title',''));
    message := btrim(COALESCE(changes->>'announcement_message',''));
    IF rate IS NULL OR rate::text IN ('NaN','Infinity','-Infinity') OR rate<0 OR rate>100
      OR char_length(title)>160 OR char_length(message)>2000 THEN
      RETURN jsonb_build_object('ok',false,'error','Revise o comunicado e informe uma comissão entre 0% e 100%.');
    END IF;
    INSERT INTO public.team_settings(id,announcement_title,announcement_message,commission_rate,updated_by,updated_at)
      VALUES ('global',title,message,round(rate,2),actor,now())
    ON CONFLICT(id) DO UPDATE SET
      announcement_title=EXCLUDED.announcement_title,
      announcement_message=EXCLUDED.announcement_message,
      commission_rate=EXCLUDED.commission_rate,
      updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at
    RETURNING to_jsonb(team_settings) INTO result;
  ELSIF action='sales-list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.sale_date DESC,s.created_at DESC,s.id),'[]'::jsonb)
      INTO result FROM public.sdr_sales s WHERE admin OR s.seller_id=actor;
  ELSIF action='sale-create' THEN
    client := btrim(COALESCE(changes->>'client_name',''));
    service_name := btrim(COALESCE(changes->>'service',''));
    memo := btrim(COALESCE(changes->>'notes',''));
    amount := NULLIF(changes->>'sale_value','')::numeric;
    target_date := NULLIF(changes->>'sale_date','')::date;
    IF char_length(client) NOT BETWEEN 1 AND 200 OR char_length(service_name) NOT BETWEEN 1 AND 120
      OR char_length(memo)>2000 OR amount IS NULL OR amount::text IN ('NaN','Infinity','-Infinity')
      OR round(amount,2)<=0 OR amount>=10000000000 OR target_date IS NULL
      OR target_date<'1900-01-01'::date OR target_date>'9999-12-31'::date THEN
      RETURN jsonb_build_object('ok',false,'error','Preencha cliente, serviço, valor e data corretamente.');
    END IF;
    seller := actor;
    IF NULLIF(changes->>'seller_id','') IS NOT NULL AND (changes->>'seller_id')::uuid <> actor THEN
      IF NOT admin THEN
        RETURN jsonb_build_object('ok',false,'error','Somente administradores podem registrar vendas para outra pessoa.');
      END IF;
      seller := (changes->>'seller_id')::uuid;
      IF NOT COALESCE((p->'verifiedSeller'->>'active')::boolean,false)
        OR NOT COALESCE((p->'verifiedSeller'->>'canCrm')::boolean,false)
        OR (p->'verifiedSeller'->>'id') IS DISTINCT FROM seller::text THEN
        RETURN jsonb_build_object('ok',false,'error','Vendedor indisponível ou sem acesso. Atualize a lista.');
      END IF;
      seller_name := left(NULLIF(btrim(p->'verifiedSeller'->>'name'),''),160);
      IF seller_name IS NULL THEN
        RETURN jsonb_build_object('ok',false,'error','Nome do vendedor indisponível.');
      END IF;
      INSERT INTO m7_private.panel_identities(id,full_name,verified_at)
        VALUES(seller,seller_name,now())
      ON CONFLICT(id) DO UPDATE SET full_name=EXCLUDED.full_name,verified_at=EXCLUDED.verified_at;
    END IF;
    PERFORM set_config('m7.sales.seller_id',seller::text,true);
    INSERT INTO public.sdr_sales(client_name,service,sale_value,sale_date,notes)
      VALUES(client,service_name,round(amount,2),target_date,memo)
    RETURNING to_jsonb(sdr_sales) INTO result;
    PERFORM set_config('m7.sales.seller_id','',true);
  ELSIF action='sale-status' THEN
    sale_id := NULLIF(p->>'saleId','')::uuid;
    target_status := changes->>'status';
    IF target_status IS NULL OR target_status NOT IN ('pending','approved','rejected','paid') THEN
      RETURN jsonb_build_object('ok',false,'error','Situação de venda inválida.');
    END IF;
    UPDATE public.sdr_sales s SET status=target_status WHERE s.id=sale_id
      RETURNING to_jsonb(s) INTO result;
    IF result IS NULL THEN
      RETURN jsonb_build_object('ok',false,'error','Venda não encontrada.');
    END IF;
  ELSIF action='sale-delete' THEN
    sale_id := NULLIF(p->>'saleId','')::uuid;
    DELETE FROM public.sdr_sales s WHERE s.id=sale_id AND (admin OR (s.seller_id=actor AND s.status='pending'))
      RETURNING jsonb_build_object('id',s.id) INTO result;
    IF result IS NULL THEN
      RETURN jsonb_build_object('ok',false,'error','Venda não encontrada ou sem permissão para excluir.');
    END IF;
  END IF;
  RETURN jsonb_build_object('ok',true,'data',result);
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow OR invalid_datetime_format
    THEN RETURN jsonb_build_object('ok',false,'error','Dados inválidos. Confira os campos informados.');
END;
$function$
;
REVOKE ALL ON FUNCTION m7_private.sales_api(JSONB) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION m7_private.sales_api(JSONB) TO postgres;

