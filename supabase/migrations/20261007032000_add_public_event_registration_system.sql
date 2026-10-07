alter table public.events
  add column if not exists registration_enabled boolean not null default false,
  add column if not exists registration_deadline timestamptz,
  add column if not exists registration_capacity integer,
  add column if not exists max_attendees_per_family integer not null default 8,
  add column if not exists registration_message text not null default '',
  add column if not exists registration_token uuid not null default gen_random_uuid();

create unique index if not exists events_registration_token_uidx
  on public.events(registration_token);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='events_registration_capacity_check'
      and conrelid='public.events'::regclass
  ) then
    alter table public.events add constraint events_registration_capacity_check
      check (registration_capacity is null or registration_capacity > 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='events_max_attendees_per_family_check'
      and conrelid='public.events'::regclass
  ) then
    alter table public.events add constraint events_max_attendees_per_family_check
      check (max_attendees_per_family between 1 and 20);
  end if;
end $$;

create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  status text not null default 'confirmed'
    check (status in ('confirmed','waitlist','cancelled')),
  verified_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id,family_id)
);

create table if not exists public.event_registration_attendees (
  registration_id uuid not null references public.event_registrations(id) on delete cascade,
  person_type text not null check (person_type in ('guardian','student')),
  person_id uuid not null,
  participant_name text not null,
  created_at timestamptz not null default now(),
  primary key(registration_id,person_type,person_id)
);

create table if not exists public.event_registration_challenges (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  email text not null,
  code_hash text,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  attempts integer not null default 0,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.event_registration_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  verified_email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now()
);

alter table public.event_registrations enable row level security;
alter table public.event_registration_attendees enable row level security;
alter table public.event_registration_challenges enable row level security;
alter table public.event_registration_sessions enable row level security;

create index if not exists event_registrations_event_status_idx
  on public.event_registrations(event_id,status,created_at);
create index if not exists event_registrations_family_idx
  on public.event_registrations(family_id,event_id);
create index if not exists event_registration_attendees_registration_idx
  on public.event_registration_attendees(registration_id);
create index if not exists event_registration_challenges_lookup_idx
  on public.event_registration_challenges(event_id,family_id,created_at desc);
create index if not exists event_registration_sessions_lookup_idx
  on public.event_registration_sessions(event_id,family_id,expires_at);

create or replace function ampa_private.create_snapshot(
  p_reason text default 'scheduled'::text,
  p_user uuid default null::uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public','ampa_private'
as $function$
declare
  snapshot_id uuid;
begin
  insert into ampa_private.backup_snapshots(created_by, reason, payload)
  values (
    p_user,
    p_reason,
    jsonb_build_object(
      'version','5.0',
      'createdAt',now(),
      'settings',(select value from public.app_settings where key='general'),
      'families',coalesce((select jsonb_agg(to_jsonb(f) order by f.family_name) from public.families f),'[]'::jsonb),
      'guardians',coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at) from public.guardians g),'[]'::jsonb),
      'students',coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at) from public.students s),'[]'::jsonb),
      'renewals',coalesce((select jsonb_agg(to_jsonb(r) order by r.academic_year) from public.renewals r),'[]'::jsonb),
      'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.event_date desc,e.created_at desc) from public.events e),'[]'::jsonb),
      'eventFamilies',coalesce((select jsonb_agg(to_jsonb(ef) order by ef.created_at) from public.event_families ef),'[]'::jsonb),
      'eventAttendees',coalesce((select jsonb_agg(to_jsonb(ea) order by ea.created_at) from public.event_attendees ea),'[]'::jsonb),
      'eventRegistrations',coalesce((select jsonb_agg(to_jsonb(er) order by er.created_at) from public.event_registrations er),'[]'::jsonb),
      'eventRegistrationAttendees',coalesce((select jsonb_agg(to_jsonb(era) order by era.created_at) from public.event_registration_attendees era),'[]'::jsonb)
    )
  )
  returning id into snapshot_id;

  delete from ampa_private.backup_snapshots
  where id in (
    select id from ampa_private.backup_snapshots
    order by created_at desc
    offset 30
  );
  return snapshot_id;
end;
$function$;
