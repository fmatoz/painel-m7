alter table public.crm_leads
  add column if not exists instagram_quality text;

alter table public.crm_leads
  drop constraint if exists crm_leads_instagram_quality_check;

alter table public.crm_leads
  add constraint crm_leads_instagram_quality_check
  check (instagram_quality is null or instagram_quality in ('none', 'bad', 'good'));

comment on column public.crm_leads.instagram_quality is
  'Manual Instagram assessment used by the CRM Radar M7: none, bad or good.';
