-- Separate backend-only entry point: existing sales actions and triggers are unchanged.
CREATE OR REPLACE FUNCTION m7_private.edit_sale(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  actor uuid;
  sale_id uuid;
  previous public.sdr_sales%ROWTYPE;
  changes jsonb := COALESCE(p->'changes','{}'::jsonb);
  amount numeric;
  target_date date;
  expected timestamptz;
  client text := btrim(COALESCE(changes->>'client_name',''));
  service_name text := btrim(COALESCE(changes->>'service',''));
  memo text := btrim(COALESCE(changes->>'notes',''));
  result jsonb;
BEGIN
  IF session_user <> 'postgres' THEN RAISE EXCEPTION 'Acesso exclusivo do backend'; END IF;
  IF p->>'action' IS DISTINCT FROM 'sale-update'
    OR p->'sessionValid' IS DISTINCT FROM 'true'::jsonb
    OR p->'active' IS DISTINCT FROM 'true'::jsonb
    OR p->'isAdmin' IS DISTINCT FROM 'true'::jsonb
    OR p->'canCrm' IS DISTINCT FROM 'true'::jsonb THEN
    RETURN jsonb_build_object('ok',false,'error','Somente administradores com acesso podem editar vendas.');
  END IF;
  actor := NULLIF(p->>'userId','')::uuid;
  sale_id := NULLIF(p->>'saleId','')::uuid;
  IF actor IS NULL OR sale_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error','Sessão ou venda inválida.');
  END IF;
  amount := NULLIF(changes->>'sale_value','')::numeric;
  target_date := NULLIF(changes->>'sale_date','')::date;
  expected := NULLIF(changes->>'expected_updated_at','')::timestamptz;
  IF char_length(client) NOT BETWEEN 1 AND 200 OR char_length(service_name) NOT BETWEEN 1 AND 120
    OR char_length(memo)>2000 OR amount IS NULL OR amount::text IN ('NaN','Infinity','-Infinity')
    OR round(amount,2)<=0 OR round(amount,2)>=10000000000 OR target_date IS NULL
    OR target_date<'1900-01-01'::date OR target_date>'9999-12-31'::date THEN
    RETURN jsonb_build_object('ok',false,'error','Preencha cliente, serviço, valor e data corretamente.');
  END IF;
  SELECT * INTO previous FROM public.sdr_sales WHERE id=sale_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','Venda não encontrada. Atualize a lista.'); END IF;
  IF expected IS NULL OR expected IS DISTINCT FROM previous.updated_at THEN
    RETURN jsonb_build_object('ok',false,'error','A venda foi alterada. Feche a edição, atualize a lista e tente novamente.');
  END IF;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor)::text,true);
  -- Explicit allowlist: never accept seller, status, commission rate or creator from the client.
  UPDATE public.sdr_sales s SET client_name=client, service=service_name,
    sale_value=round(amount,2), sale_date=target_date, notes=memo
    WHERE s.id=sale_id RETURNING to_jsonb(s) INTO result;
  RETURN jsonb_build_object('ok',true,'data',result);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range
  OR datetime_field_overflow OR invalid_datetime_format THEN
  RETURN jsonb_build_object('ok',false,'error','Dados inválidos. Confira os campos informados.');
END;
$function$;
REVOKE ALL ON FUNCTION m7_private.edit_sale(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION m7_private.edit_sale(jsonb) TO postgres;
