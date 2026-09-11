CREATE OR REPLACE FUNCTION public.set_crm_material_author()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  authenticated_user UUID := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF authenticated_user IS NOT NULL THEN
      NEW.created_by := authenticated_user;
      NEW.author_name := COALESCE(
        (SELECT NULLIF(btrim(full_name), '') FROM public.app_users WHERE user_id = authenticated_user),
        split_part(COALESCE(auth.jwt()->>'email', 'Usuário'), '@', 1)
      );
    ELSE
      NEW.author_name := COALESCE(NULLIF(btrim(NEW.author_name), ''), 'Usuário');
    END IF;
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.author_name := OLD.author_name;
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
