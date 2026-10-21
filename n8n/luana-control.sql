CREATE SCHEMA IF NOT EXISTS luana_control_private;
REVOKE ALL ON SCHEMA luana_control_private FROM PUBLIC;

CREATE TABLE IF NOT EXISTS luana_control_private.state (
  id text PRIMARY KEY CHECK (id = 'canel_luana'),
  enabled boolean NOT NULL DEFAULT true,
  token_hash text NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE luana_control_private.state FROM PUBLIC;

INSERT INTO luana_control_private.state (id, enabled, token_hash)
VALUES ('canel_luana', true, '__TOKEN_SHA256__')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION luana_control_private.request(
  p_token text, p_action text, p_enabled boolean, p_version integer
) RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog, luana_control_private AS $$
DECLARE
  current_state luana_control_private.state%ROWTYPE;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9_-]{43}$' THEN
    RETURN jsonb_build_object('ok',false,'statusCode',401);
  END IF;
  SELECT * INTO current_state FROM luana_control_private.state
  WHERE id = 'canel_luana' AND token_hash = encode(sha256(convert_to(p_token,'UTF8')),'hex')
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'statusCode',401); END IF;
  IF p_action IS NULL OR p_action NOT IN ('status','set') THEN
    RETURN jsonb_build_object('ok',false,'statusCode',400);
  END IF;
  IF p_action = 'set' THEN
    IF p_enabled IS NULL OR p_version IS NULL OR p_version < 1 THEN
      RETURN jsonb_build_object('ok',false,'statusCode',400);
    END IF;
    IF p_version <> current_state.version THEN
      RETURN jsonb_build_object('ok',false,'statusCode',409);
    END IF;
    UPDATE luana_control_private.state SET enabled = p_enabled,
      version = version + 1, updated_at = clock_timestamp()
    WHERE id = 'canel_luana' RETURNING * INTO current_state;
  END IF;
  RETURN jsonb_build_object('ok',true,'statusCode',200,'enabled',current_state.enabled,
    'version',current_state.version,'updatedAt',current_state.updated_at);
END;
$$;
REVOKE ALL ON FUNCTION luana_control_private.request(text,text,boolean,integer) FROM PUBLIC;

SELECT enabled, version FROM luana_control_private.state WHERE id = 'canel_luana';
