ALTER TABLE public.crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_stage_check;

ALTER TABLE public.crm_leads
  ADD CONSTRAINT crm_leads_stage_check
  CHECK (
    stage IN (
      'novo',
      'primeiro_contato',
      'respondeu',
      'reuniao',
      'proposta',
      'cliente',
      'fora_do_perfil',
      'perdido'
    )
  );

NOTIFY pgrst, 'reload schema';
