-- A repeating class needs a start date
--
-- Without one, generation could only ever begin today, so a coach setting up
-- next term's timetable in the holidays got nothing until term started. The
-- start date is the coach's stated intent, so generation honours it in both
-- directions: a future date waits, a past date fills in the classes that have
-- already happened, which is how a term gets recorded after the fact.

alter table class_series
  add column start_date date not null default current_date;

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
    cross join generate_series(s.start_date, p_through, interval '1 day') as day
   where s.id = p_series_id
     and s.is_active
     and extract(dow from day)::int = any (s.weekdays)
  on conflict do nothing;

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;
