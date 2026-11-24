BEGIN;
SET LOCAL lock_timeout = '3s';

-- An immutable first-contact event: later assignments and stage re-entry do not count again.
CREATE TABLE IF NOT EXISTS m7_private.crm_first_contacts (
  lead_id uuid PRIMARY KEY,
  contacted_at timestamptz NOT NULL,
  actor_id uuid,
  actor_name text NOT NULL DEFAULT '',
  historical boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS crm_first_contacts_day_idx
  ON m7_private.crm_first_contacts (contacted_at, actor_id);
ALTER TABLE m7_private.crm_first_contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON m7_private.crm_first_contacts FROM PUBLIC, anon, authenticated;

-- Keep the earliest recorded transition, even when its author is unknown.
INSERT INTO m7_private.crm_first_contacts (lead_id, contacted_at, actor_id, actor_name, historical)
SELECT DISTINCT ON (a.lead_id) a.lead_id, a.created_at, a.created_by, '', true
FROM public.crm_activities a
WHERE a.activity_type = 'stage_changed' AND a.metadata->>'to' = 'primeiro_contato'
ORDER BY a.lead_id, a.created_at, a.id
ON CONFLICT (lead_id) DO NOTHING;

CREATE OR REPLACE FUNCTION m7_private.record_crm_first_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  actor jsonb := COALESCE(NULLIF(current_setting('m7.crm_actor', true), ''), '{}')::jsonb;
BEGIN
  IF NEW.stage = 'primeiro_contato' AND OLD.stage IS DISTINCT FROM NEW.stage THEN
    INSERT INTO m7_private.crm_first_contacts (lead_id, contacted_at, actor_id, actor_name)
    VALUES (NEW.id, now(), COALESCE(NULLIF(actor->>'id', '')::uuid, auth.uid()),
      left(COALESCE(actor->>'name', auth.jwt()->'user_metadata'->>'full_name', ''), 200))
    ON CONFLICT (lead_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION m7_private.record_crm_first_contact() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS record_crm_first_contact ON public.crm_leads;
CREATE TRIGGER record_crm_first_contact AFTER UPDATE OF stage ON public.crm_leads
FOR EACH ROW EXECUTE FUNCTION m7_private.record_crm_first_contact();

CREATE OR REPLACE FUNCTION m7_private.crm_prospecting_summary(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  actor uuid;
  admin boolean := COALESCE((p->>'isAdmin')::boolean, false);
  report_day date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  result jsonb;
BEGIN
  IF NOT COALESCE((p->>'sessionValid')::boolean, false)
    OR NOT COALESCE((p->>'authorized')::boolean, false)
    OR NULLIF(p->>'userId', '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Você não tem acesso ao CRM.');
  END IF;
  actor := (p->>'userId')::uuid;
  IF NULLIF(p->>'reportDate', '') IS NOT NULL THEN
    IF p->>'reportDate' !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Data inválida.');
    END IF;
    BEGIN
      report_day := (p->>'reportDate')::date;
    EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Data inválida.');
    END;
  END IF;
  WITH daily AS MATERIALIZED (
    SELECT * FROM m7_private.crm_first_contacts
    WHERE contacted_at >= (report_day::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND contacted_at < ((report_day + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND (admin OR actor_id = actor)
  ), people AS (
    SELECT actor_id, COALESCE(NULLIF(max(actor_name), ''),
      CASE WHEN actor_id IS NULL THEN 'Sem autoria registrada' ELSE 'Usuário sem nome registrado' END) AS name,
      count(*) AS total
    FROM daily GROUP BY actor_id
  )
  SELECT jsonb_build_object('date', report_day, 'scope', CASE WHEN admin THEN 'team' ELSE 'self' END,
    'total', (SELECT count(*) FROM daily),
    'own_total', (SELECT count(*) FROM daily WHERE actor_id = actor),
    'unattributed', CASE WHEN admin THEN (SELECT count(*) FROM daily WHERE actor_id IS NULL) ELSE 0 END,
    'by_sdr', CASE WHEN admin THEN COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', actor_id, 'name', name, 'total', total) ORDER BY total DESC, name, actor_id) FROM people), '[]'::jsonb)
      ELSE '[]'::jsonb END) INTO result;
  RETURN jsonb_build_object('ok', true, 'data', result);
END;
$$;
REVOKE ALL ON FUNCTION m7_private.crm_prospecting_summary(jsonb) FROM PUBLIC, anon, authenticated;
COMMIT;
