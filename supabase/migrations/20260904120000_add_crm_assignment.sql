ALTER TABLE public.crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_assigned_to_fkey;

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS assigned_to_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS assigned_to_email TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

ALTER TABLE public.crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_assigned_to_name_check,
  DROP CONSTRAINT IF EXISTS crm_leads_assigned_to_email_check;

ALTER TABLE public.crm_leads
  ADD CONSTRAINT crm_leads_assigned_to_name_check
    CHECK (char_length(assigned_to_name) <= 200),
  ADD CONSTRAINT crm_leads_assigned_to_email_check
    CHECK (char_length(assigned_to_email) <= 320);

CREATE INDEX IF NOT EXISTS crm_leads_assigned_to_idx
  ON public.crm_leads (assigned_to, stage, score DESC)
  WHERE assigned_to IS NOT NULL;

ALTER TABLE public.crm_activities
  DROP CONSTRAINT IF EXISTS crm_activities_activity_type_check;

ALTER TABLE public.crm_activities
  ADD CONSTRAINT crm_activities_activity_type_check
    CHECK (activity_type IN (
      'created',
      'stage_changed',
      'note',
      'whatsapp_group',
      'sync',
      'updated',
      'assignment'
    ));

NOTIFY pgrst, 'reload schema';
