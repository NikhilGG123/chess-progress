-- What changed, when, and in whose class
--
-- `progress` holds where a student stands now; it cannot answer "what did she
-- actually get out of last Wednesday". The coaches asked to see progress
-- against dates, which needs the changes kept, not just the latest value.
--
-- Recorded by a trigger rather than by the application, so every path is
-- covered: the grid, the one-press advance, an import, or a coach's own SQL.
-- Anything that writes a status writes its history.

create table progress_events (
  id          bigint generated always as identity primary key,
  student_id  uuid            not null references students (id) on delete cascade,
  topic_id    uuid            not null references topics (id)   on delete cascade,
  from_status progress_status,
  to_status   progress_status not null,
  -- Which class it happened in, when it happened in one at all.
  session_id  uuid            references sessions (id) on delete set null,
  changed_at  timestamptz     not null default now(),
  changed_by  uuid            references coaches (id)
);

create index progress_events_student_idx on progress_events (student_id, changed_at desc);
create index progress_events_session_idx on progress_events (session_id);

-- The session is passed through a transaction-local setting rather than as a
-- column on `progress`, because it is a property of the *change*, not of the
-- student's current state.
create or replace function public.record_progress_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session uuid;
begin
  -- Nothing happened.
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  -- The blank rows created when a student joins a level are not history; they
  -- are the absence of it. Logging 22 "became none" events per enrollment
  -- would bury the real entries.
  if tg_op = 'INSERT' and new.status = 'not_seen' then
    return new;
  end if;

  begin
    v_session := nullif(current_setting('app.session_id', true), '')::uuid;
  exception when others then
    v_session := null;
  end;

  insert into progress_events (
    student_id, topic_id, from_status, to_status, session_id, changed_by
  )
  values (
    new.student_id,
    new.topic_id,
    case when tg_op = 'UPDATE' then old.status else null end,
    new.status,
    v_session,
    -- auth.uid() is null for maintenance scripts, and may be a user with no
    -- coaches row; either way this must not break the write.
    (select id from coaches where id = auth.uid())
  );

  return new;
end;
$$;

create trigger progress_record_event
  after insert or update of status on progress
  for each row
  execute function public.record_progress_event();

-- ---------------------------------------------------------------------------
-- One entry point for marking a cell, so the class it happened in is recorded
-- with it. Security invoker: the coach's own policies still apply.
-- ---------------------------------------------------------------------------
create or replace function public.set_progress(
  p_student_id uuid,
  p_topic_id   uuid,
  p_status     progress_status,
  p_session_id uuid default null
)
returns void
language plpgsql
set search_path = public
as $$
begin
  perform set_config('app.session_id', coalesce(p_session_id::text, ''), true);

  insert into progress (student_id, topic_id, status, updated_by)
  values (
    p_student_id,
    p_topic_id,
    p_status,
    (select id from coaches where id = auth.uid())
  )
  on conflict (student_id, topic_id) do update
     set status     = excluded.status,
         updated_at = now(),
         updated_by = excluded.updated_by;
end;
$$;

-- The bulk advance gets the same treatment, so a class's worth of marks is
-- attributed to that class.
create or replace function public.advance_session_topics(p_session_id uuid)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_changed int;
begin
  perform set_config('app.session_id', p_session_id::text, true);

  update progress p
     set status = case p.status
                    when 'not_seen'  then 'seen_once'::progress_status
                    when 'seen_once' then 'seen_multiple'::progress_status
                  end,
         updated_at = now(),
         updated_by = (select id from coaches where id = auth.uid())
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

alter table progress_events enable row level security;

create policy "coach reads" on progress_events
  for select to authenticated using (public.is_coach());
-- History is written by the trigger, never by hand, and is never edited.
create policy "admin deletes" on progress_events
  for delete to authenticated using (public.is_admin());

grant select on public.progress_events to authenticated;
grant select, insert, update, delete on public.progress_events to service_role;
grant execute on function public.set_progress(uuid, uuid, progress_status, uuid) to authenticated;
revoke all on public.progress_events from anon;
