CREATE TABLE IF NOT EXISTS public.crm_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  message TEXT NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 20000),
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL DEFAULT '' CHECK (char_length(author_name) <= 160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_materials_author_idx
  ON public.crm_materials (created_by, updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_crm_material_author()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    NEW.author_name := COALESCE(
      (SELECT NULLIF(btrim(full_name), '') FROM public.app_users WHERE user_id = auth.uid()),
      split_part(COALESCE(auth.jwt()->>'email', 'Usuário'), '@', 1)
    );
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.author_name := OLD.author_name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_crm_material_author ON public.crm_materials;
CREATE TRIGGER set_crm_material_author
  BEFORE INSERT OR UPDATE ON public.crm_materials
  FOR EACH ROW EXECUTE FUNCTION public.set_crm_material_author();

DROP TRIGGER IF EXISTS set_crm_materials_updated_at ON public.crm_materials;
CREATE TRIGGER set_crm_materials_updated_at
  BEFORE UPDATE ON public.crm_materials
  FOR EACH ROW EXECUTE FUNCTION public.set_crm_updated_at();

ALTER TABLE public.crm_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CRM members can read materials" ON public.crm_materials;
DROP POLICY IF EXISTS "CRM members can create materials" ON public.crm_materials;
DROP POLICY IF EXISTS "Owners and admins can update materials" ON public.crm_materials;
DROP POLICY IF EXISTS "Owners and admins can delete materials" ON public.crm_materials;

CREATE POLICY "CRM members can read materials"
  ON public.crm_materials FOR SELECT TO authenticated
  USING (public.current_user_has_access('crm'));

CREATE POLICY "CRM members can create materials"
  ON public.crm_materials FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_has_access('crm')
    AND created_by = auth.uid()
  );

CREATE POLICY "Owners and admins can update materials"
  ON public.crm_materials FOR UPDATE TO authenticated
  USING (
    public.current_user_has_access('crm')
    AND (created_by = auth.uid() OR public.current_user_is_admin())
  )
  WITH CHECK (
    public.current_user_has_access('crm')
    AND (created_by = auth.uid() OR public.current_user_is_admin())
  );

CREATE POLICY "Owners and admins can delete materials"
  ON public.crm_materials FOR DELETE TO authenticated
  USING (
    public.current_user_has_access('crm')
    AND (created_by = auth.uid() OR public.current_user_is_admin())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_materials TO authenticated;
GRANT ALL ON public.crm_materials TO service_role;
GRANT EXECUTE ON FUNCTION public.set_crm_material_author() TO authenticated;

NOTIFY pgrst, 'reload schema';
