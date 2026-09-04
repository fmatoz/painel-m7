DROP POLICY IF EXISTS "Users can manage their own home workspace" ON public.home_workspaces;
CREATE POLICY "Authorized users can manage their home workspace"
  ON public.home_workspaces
  FOR ALL TO authenticated
  USING (auth.uid() = user_id AND public.current_user_has_access('inicio'))
  WITH CHECK (auth.uid() = user_id AND public.current_user_has_access('inicio'));

DO $$
BEGIN
  IF to_regclass('public.dashboard_tabs') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can manage their own dashboard tabs" ON public.dashboard_tabs';
    EXECUTE 'CREATE POLICY "Authorized users can manage their dashboard tabs"
      ON public.dashboard_tabs FOR ALL TO authenticated
      USING (auth.uid() = user_id AND public.current_user_has_access(''workflows''))
      WITH CHECK (auth.uid() = user_id AND public.current_user_has_access(''workflows''))';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
