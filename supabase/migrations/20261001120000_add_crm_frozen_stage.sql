-- Add a reversible pipeline destination; do not move any existing lead.
ALTER TABLE public.crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_stage_check;
ALTER TABLE public.crm_leads
  ADD CONSTRAINT crm_leads_stage_check CHECK (
    stage IN ('novo','primeiro_contato','respondeu','follow_up','reuniao','proposta','cliente','congelado','perdido','fora_do_perfil')
  );
NOTIFY pgrst, 'reload schema';
