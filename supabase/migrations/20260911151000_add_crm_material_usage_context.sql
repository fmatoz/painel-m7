ALTER TABLE public.crm_materials
  ADD COLUMN IF NOT EXISTS usage_context TEXT NOT NULL DEFAULT ''
  CHECK (char_length(usage_context) <= 500);

COMMENT ON COLUMN public.crm_materials.usage_context IS
  'Situações curtas em que o material deve ser utilizado.';

NOTIFY pgrst, 'reload schema';
