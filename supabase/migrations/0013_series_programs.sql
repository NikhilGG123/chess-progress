-- Generated classes must carry their programme
--
-- 0010 made sessions.program_id NOT NULL, but generate_series_sessions still
-- inserted without it, so "Extend 8 weeks" would have failed at runtime with a
-- constraint error. The tests caught it before anyone pressed the button.
--
-- A generated class simply inherits the programme of the series that produced
-- it, which is the only sensible answer.

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
  insert into sessions (session_date, session_time, series_id, created_by, program_id)
  select day::date, s.session_time, s.id, s.created_by, s.program_id
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
