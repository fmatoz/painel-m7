DO $$
DECLARE
  required_relation TEXT;
BEGIN
  FOREACH required_relation IN ARRAY ARRAY[
    'public.app_users',
    'public.crm_leads',
    'public.crm_activities',
    'public.crm_commands',
    'public.crm_materials',
    'public.team_settings',
    'public.sdr_sales'
  ]
  LOOP
    IF to_regclass(required_relation) IS NULL THEN
      RAISE EXCEPTION 'Required relation % does not exist', required_relation;
    END IF;
  END LOOP;
END;
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON public.app_users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_leads TO authenticated;
GRANT SELECT, INSERT ON public.crm_activities TO authenticated;
GRANT SELECT, INSERT ON public.crm_commands TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_materials TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.team_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sdr_sales TO authenticated;

GRANT ALL ON
  public.app_users,
  public.crm_leads,
  public.crm_activities,
  public.crm_commands,
  public.crm_materials,
  public.team_settings,
  public.sdr_sales
TO service_role;

SELECT pg_notify('pgrst', 'reload config');
SELECT pg_notify('pgrst', 'reload schema');
