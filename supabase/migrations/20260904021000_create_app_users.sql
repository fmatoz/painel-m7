CREATE TABLE IF NOT EXISTS public.app_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE CHECK (char_length(email) <= 320),
  full_name TEXT NOT NULL DEFAULT '' CHECK (char_length(full_name) <= 160),
  is_admin BOOLEAN NOT NULL DEFAULT false,
  can_inicio BOOLEAN NOT NULL DEFAULT true,
  can_workflows BOOLEAN NOT NULL DEFAULT false,
  can_crm BOOLEAN NOT NULL DEFAULT false,
  can_financeiro BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.app_users (
  user_id, email, full_name, is_admin, can_inicio, can_workflows, can_crm, can_financeiro
)
SELECT id, lower(email), COALESCE(raw_user_meta_data->>'full_name', 'Felipe'), true, true, true, true, true
FROM auth.users
WHERE lower(email) = 'gestaom7ia@gmail.com'
ON CONFLICT (user_id) DO UPDATE SET
  is_admin = true,
  active = true,
  can_inicio = true,
  can_workflows = true,
  can_crm = true,
  can_financeiro = true;

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users
    WHERE user_id = auth.uid() AND is_admin AND active
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_access(area TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users
    WHERE user_id = auth.uid()
      AND active
      AND CASE area
        WHEN 'inicio' THEN can_inicio
        WHEN 'workflows' THEN can_workflows
        WHEN 'crm' THEN can_crm
        WHEN 'financeiro' THEN can_financeiro
        WHEN 'usuarios' THEN is_admin
        ELSE false
      END
  );
$$;

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own access" ON public.app_users;
DROP POLICY IF EXISTS "Admins can create users" ON public.app_users;
DROP POLICY IF EXISTS "Admins can update users" ON public.app_users;

CREATE POLICY "Users can read their own access"
  ON public.app_users FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.current_user_is_admin());
CREATE POLICY "Admins can create users"
  ON public.app_users FOR INSERT TO authenticated
  WITH CHECK (public.current_user_is_admin());
CREATE POLICY "Admins can update users"
  ON public.app_users FOR UPDATE TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

DROP POLICY IF EXISTS "Authenticated users can read CRM leads" ON public.crm_leads;
DROP POLICY IF EXISTS "Authenticated users can create CRM leads" ON public.crm_leads;
DROP POLICY IF EXISTS "Authenticated users can update CRM leads" ON public.crm_leads;
DROP POLICY IF EXISTS "Authenticated users can delete CRM leads" ON public.crm_leads;
DROP POLICY IF EXISTS "Authenticated users can read CRM activities" ON public.crm_activities;
DROP POLICY IF EXISTS "Authenticated users can create CRM activities" ON public.crm_activities;
DROP POLICY IF EXISTS "Authenticated users can read their CRM commands" ON public.crm_commands;
DROP POLICY IF EXISTS "Authenticated users can create CRM commands" ON public.crm_commands;

CREATE POLICY "CRM members can read leads"
  ON public.crm_leads FOR SELECT TO authenticated
  USING (public.current_user_has_access('crm'));
CREATE POLICY "CRM members can create leads"
  ON public.crm_leads FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_access('crm'));
CREATE POLICY "CRM members can update leads"
  ON public.crm_leads FOR UPDATE TO authenticated
  USING (public.current_user_has_access('crm'))
  WITH CHECK (public.current_user_has_access('crm'));
CREATE POLICY "CRM members can delete leads"
  ON public.crm_leads FOR DELETE TO authenticated
  USING (public.current_user_has_access('crm'));
CREATE POLICY "CRM members can read activities"
  ON public.crm_activities FOR SELECT TO authenticated
  USING (public.current_user_has_access('crm'));
CREATE POLICY "CRM members can create activities"
  ON public.crm_activities FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_access('crm'));
CREATE POLICY "CRM members can read their commands"
  ON public.crm_commands FOR SELECT TO authenticated
  USING (created_by = auth.uid() AND public.current_user_has_access('crm'));
CREATE POLICY "CRM members can create commands"
  ON public.crm_commands FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.current_user_has_access('crm'));

GRANT SELECT, INSERT, UPDATE ON public.app_users TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_access(TEXT) TO authenticated;
GRANT ALL ON public.app_users TO service_role;

NOTIFY pgrst, 'reload schema';
