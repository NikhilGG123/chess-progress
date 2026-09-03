-- Classes that never run out
--
-- The centre's classes run indefinitely -- "they are always just on", as Nikhil
-- put it. But sessions are materialised up to a horizon, and topping that
-- horizon up was a button somebody had to remember to press. Nobody would, and
-- the calendar would quietly run dry: the demo had zero upcoming classes for
-- exactly this reason.
--
-- Materialising is still right. A coach has to be able to cancel one week
-- without a rule regenerating it, which a computed schedule cannot offer. What
-- changes is who does the topping up: a nightly job, not a person.
--
-- Safe to run as often as you like. generate_series_sessions only fills in
-- dates that are missing, so a second call in the same minute creates nothing
-- and a cancelled week stays cancelled.

create or replace function public.generate_all_series(p_through date)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_series  record;
  v_created int := 0;
begin
  for v_series in select id from class_series where is_active loop
    v_created := v_created + public.generate_series_sessions(v_series.id, p_through);
  end loop;

  return v_created;
end;
$$;

grant execute on function public.generate_all_series(date) to authenticated;
