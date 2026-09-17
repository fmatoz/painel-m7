alter table public.crm_leads
  add column if not exists facebook_url text not null default '';

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
    new.facebook_url,
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
    old.facebook_url,
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

comment on column public.crm_leads.facebook_url is
  'Facebook page URL or page name used for manual profile and Meta Ad Library verification.';
