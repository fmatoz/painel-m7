CREATE TABLE public.crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL CHECK (char_length(company_name) <= 300),
  partner_name TEXT NOT NULL DEFAULT '' CHECK (char_length(partner_name) <= 300),
  phone TEXT NOT NULL DEFAULT '' CHECK (char_length(phone) <= 40),
  phone_normalized TEXT GENERATED ALWAYS AS (NULLIF(regexp_replace(phone, '\D', '', 'g'), '')) STORED,
  source TEXT NOT NULL DEFAULT 'Maps' CHECK (source IN ('Maps', 'CNPJ', 'Maps + CNPJ')),
  source_refs JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_refs) = 'object'),
  stage TEXT NOT NULL DEFAULT 'novo' CHECK (stage IN ('novo', 'primeiro_contato', 'respondeu', 'reuniao', 'proposta', 'cliente', 'perdido')),
  score NUMERIC(3,1) NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 10),
  city TEXT NOT NULL DEFAULT '' CHECK (char_length(city) <= 160),
  state TEXT NOT NULL DEFAULT '' CHECK (char_length(state) <= 2),
  address TEXT NOT NULL DEFAULT '' CHECK (char_length(address) <= 500),
  website TEXT NOT NULL DEFAULT '' CHECK (char_length(website) <= 500),
  email TEXT NOT NULL DEFAULT '' CHECK (char_length(email) <= 320),
  maps_rating NUMERIC(2,1) CHECK (maps_rating IS NULL OR (maps_rating >= 0 AND maps_rating <= 5)),
  maps_reviews INTEGER CHECK (maps_reviews IS NULL OR maps_reviews >= 0),
  cnpj TEXT NOT NULL DEFAULT '' CHECK (char_length(cnpj) <= 24),
  cnae TEXT NOT NULL DEFAULT '' CHECK (char_length(cnae) <= 500),
  capital_social NUMERIC(16,2) CHECK (capital_social IS NULL OR capital_social >= 0),
  service_interest TEXT NOT NULL DEFAULT '' CHECK (char_length(service_interest) <= 300),
  notes TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 10000),
  next_action TEXT NOT NULL DEFAULT '' CHECK (char_length(next_action) <= 500),
  next_action_at TIMESTAMPTZ,
  group_sent_at TIMESTAMPTZ,
  group_message_id TEXT,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX crm_leads_phone_normalized_key
  ON public.crm_leads (phone_normalized)
  WHERE phone_normalized IS NOT NULL;
CREATE INDEX crm_leads_stage_idx ON public.crm_leads (stage, score DESC);
CREATE INDEX crm_leads_next_action_idx ON public.crm_leads (next_action_at) WHERE next_action_at IS NOT NULL;
CREATE INDEX crm_leads_cnpj_idx ON public.crm_leads (cnpj) WHERE cnpj <> '';

CREATE TABLE public.crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('created', 'stage_changed', 'note', 'whatsapp_group', 'sync', 'updated')),
  description TEXT NOT NULL CHECK (char_length(description) <= 2000),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX crm_activities_lead_created_idx ON public.crm_activities (lead_id, created_at DESC);

CREATE TABLE public.crm_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command_type TEXT NOT NULL CHECK (command_type IN ('sync', 'send_to_group')),
  lead_id UUID REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  CHECK ((command_type = 'sync' AND lead_id IS NULL) OR (command_type = 'send_to_group' AND lead_id IS NOT NULL))
);

CREATE UNIQUE INDEX crm_commands_pending_key
  ON public.crm_commands (command_type, COALESCE(lead_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status IN ('pending', 'processing');

CREATE OR REPLACE FUNCTION public.set_crm_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_crm_leads_updated_at
  BEFORE UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_crm_updated_at();

CREATE OR REPLACE FUNCTION public.log_crm_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    INSERT INTO public.crm_activities (lead_id, activity_type, description, metadata, created_by)
    VALUES (
      NEW.id,
      'stage_changed',
      'Etapa alterada',
      jsonb_build_object('from', OLD.stage, 'to', NEW.stage),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER log_crm_leads_stage_change
  AFTER UPDATE OF stage ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.log_crm_stage_change();

ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read CRM leads"
  ON public.crm_leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create CRM leads"
  ON public.crm_leads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update CRM leads"
  ON public.crm_leads FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete CRM leads"
  ON public.crm_leads FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read CRM activities"
  ON public.crm_activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create CRM activities"
  ON public.crm_activities FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can read their CRM commands"
  ON public.crm_commands FOR SELECT TO authenticated USING (created_by = auth.uid());
CREATE POLICY "Authenticated users can create CRM commands"
  ON public.crm_commands FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_leads TO authenticated;
GRANT SELECT, INSERT ON public.crm_activities TO authenticated;
GRANT SELECT, INSERT ON public.crm_commands TO authenticated;
GRANT ALL ON public.crm_leads, public.crm_activities, public.crm_commands TO service_role;

ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_leads;
NOTIFY pgrst, 'reload schema';
