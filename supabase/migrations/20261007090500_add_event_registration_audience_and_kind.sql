alter table public.events
  add column if not exists registration_audience text not null default 'members_only';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='events_registration_audience_check'
      and conrelid='public.events'::regclass
  ) then
    alter table public.events add constraint events_registration_audience_check
      check (registration_audience in ('members_only','public'));
  end if;
end $$;

alter table public.event_registrations
  add column if not exists registration_kind text not null default 'member';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='event_registrations_kind_check'
      and conrelid='public.event_registrations'::regclass
  ) then
    alter table public.event_registrations add constraint event_registrations_kind_check
      check (registration_kind in ('member','public'));
  end if;
end $$;

create index if not exists events_registration_audience_idx
  on public.events(registration_audience, registration_enabled);

create index if not exists event_registrations_kind_idx
  on public.event_registrations(event_id, registration_kind, status);
