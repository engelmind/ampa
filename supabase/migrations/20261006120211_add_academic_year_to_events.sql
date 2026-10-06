alter table public.events
  add column if not exists academic_year text;

update public.events
set academic_year =
  case
    when extract(month from event_date) >= 9
      then extract(year from event_date)::int::text || '/' || (extract(year from event_date)::int + 1)::text
    else (extract(year from event_date)::int - 1)::text || '/' || extract(year from event_date)::int::text
  end
where academic_year is null or btrim(academic_year) = '';

alter table public.events
  alter column academic_year set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_academic_year_format_check'
      and conrelid = 'public.events'::regclass
  ) then
    alter table public.events
      add constraint events_academic_year_format_check
      check (academic_year ~ '^[0-9]{4}/[0-9]{4}$');
  end if;
end $$;

create index if not exists events_academic_year_date_idx
  on public.events(academic_year desc, event_date desc);
