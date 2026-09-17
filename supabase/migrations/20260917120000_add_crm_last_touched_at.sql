alter table public.crm_leads
  add column if not exists last_touched_at timestamptz default now();

update public.crm_leads lead
set last_touched_at = coalesce(
  (
    select max(activity.created_at)
    from public.crm_activities activity
    where activity.lead_id = lead.id
  ),
  lead.created_at
);

alter table public.crm_leads
  alter column last_touched_at set not null;

create or replace function public.set_crm_last_touched_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if row(
    new.stage,
    new.service_interest,
    new.next_action,
    new.next_action_at,
    new.instagram_url,
    new.address_verified,
    new.site_quality,
    new.instagram_quality,
    new.paid_traffic_status,
    new.notes,
    new.assigned_to,
    new.assigned_to_name,
    new.group_sent_at
  ) is distinct from row(
    old.stage,
    old.service_interest,
    old.next_action,
    old.next_action_at,
    old.instagram_url,
    old.address_verified,
    old.site_quality,
    old.instagram_quality,
    old.paid_traffic_status,
    old.notes,
    old.assigned_to,
    old.assigned_to_name,
    old.group_sent_at
  ) then
    new.last_touched_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists set_crm_leads_last_touched_at on public.crm_leads;
create trigger set_crm_leads_last_touched_at
  before update on public.crm_leads
  for each row execute function public.set_crm_last_touched_at();

create index if not exists crm_leads_stage_last_touched_idx
  on public.crm_leads (stage, last_touched_at desc, score desc);

comment on column public.crm_leads.last_touched_at is
  'Timestamp of the latest user-relevant CRM change; ignores routine source synchronization.';
