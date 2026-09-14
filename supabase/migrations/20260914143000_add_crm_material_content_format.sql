ALTER TABLE public.crm_materials
  ADD COLUMN IF NOT EXISTS content_format TEXT NOT NULL DEFAULT 'text'
  CHECK (content_format IN ('text', 'audio', 'both'));

COMMENT ON COLUMN public.crm_materials.content_format IS
  'Formato de uso do material: text, audio ou both.';

NOTIFY pgrst, 'reload schema';
