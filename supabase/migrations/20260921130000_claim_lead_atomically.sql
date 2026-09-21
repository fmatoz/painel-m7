CREATE OR REPLACE FUNCTION public.claim_crm_lead(p_lead_id UUID)
RETURNS public.crm_leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed_lead public.crm_leads;
  current_name TEXT;
  current_email TEXT;
  existing_owner TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_has_access('crm') THEN
    RAISE EXCEPTION 'Usuário sem acesso ao CRM';
  END IF;

  SELECT
    COALESCE(NULLIF(btrim(full_name), ''), split_part(email, '@', 1)),
    email
  INTO current_name, current_email
  FROM public.app_users
  WHERE user_id = auth.uid() AND active;

  IF current_name IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado ou inativo';
  END IF;

  UPDATE public.crm_leads
  SET
    assigned_to = auth.uid(),
    assigned_to_name = current_name,
    assigned_to_email = COALESCE(current_email, ''),
    assigned_at = now()
  WHERE id = p_lead_id
    AND assigned_to IS NULL
  RETURNING * INTO claimed_lead;

  IF claimed_lead.id IS NULL THEN
    SELECT NULLIF(btrim(assigned_to_name), '')
    INTO existing_owner
    FROM public.crm_leads
    WHERE id = p_lead_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lead não encontrado';
    END IF;

    RAISE EXCEPTION 'Este lead já foi assumido por %', COALESCE(existing_owner, 'outro usuário');
  END IF;

  INSERT INTO public.crm_activities (
    lead_id,
    activity_type,
    description,
    metadata,
    created_by
  )
  VALUES (
    claimed_lead.id,
    'assignment',
    'Lead assumido por ' || current_name,
    jsonb_build_object('assigned_to', auth.uid(), 'assigned_to_name', current_name),
    auth.uid()
  );

  RETURN claimed_lead;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_crm_lead(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_crm_lead(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
