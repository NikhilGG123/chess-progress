-- Regulars, and what a class actually covered
--
-- Two small tables that carry most of what the coaches asked for after seeing
-- the demo.
--
-- REGULARS. Nearly everyone in a given class attends nearly every week -- in
-- their old tool every name carried a star. Ticking thirty of them one at a
-- time, every session, is the kind of friction that gets an app abandoned. The
-- star belongs to the *class*, not the student: "the Wednesday Level 1 regulars"
-- is the useful set, and drop-ins remain ordinary students who get checked in
-- by hand.
--
-- COVERAGE. Recording which topics a class covered gives the session log
-- something worth reading, and it is what the one-press advance below works
-- from -- so nothing is ever marked against a topic the class did not touch.

create table class_regulars (
  series_id  uuid        not null references class_series (id) on delete cascade,
  student_id uuid        not null references students (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (series_id, student_id)
);

create index class_regulars_student_idx on class_regulars (student_id);

create table session_topics (
  session_id uuid        not null references sessions (id) on delete cascade,
  topic_id   uuid        not null references topics (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, topic_id)
);

create index session_topics_topic_idx on session_topics (topic_id);

-- ---------------------------------------------------------------------------
-- One press: everyone present moves one step on the topics covered today.
--
-- The ceiling is deliberate and absolute. Attending a lesson is evidence a
-- student has *seen* something; it is not evidence they understood it, and it
-- is certainly not a test result. So this only ever does:
--
--     none -> seen once -> seen multiple times
--
-- and stops. Test and Complete are a coach's judgement about a particular
-- child and are only ever set by hand. Nothing is regressed either: a student
-- already at T or X is left exactly as they are.
--
-- Idempotent in the sense that matters: pressing it twice in one class moves
-- everyone twice, which is what "we covered it twice" would mean, but it can
-- never walk past R however many times it is pressed.
-- ---------------------------------------------------------------------------
create or replace function public.advance_session_topics(p_session_id uuid)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_changed int;
begin
  update progress p
     set status = case p.status
                    when 'not_seen'  then 'seen_once'::progress_status
                    when 'seen_once' then 'seen_multiple'::progress_status
                  end,
         updated_at = now(),
         updated_by = auth.uid()
    from attendance a
    join sessions s   on s.id = a.session_id
    join enrollments e on e.student_id = a.student_id
                      and e.program_id = s.program_id
    join session_topics st on st.session_id = a.session_id
    join topics t on t.id = st.topic_id
                 and t.level_id = e.level_id
   where a.session_id = p_session_id
     and p.student_id = a.student_id
     and p.topic_id   = t.id
     and p.status in ('not_seen', 'seen_once');

  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

-- ---------------------------------------------------------------------------
-- Security
-- ---------------------------------------------------------------------------
alter table class_regulars enable row level security;
alter table session_topics enable row level security;

create policy "coach reads"   on class_regulars for select to authenticated using (public.is_coach());
create policy "coach creates" on class_regulars for insert to authenticated with check (public.is_coach());
create policy "coach edits"   on class_regulars for update to authenticated using (public.is_coach()) with check (public.is_coach());
create policy "coach deletes" on class_regulars for delete to authenticated using (public.is_coach());

create policy "coach reads"   on session_topics for select to authenticated using (public.is_coach());
create policy "coach creates" on session_topics for insert to authenticated with check (public.is_coach());
create policy "coach edits"   on session_topics for update to authenticated using (public.is_coach()) with check (public.is_coach());
create policy "coach deletes" on session_topics for delete to authenticated using (public.is_coach());

grant select, insert, update, delete on public.class_regulars to authenticated;
grant select, insert, update, delete on public.session_topics to authenticated;
grant select, insert, update, delete on public.class_regulars to service_role;
grant select, insert, update, delete on public.session_topics to service_role;
grant execute on function public.advance_session_topics(uuid) to authenticated;
revoke all on public.class_regulars, public.session_topics from anon;
revoke truncate on public.class_regulars, public.session_topics from authenticated;
