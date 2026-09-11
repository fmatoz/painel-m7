-- CRM identities are validated against the Supabase Auth project by the API
-- workflow. This database does not contain those users in its local auth schema,
-- so a local foreign key would reject every valid panel user.
ALTER TABLE public.crm_materials
  DROP CONSTRAINT IF EXISTS crm_materials_created_by_fkey;

COMMENT ON COLUMN public.crm_materials.created_by IS
  'Authenticated user UUID validated by the M7 CRM API workflow.';
