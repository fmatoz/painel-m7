-- Sales identities are verified against the panel's Auth project by n8n,
-- just as CRM material authors are. Do not change the panel Auth connection.
-- This migration changes only sales/settings identity handling.
CREATE SCHEMA IF NOT EXISTS m7_private;
REVOKE ALL ON SCHEMA m7_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS m7_private.panel_identities (
  id UUID PRIMARY KEY,
  full_name TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON m7_private.panel_identities FROM PUBLIC, anon, authenticated, service_role;

-- Preserve every existing referenced identity. Replace the local-auth FK with an
-- equally enforced registry FK; no orphaned references and no data deletion.
INSERT INTO m7_private.panel_identities(id,full_name)
SELECT u.id, COALESCE(NULLIF(u.raw_user_meta_data->>'full_name',''),u.email,'SDR')
FROM auth.users u
WHERE u.id IN (SELECT updated_by FROM public.team_settings
              UNION SELECT seller_id FROM public.sdr_sales
              UNION SELECT reviewed_by FROM public.sdr_sales)
ON CONFLICT(id) DO NOTHING;
ALTER TABLE public.team_settings DROP CONSTRAINT IF EXISTS team_settings_updated_by_fkey,
  ADD CONSTRAINT team_settings_updated_by_fkey FOREIGN KEY(updated_by)
    REFERENCES m7_private.panel_identities(id) ON DELETE RESTRICT;
ALTER TABLE public.sdr_sales DROP CONSTRAINT IF EXISTS sdr_sales_seller_id_fkey,
  ADD CONSTRAINT sdr_sales_seller_id_fkey FOREIGN KEY(seller_id)
    REFERENCES m7_private.panel_identities(id) ON DELETE RESTRICT,
  DROP CONSTRAINT IF EXISTS sdr_sales_reviewed_by_fkey,
  ADD CONSTRAINT sdr_sales_reviewed_by_fkey FOREIGN KEY(reviewed_by)
    REFERENCES m7_private.panel_identities(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.prepare_sdr_sale()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  configured_rate NUMERIC(5,2);
  configured_name TEXT;
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
  IF session_user='postgres' THEN
    SELECT full_name INTO configured_name FROM m7_private.panel_identities WHERE id=auth.uid();
  END IF;
  NEW.seller_id := auth.uid();
  NEW.seller_name := left(COALESCE(configured_name,'SDR'),160);
  NEW.commission_rate := configured_rate;
  NEW.status := 'pending';
  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;
  NEW.created_at := COALESCE(NEW.created_at,now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Not a public RPC. Only the privileged n8n database connection may call it.
-- Identity and permissions below MUST come from verified Auth/app_users responses,
-- never from the browser body. The n8n normalizer/authorizer enforces this boundary.
CREATE OR REPLACE FUNCTION m7_private.sales_api(p JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  action TEXT := COALESCE(p->>'action','');
  actor UUID;
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
  IF action NOT IN ('settings-get','settings-update','sales-list','sale-create','sale-status','sale-delete') THEN
    RETURN jsonb_build_object('ok',false,'error','Ação inválida.');
  END IF;
  IF (action='settings-get' AND NOT (can_inicio OR can_crm))
    OR (action='settings-update' AND NOT (admin AND can_inicio))
    OR (action IN ('sales-list','sale-create','sale-status','sale-delete') AND NOT can_crm)
    OR (action='sale-status' AND NOT admin) THEN
    RETURN jsonb_build_object('ok',false,'error','Você não tem permissão para esta operação.');
  END IF;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor)::text,true);
  IF action IN ('settings-update','sale-create','sale-status') THEN
    INSERT INTO m7_private.panel_identities(id,full_name,verified_at)
      VALUES(actor,left(COALESCE(NULLIF(btrim(p->>'userName'),''),'SDR'),160),now())
    ON CONFLICT(id) DO UPDATE SET full_name=EXCLUDED.full_name,verified_at=EXCLUDED.verified_at;
  END IF;

  IF action='settings-get' THEN
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
    INSERT INTO public.sdr_sales(client_name,service,sale_value,sale_date,notes)
      VALUES(client,service_name,round(amount,2),target_date,memo)
    RETURNING to_jsonb(sdr_sales) INTO result;
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
$$;
REVOKE ALL ON FUNCTION m7_private.sales_api(JSONB) FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA m7_private TO postgres;
GRANT EXECUTE ON FUNCTION m7_private.sales_api(JSONB) TO postgres;

