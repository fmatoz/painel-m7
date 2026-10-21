-- Keep the original responsible person; collaborators do not duplicate leads.
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS co_assignees jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(co_assignees) = 'array');

CREATE SCHEMA IF NOT EXISTS m7_private;

-- Server-managed recipient, using the current panel identity, not the legacy
-- app_users replica in this database. Sharing never grants CRM access itself.
CREATE TABLE IF NOT EXISTS m7_private.crm_share_recipient (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  user_id uuid NOT NULL,
  name text NOT NULL,
  email text NOT NULL
);
REVOKE ALL ON m7_private.crm_share_recipient FROM PUBLIC, anon, authenticated;
GRANT SELECT ON m7_private.crm_share_recipient TO service_role;
INSERT INTO m7_private.crm_share_recipient(singleton,user_id,name,email)
VALUES (true,'de5f395b-64eb-45e5-9ec7-1d23aa7bc712','Felipe','gestaom7ia@gmail.com')
ON CONFLICT (singleton) DO NOTHING;

-- Called only by the trusted n8n Postgres connection, after session validation.
-- Never expose this function through a public RPC accepting client identity.
CREATE OR REPLACE FUNCTION m7_private.assign_crm_lead(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor uuid;
  mode text := p->>'assignmentMode';
  lead public.crm_leads%ROWTYPE;
  promoted jsonb;
  recipient m7_private.crm_share_recipient%ROWTYPE;
  actor_name text := left(COALESCE(NULLIF(p->>'userName',''),'Usuário'),200);
  description text;
BEGIN
  IF NOT COALESCE((p->>'sessionValid')::boolean,false)
     OR NOT COALESCE((p->>'authorized')::boolean,false)
     OR NULLIF(p->>'userId','') IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error','Você não tem acesso ao CRM.');
  END IF;
  actor := (p->>'userId')::uuid;
  SELECT * INTO lead FROM public.crm_leads
    WHERE id = NULLIF(p->>'leadId','')::uuid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error','Lead não encontrado.');
  END IF;

  -- Old open tabs may still send takeover. Preserve the prospector there too.
  IF mode = 'takeover' THEN mode := 'join'; END IF;

  IF mode = 'claim' THEN
    IF lead.assigned_to = actor THEN
      RETURN jsonb_build_object('ok',true,'data',to_jsonb(lead));
    END IF;
    IF lead.assigned_to IS NOT NULL THEN
      RETURN jsonb_build_object('ok',false,'error','Este lead já tem responsável. Atualize o card.');
    END IF;
    lead.assigned_to := actor;
    lead.assigned_to_name := actor_name;
    lead.assigned_to_email := left(COALESCE(p->>'userEmail',''),320);
    lead.assigned_at := now();
    description := 'Lead assumido por ' || actor_name;
  ELSIF mode = 'join' THEN
    IF NOT COALESCE((p->>'isAdmin')::boolean,false) THEN
      RETURN jsonb_build_object('ok',false,'error','Somente administradores podem assumir junto.');
    END IF;
    IF lead.assigned_to = actor OR lead.co_assignees @> jsonb_build_array(jsonb_build_object('id',actor::text)) THEN
      RETURN jsonb_build_object('ok',true,'data',to_jsonb(lead));
    END IF;
    IF lead.assigned_to IS NULL THEN
      RETURN jsonb_build_object('ok',false,'error','O lead foi liberado. Atualize e use Assumir lead.');
    END IF;
    lead.co_assignees := lead.co_assignees || jsonb_build_array(jsonb_build_object(
      'id',actor::text,'name',actor_name,'email',left(COALESCE(p->>'userEmail',''),320),'assigned_at',now()));
    description := actor_name || ' entrou como corresponsável, mantendo ' || lead.assigned_to_name || '.';
  ELSIF mode = 'share' THEN
    IF lead.assigned_to IS DISTINCT FROM actor AND NOT
       (lead.co_assignees @> jsonb_build_array(jsonb_build_object('id',actor::text))) THEN
      RETURN jsonb_build_object('ok',false,'error','Somente um responsável pode compartilhar este lead.');
    END IF;
    SELECT * INTO recipient FROM m7_private.crm_share_recipient WHERE singleton;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok',false,'error','Destinatário do compartilhamento não configurado.');
    END IF;
    IF lead.assigned_to = recipient.user_id OR lead.co_assignees @>
       jsonb_build_array(jsonb_build_object('id',recipient.user_id::text)) THEN
      RETURN jsonb_build_object('ok',true,'data',to_jsonb(lead));
    END IF;
    lead.co_assignees := lead.co_assignees || jsonb_build_array(jsonb_build_object(
      'id',recipient.user_id::text,'name',recipient.name,'email',recipient.email,'assigned_at',now()));
    description := actor_name || ' compartilhou o atendimento com ' || recipient.name || ', mantendo os responsáveis.';
  ELSIF mode = 'release' THEN
    IF lead.assigned_to = actor THEN
      promoted := lead.co_assignees->0;
      lead.assigned_to := (promoted->>'id')::uuid;
      lead.assigned_to_name := COALESCE(promoted->>'name','');
      lead.assigned_to_email := COALESCE(promoted->>'email','');
      lead.assigned_at := (promoted->>'assigned_at')::timestamptz;
      IF promoted IS NOT NULL THEN lead.co_assignees := lead.co_assignees - 0; END IF;
    ELSIF lead.co_assignees @> jsonb_build_array(jsonb_build_object('id',actor::text)) THEN
      SELECT COALESCE(jsonb_agg(person ORDER BY ord),'[]'::jsonb) INTO lead.co_assignees
        FROM jsonb_array_elements(lead.co_assignees) WITH ORDINALITY AS members(person,ord)
        WHERE person->>'id' <> actor::text;
    ELSE
      RETURN jsonb_build_object('ok',false,'error','Você não participa deste atendimento.');
    END IF;
    description := actor_name || ' saiu do atendimento.';
  ELSE
    RETURN jsonb_build_object('ok',false,'error','Ação de atribuição inválida.');
  END IF;

  UPDATE public.crm_leads SET
    assigned_to=lead.assigned_to, assigned_to_name=lead.assigned_to_name,
    assigned_to_email=lead.assigned_to_email, assigned_at=lead.assigned_at,
    co_assignees=lead.co_assignees, updated_at=now(), last_touched_at=now()
    WHERE id=lead.id RETURNING * INTO lead;
  INSERT INTO public.crm_activities (lead_id,activity_type,description,metadata,created_by)
    VALUES (lead.id,'assignment',description,jsonb_build_object(
      'mode',mode,'performed_by',actor,'responsible_name',lead.assigned_to_name,
      'co_assignees',lead.co_assignees),NULL);
  RETURN jsonb_build_object('ok',true,'data',to_jsonb(lead));
END;
$$;

REVOKE ALL ON FUNCTION m7_private.assign_crm_lead(jsonb) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA m7_private TO service_role;
GRANT EXECUTE ON FUNCTION m7_private.assign_crm_lead(jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
