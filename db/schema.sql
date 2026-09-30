create extension if not exists pgcrypto;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  email text unique,
  name text not null,
  role text not null check (role in ('superadmin','admin','user')),
  password_hash text not null,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_idx on sessions(user_id);
create index if not exists sessions_expiry_idx on sessions(expires_at);

create table if not exists families (
  id uuid primary key default gen_random_uuid(),
  membership_number text not null unique,
  family_name text not null,
  is_active_this_year boolean not null default false,
  registration_academic_year text,
  registration_date date not null default current_date,
  street text not null default '',
  city text not null default '',
  postal_code text not null default '',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists guardians (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  first_name text not null,
  last_name text not null default '',
  relationship text not null check (relationship in ('madre','padre','tutor_legal','otro')),
  dni text,
  birth_date date,
  phone text,
  email text,
  is_main_contact boolean not null default false,
  communications_consent boolean,
  privacy_consent boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists guardians_family_idx on guardians(family_id);

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  first_name text not null,
  last_name text not null default '',
  dni text,
  birth_date date,
  birth_year integer,
  course_offset integer not null default 0,
  group_letter text not null default '',
  academic_year text,
  school text,
  class_name text,
  allergies text,
  special_needs text,
  authorized_photo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists students_family_idx on students(family_id);

create table if not exists renewals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  academic_year text not null,
  status text not null default 'pending' check (status in ('pending','renewed','inactive')),
  renewed_at timestamptz,
  renewed_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(family_id, academic_year)
);
create index if not exists renewals_family_idx on renewals(family_id);
create index if not exists renewals_year_idx on renewals(academic_year);

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete set null,
  entity_type text not null,
  entity_id text,
  entity_label text,
  action text not null,
  summary text not null,
  created_at timestamptz not null default now()
);
create index if not exists activity_entity_idx on activity_log(entity_type, entity_id);
create index if not exists activity_created_idx on activity_log(created_at desc);

create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into app_settings(key, value)
values (
  'general',
  '{"activeAcademicYear":"2026/2027","schoolName":"Colegio San Agustín Granada","associationName":"AMPA Agustinos Granada","nifCif":"","contactEmail":""}'::jsonb
)
on conflict (key) do nothing;
