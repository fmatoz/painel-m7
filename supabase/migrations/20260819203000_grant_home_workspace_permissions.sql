GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.home_workspaces
  TO authenticated;

GRANT ALL
  ON public.home_workspaces
  TO service_role;

NOTIFY pgrst, 'reload schema';
