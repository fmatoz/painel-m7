WITH p AS (SELECT $1::jsonb AS data),
access_check AS (
  SELECT COALESCE((SELECT (data->>'authorized')::boolean FROM p), false) AS allowed
),
updated AS (
  UPDATE public.crm_leads l SET
    stage = CASE
      WHEN (SELECT data->>'action' FROM p)='update'
       AND (SELECT data->'changes'->>'stage' FROM p) IN ('novo','primeiro_contato','respondeu','follow_up','reuniao','proposta','cliente','congelado','perdido','fora_do_perfil')
      THEN (SELECT data->'changes'->>'stage' FROM p)
      ELSE l.stage END,
    service_interest = CASE WHEN (SELECT data->'changes' ? 'service_interest' FROM p)
      THEN left(COALESCE((SELECT data->'changes'->>'service_interest' FROM p),''),300) ELSE l.service_interest END,
    next_action = CASE WHEN (SELECT data->'changes' ? 'next_action' FROM p)
      THEN left(COALESCE((SELECT data->'changes'->>'next_action' FROM p),''),500) ELSE l.next_action END,
    next_action_at = CASE WHEN (SELECT data->'changes' ? 'next_action_at' FROM p)
      THEN NULLIF((SELECT data->'changes'->>'next_action_at' FROM p),'')::timestamptz ELSE l.next_action_at END,
    instagram_url = CASE WHEN (SELECT data->'changes' ? 'instagram_url' FROM p)
      THEN left(trim(COALESCE((SELECT data->'changes'->>'instagram_url' FROM p),'')),500) ELSE l.instagram_url END,
    facebook_url = CASE WHEN (SELECT data->'changes' ? 'facebook_url' FROM p)
      THEN left(trim(COALESCE((SELECT data->'changes'->>'facebook_url' FROM p),'')),500) ELSE l.facebook_url END,
    address_verified = CASE
      WHEN (SELECT data->'changes' ? 'address_verified' FROM p)
        THEN COALESCE((SELECT data->'changes'->>'address_verified' FROM p)::boolean,false)
      WHEN (SELECT data->'changes' ? 'address_has_woodshop' FROM p)
        THEN COALESCE((SELECT data->'changes'->>'address_has_woodshop' FROM p)::boolean,false)
      ELSE l.address_verified END,
    site_quality = CASE WHEN (SELECT data->'changes' ? 'site_quality' FROM p)
      THEN CASE WHEN (SELECT data->'changes'->>'site_quality' FROM p) IN ('none','bad','good')
        THEN (SELECT data->'changes'->>'site_quality' FROM p) ELSE NULL END
      ELSE l.site_quality END,
    instagram_quality = CASE WHEN (SELECT data->'changes' ? 'instagram_quality' FROM p)
      THEN CASE WHEN (SELECT data->'changes'->>'instagram_quality' FROM p) IN ('none','bad','good')
        THEN (SELECT data->'changes'->>'instagram_quality' FROM p) ELSE NULL END
      ELSE l.instagram_quality END,
    paid_traffic_status = CASE WHEN (SELECT data->'changes' ? 'paid_traffic_status' FROM p)
      THEN CASE WHEN (SELECT data->'changes'->>'paid_traffic_status' FROM p) IN ('yes','no')
        THEN (SELECT data->'changes'->>'paid_traffic_status' FROM p) ELSE NULL END
      ELSE l.paid_traffic_status END,
    notes = CASE WHEN (SELECT data->'changes' ? 'notes' FROM p)
      THEN left(COALESCE((SELECT data->'changes'->>'notes' FROM p),''),10000) ELSE l.notes END
  WHERE (SELECT allowed FROM access_check)
    AND (SELECT data->>'action' FROM p)='update'
    AND l.id=(SELECT NULLIF(data->>'leadId','')::uuid FROM p)
  RETURNING to_jsonb(l) AS lead
),
assigned AS (
  UPDATE public.crm_leads l SET
    assigned_to = CASE WHEN (SELECT data->>'assignmentMode' FROM p)='release'
      THEN NULL ELSE (SELECT NULLIF(data->>'userId','')::uuid FROM p) END,
    assigned_to_name = CASE WHEN (SELECT data->>'assignmentMode' FROM p)='release'
      THEN '' ELSE left((SELECT data->>'userName' FROM p),200) END,
    assigned_to_email = CASE WHEN (SELECT data->>'assignmentMode' FROM p)='release'
      THEN '' ELSE left((SELECT data->>'userEmail' FROM p),320) END,
    assigned_at = CASE WHEN (SELECT data->>'assignmentMode' FROM p)='release'
      THEN NULL ELSE now() END
  WHERE (SELECT allowed FROM access_check)
    AND (SELECT data->>'action' FROM p)='assign'
    AND l.id=(SELECT NULLIF(data->>'leadId','')::uuid FROM p)
    AND (
      ((SELECT data->>'assignmentMode' FROM p)='claim' AND l.assigned_to IS NULL)
      OR ((SELECT data->>'assignmentMode' FROM p)='release'
          AND (l.assigned_to=(SELECT NULLIF(data->>'userId','')::uuid FROM p)
               OR COALESCE((SELECT (data->>'isAdmin')::boolean FROM p),false)))
      OR ((SELECT data->>'assignmentMode' FROM p)='takeover'
          AND COALESCE((SELECT (data->>'isAdmin')::boolean FROM p),false))
    )
  RETURNING to_jsonb(l) AS lead
),
material_created AS (
  INSERT INTO public.crm_materials (title, usage_context, content_format, message, created_by, author_name)
  SELECT
    left(btrim((SELECT data->>'title' FROM p)),160),
    left(btrim(COALESCE((SELECT data->>'usageContext' FROM p),'')),500),
    CASE WHEN (SELECT data->>'contentFormat' FROM p) IN ('text','audio','both') THEN (SELECT data->>'contentFormat' FROM p) ELSE 'text' END,
    left(btrim((SELECT data->>'message' FROM p)),20000),
    (SELECT NULLIF(data->>'userId','')::uuid FROM p),
    left(COALESCE(NULLIF(btrim((SELECT data->>'userName' FROM p)),''),'Usuário'),160)
  WHERE (SELECT allowed FROM access_check)
    AND (SELECT data->>'action' FROM p)='material-create'
    AND NULLIF(btrim((SELECT data->>'title' FROM p)),'') IS NOT NULL
    AND NULLIF(btrim((SELECT data->>'message' FROM p)),'') IS NOT NULL
  RETURNING to_jsonb(crm_materials) AS material
),
material_updated AS (
  UPDATE public.crm_materials m SET
    title = left(btrim((SELECT data->>'title' FROM p)),160),
    usage_context = left(btrim(COALESCE((SELECT data->>'usageContext' FROM p),'')),500),
    content_format = CASE WHEN (SELECT data->>'contentFormat' FROM p) IN ('text','audio','both') THEN (SELECT data->>'contentFormat' FROM p) ELSE 'text' END,
    message = left(btrim((SELECT data->>'message' FROM p)),20000)
  WHERE (SELECT allowed FROM access_check)
    AND (SELECT data->>'action' FROM p)='material-update'
    AND m.id=(SELECT NULLIF(data->>'materialId','')::uuid FROM p)
    AND (
      m.created_by=(SELECT NULLIF(data->>'userId','')::uuid FROM p)
      OR COALESCE((SELECT (data->>'isAdmin')::boolean FROM p),false)
    )
    AND NULLIF(btrim((SELECT data->>'title' FROM p)),'') IS NOT NULL
    AND NULLIF(btrim((SELECT data->>'message' FROM p)),'') IS NOT NULL
  RETURNING to_jsonb(m) AS material
),
material_deleted AS (
  DELETE FROM public.crm_materials m
  WHERE (SELECT allowed FROM access_check)
    AND (SELECT data->>'action' FROM p)='material-delete'
    AND m.id=(SELECT NULLIF(data->>'materialId','')::uuid FROM p)
    AND (
      m.created_by=(SELECT NULLIF(data->>'userId','')::uuid FROM p)
      OR COALESCE((SELECT (data->>'isAdmin')::boolean FROM p),false)
    )
  RETURNING m.id
),
assignment_activity AS (
  INSERT INTO public.crm_activities (lead_id, activity_type, description, metadata, created_by)
  SELECT
    (lead->>'id')::uuid,
    'assignment',
    CASE WHEN (SELECT data->>'assignmentMode' FROM p)='release'
      THEN 'Responsável removido por ' || (SELECT data->>'userName' FROM p)
      ELSE 'Lead assumido por ' || (SELECT data->>'userName' FROM p) END,
    jsonb_build_object(
      'mode',(SELECT data->>'assignmentMode' FROM p),
      'performed_by',(SELECT data->>'userId' FROM p),
      'responsible_name',COALESCE(lead->>'assigned_to_name','')
    ),
    NULL
  FROM assigned
  RETURNING id
),
queued AS (
  INSERT INTO public.crm_commands (command_type, lead_id, created_by)
  SELECT
    (SELECT data->>'commandType' FROM p),
    CASE WHEN (SELECT data->>'commandType' FROM p)='send_to_group'
      THEN (SELECT NULLIF(data->>'leadId','')::uuid FROM p) ELSE NULL END,
    NULL
  WHERE (SELECT allowed FROM access_check)
    AND (SELECT data->>'action' FROM p)='command'
    AND (SELECT data->>'commandType' FROM p) IN ('sync','send_to_group')
    AND NOT EXISTS (
      SELECT 1 FROM public.crm_commands c
      WHERE c.command_type=(SELECT data->>'commandType' FROM p)
        AND COALESCE(c.lead_id,'00000000-0000-0000-0000-000000000000'::uuid)
          =COALESCE(CASE WHEN (SELECT data->>'commandType' FROM p)='send_to_group'
            THEN (SELECT NULLIF(data->>'leadId','')::uuid FROM p) ELSE NULL END,
            '00000000-0000-0000-0000-000000000000'::uuid)
        AND c.status IN ('pending','processing')
    )
  RETURNING id
)
SELECT CASE
  WHEN NOT (SELECT COALESCE((data->>'sessionValid')::boolean,false) FROM p)
    THEN jsonb_build_object('ok',false,'error','Sessão inválida ou expirada.')
  WHEN NOT (SELECT allowed FROM access_check)
    THEN jsonb_build_object('ok',false,'error','Você não tem acesso ao CRM.')
  WHEN (SELECT data->>'action' FROM p)='list'
    THEN jsonb_build_object('ok',true,'data',COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY (l.assigned_to IS NOT NULL) DESC, l.score DESC, l.created_at ASC, l.id ASC) FROM public.crm_leads l),'[]'::jsonb))
  WHEN (SELECT data->>'action' FROM p)='activities'
    THEN jsonb_build_object('ok',true,'data',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC) FROM (SELECT * FROM public.crm_activities WHERE lead_id=(SELECT NULLIF(data->>'leadId','')::uuid FROM p) ORDER BY created_at DESC LIMIT 20) a),'[]'::jsonb))
  WHEN (SELECT data->>'action' FROM p)='material-list'
    THEN jsonb_build_object('ok',true,'data',COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.updated_at DESC, m.id ASC) FROM public.crm_materials m),'[]'::jsonb))
  WHEN (SELECT data->>'action' FROM p)='material-create' AND EXISTS(SELECT 1 FROM material_created)
    THEN jsonb_build_object('ok',true,'data',(SELECT material FROM material_created LIMIT 1))
  WHEN (SELECT data->>'action' FROM p)='material-create'
    THEN jsonb_build_object('ok',false,'error','Preencha o título e a mensagem.')
  WHEN (SELECT data->>'action' FROM p)='material-update' AND EXISTS(SELECT 1 FROM material_updated)
    THEN jsonb_build_object('ok',true,'data',(SELECT material FROM material_updated LIMIT 1))
  WHEN (SELECT data->>'action' FROM p)='material-update'
    THEN jsonb_build_object('ok',false,'error','Material não encontrado ou sem permissão para editar.')
  WHEN (SELECT data->>'action' FROM p)='material-delete' AND EXISTS(SELECT 1 FROM material_deleted)
    THEN jsonb_build_object('ok',true,'data',jsonb_build_object('id',(SELECT id FROM material_deleted LIMIT 1)))
  WHEN (SELECT data->>'action' FROM p)='material-delete'
    THEN jsonb_build_object('ok',false,'error','Material não encontrado ou sem permissão para excluir.')
  WHEN (SELECT data->>'action' FROM p)='update'
    THEN jsonb_build_object('ok',EXISTS(SELECT 1 FROM updated),'data',(SELECT lead FROM updated LIMIT 1))
  WHEN (SELECT data->>'action' FROM p)='assign' AND EXISTS(SELECT 1 FROM assigned)
    THEN jsonb_build_object('ok',true,'data',(SELECT lead FROM assigned LIMIT 1))
  WHEN (SELECT data->>'action' FROM p)='assign'
    THEN jsonb_build_object(
      'ok',false,
      'error',COALESCE(
        (SELECT CASE
          WHEN l.assigned_to IS NOT NULL THEN 'Este lead já está com ' || COALESCE(NULLIF(l.assigned_to_name,''),'outro usuário') || '.'
          ELSE 'A atribuição não pôde ser alterada.'
        END FROM public.crm_leads l WHERE l.id=(SELECT NULLIF(data->>'leadId','')::uuid FROM p)),
        'Lead não encontrado.'
      )
    )
  WHEN (SELECT data->>'action' FROM p)='command'
    THEN jsonb_build_object('ok',true,'queued',true,'id',(SELECT id FROM queued LIMIT 1))
  ELSE jsonb_build_object('ok',false,'error','Ação inválida.')
END AS response;
