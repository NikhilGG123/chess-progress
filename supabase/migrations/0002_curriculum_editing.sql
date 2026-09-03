-- Curriculum editing helpers
--
-- The coaches maintain their own topic lists from the Curriculum page, so both
-- of these run as the caller (security invoker): row-level security still
-- applies, and only a coach can move or add anything.

-- ---------------------------------------------------------------------------
-- Reorder a topic by one place.
--
-- Done in the database because topics carry a unique (level_id, sort_order):
-- a swap performed as two client round trips would either collide half way or
-- leave a gap if the second call never arrived. Inside one function it is a
-- single transaction that cannot land half done.
-- ---------------------------------------------------------------------------
create or replace function public.move_topic(p_topic_id uuid, p_direction int)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_level       uuid;
  v_order       int;
  v_other_id    uuid;
  v_other_order int;
begin
  select level_id, sort_order into v_level, v_order
    from topics where id = p_topic_id;

  if v_level is null then
    return;
  end if;

  if p_direction < 0 then
    select id, sort_order into v_other_id, v_other_order
      from topics
     where level_id = v_level and sort_order < v_order
     order by sort_order desc
     limit 1;
  else
    select id, sort_order into v_other_id, v_other_order
      from topics
     where level_id = v_level and sort_order > v_order
     order by sort_order asc
     limit 1;
  end if;

  -- Already at the top or the bottom of its level.
  if v_other_id is null then
    return;
  end if;

  -- The unique constraint is checked per statement, so park the moving row on
  -- a value no real topic can hold before writing the swap.
  update topics set sort_order = -1            where id = p_topic_id;
  update topics set sort_order = v_order       where id = v_other_id;
  update topics set sort_order = v_other_order where id = p_topic_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Append a topic to a level.
--
-- Computing max(sort_order) + 1 in the client would let two coaches adding a
-- topic at the same moment pick the same number and one of them lose the write
-- to the unique constraint.
-- ---------------------------------------------------------------------------
create or replace function public.add_topic(p_level_id uuid, p_name text)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into topics (level_id, name, sort_order)
  select p_level_id,
         p_name,
         coalesce(max(sort_order), 0) + 1
    from topics
   where level_id = p_level_id
  returning id into v_id;

  -- Every student sitting in this level needs a row for the new topic,
  -- otherwise their grid renders one cell short.
  insert into progress (student_id, topic_id, status)
  select s.id, v_id, 'not_seen'::progress_status
    from students s
   where s.current_level_id = p_level_id
  on conflict (student_id, topic_id) do nothing;

  return v_id;
end;
$$;
