INSERT INTO public.app_users (
  user_id,
  email,
  full_name,
  is_admin,
  can_inicio,
  can_workflows,
  can_crm,
  can_financeiro,
  active
)
SELECT
  id,
  lower(email),
  COALESCE(NULLIF(raw_user_meta_data->>'full_name', ''), 'Felipe'),
  true,
  true,
  true,
  true,
  true,
  true
FROM auth.users
WHERE lower(email) = 'gestaom7ia@gmail.com'
ON CONFLICT (user_id) DO UPDATE SET
  email = EXCLUDED.email,
  is_admin = true,
  active = true,
  can_inicio = true,
  can_workflows = true,
  can_crm = true,
  can_financeiro = true,
  updated_at = now();

NOTIFY pgrst, 'reload schema';
