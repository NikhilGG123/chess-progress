-- Recurring classes
--
-- A class that runs every Wednesday and Friday should be described once, not
-- created by hand each week. A series holds that description; the sessions it
-- produces stay ordinary rows, so attendance, the grid and notes are unchanged
-- and a one-off class still works exactly as before.
--
-- Sessions are materialised rather than computed on the fly. A coach needs to
-- be able to cancel one week, or add a session that is not on the timetable,
-- without fighting a rule that keeps regenerating it.

create table class_series (
  id           uuid primary key default gen_random_uuid(),
  name         text        not null,
  -- 0 = Sunday through 6 = Saturday, matching extract(dow).
  weekdays     int[]       not null check (
                 array_length(weekdays, 1) between 1 and 7
                 and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]
               ),
  session_time time,
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now(),
  created_by   uuid        references coaches (id)
);

alter table sessions
  add column series_id uuid references class_series (id) on delete set null;

-- One session per series per day. This is what makes generation repeatable:
-- running it again fills in only the dates that are missing.
create unique index sessions_series_date_idx
  on sessions (series_id, session_date)
  where series_id is not null;

create index sessions_series_idx on sessions (series_id);

-- ---------------------------------------------------------------------------
-- Materialise a series' classes up to a date.
--
-- Never backfills: generation starts at today, so switching a class from
-- Tuesdays to Thursdays does not invent history. Returns how many were
-- created, which is what the page reports back to the coach.
-- ---------------------------------------------------------------------------
create or replace function public.generate_series_sessions(
  p_series_id uuid,
  p_through   date
)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_created int;
begin
  insert into sessions (session_date, session_time, series_id, created_by)
  select day::date, s.session_time, s.id, s.created_by
    from class_series s
    cross join generate_series(current_date, p_through, interval '1 day') as day
   where s.id = p_series_id
     and s.is_active
     and extract(dow from day)::int = any (s.weekdays)
  on conflict do nothing;

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges. As in 0003, the policies below are the real gate.
-- ---------------------------------------------------------------------------
alter table class_series enable row level security;

create policy "coach full access" on class_series
  for all to authenticated
  using (public.is_coach())
  with check (public.is_coach());

grant select, insert, update, delete on public.class_series to authenticated;
grant execute on function public.generate_series_sessions(uuid, date) to authenticated;
