-- Joining scattered pages into one child
--
-- Their system holds one page per student per level: 654 rows for roughly 490
-- children. Tim: "I will need to go through manually and assign each topic
-- sheet (Rohan level 2, Rohan M level 3, etc) to their appropriate profile."
--
-- This is that operation. It cannot be automated -- most pages carry a bare
-- first name, and merging the wrong two would fuse two children's records --
-- so a coach decides and this does the work.
--
-- WHO MAY DO IT. Coaches, not only Admin. It deletes a student row, which
-- would normally put it behind the Admin account, but nothing is lost when it
-- does: every mark, class, note and attendance moves to the surviving record
-- first. It is a data-cleanup chore the coaches have to work through over
-- weeks, and putting the Admin password in their hands for it would undo the
-- reason that account exists.

create table merge_dismissals (
  -- Ordered so a pair cannot be dismissed twice under two names.
  student_a    uuid        not null references students (id) on delete cascade,
  student_b    uuid        not null references students (id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  dismissed_by uuid        references coaches (id),
  primary key (student_a, student_b),
  check (student_a < student_b)
);

alter table merge_dismissals enable row level security;

create policy "coach reads"   on merge_dismissals for select to authenticated using (public.is_coach());
create policy "coach creates" on merge_dismissals for insert to authenticated with check (public.is_coach());
create policy "coach deletes" on merge_dismissals for delete to authenticated using (public.is_coach());

grant select, insert, delete on public.merge_dismissals to authenticated;
grant select, insert, update, delete on public.merge_dismissals to service_role;
revoke all on public.merge_dismissals from anon;

-- ---------------------------------------------------------------------------
-- Merge p_absorb into p_keep.
--
-- Everything moves before anything is deleted, so a failure at any point rolls
-- back to two intact records rather than one damaged one.
-- ---------------------------------------------------------------------------
create or replace function public.merge_students(
  p_keep      uuid,
  p_absorb    uuid,
  p_full_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_coach() then
    raise exception 'Only a coach can merge student records';
  end if;

  if p_keep = p_absorb then
    raise exception 'Cannot merge a student into themselves';
  end if;

  if not exists (select 1 from students where id = p_keep)
     or not exists (select 1 from students where id = p_absorb) then
    raise exception 'Both students must exist';
  end if;

  -- Attendance: the same child cannot be in one class twice, so collisions are
  -- simply dropped.
  insert into attendance (session_id, student_id, created_at)
  select session_id, p_keep, created_at from attendance where student_id = p_absorb
  on conflict (session_id, student_id) do nothing;
  delete from attendance where student_id = p_absorb;

  -- Notes: both are somebody's writing about a real lesson, so a collision
  -- keeps both rather than picking a winner.
  insert into session_notes (session_id, student_id, note_text, updated_at)
  select session_id, p_keep, note_text, updated_at
    from session_notes where student_id = p_absorb
  on conflict (session_id, student_id) do update
    set note_text = session_notes.note_text || E'\n' || excluded.note_text;
  delete from session_notes where student_id = p_absorb;

  insert into class_regulars (series_id, student_id, created_at)
  select series_id, p_keep, created_at from class_regulars where student_id = p_absorb
  on conflict (series_id, student_id) do nothing;
  delete from class_regulars where student_id = p_absorb;

  -- History carries over wholesale: it is a log, and there is nothing to
  -- collide on.
  update progress_events set student_id = p_keep where student_id = p_absorb;

  -- Progress. Rows for different levels never collide, which is the common
  -- case. Where the same topic exists on both pages, keep the mark that is
  -- further along -- a child who reached Complete on one page did reach it,
  -- and the enum is ordered so the comparison means what it reads as.
  insert into progress (student_id, topic_id, status, updated_at, updated_by)
  select p_keep, topic_id, status, updated_at, updated_by
    from progress where student_id = p_absorb
  on conflict (student_id, topic_id) do update
    set status = case
                   when excluded.status > progress.status then excluded.status
                   else progress.status
                 end;
  delete from progress where student_id = p_absorb;

  -- Enrollment: one per programme. Where both pages are in the same
  -- programme, the higher level wins, since that is where the child got to.
  -- Comma-style FROM rather than JOIN ... ON: an UPDATE cannot join back to
  -- its own target table inside the FROM clause, so the comparison against the
  -- kept row's level has to live in WHERE.
  update enrollments e
     set level_id = a.level_id
    from enrollments a, levels la, levels lk
   where a.student_id = p_absorb
     and e.student_id = p_keep
     and e.program_id = a.program_id
     and la.id = a.level_id
     and lk.id = e.level_id
     and la.number > lk.number;

  insert into enrollments (student_id, program_id, level_id, created_at)
  select p_keep, program_id, level_id, created_at
    from enrollments where student_id = p_absorb
  on conflict (student_id, program_id) do nothing;
  delete from enrollments where student_id = p_absorb;

  -- The proper name, if the coach supplied one: "these two pages are the same
  -- child, and she is Rohan Mistry".
  if p_full_name is not null and length(trim(p_full_name)) > 0 then
    update students set full_name = trim(p_full_name) where id = p_keep;
  end if;

  -- A page that was active anywhere makes the survivor active.
  update students k
     set is_active = true
    from students a
   where k.id = p_keep and a.id = p_absorb and a.is_active;

  delete from merge_dismissals
   where student_a = p_absorb or student_b = p_absorb;

  delete from students where id = p_absorb;
end;
$fn$;

grant execute on function public.merge_students(uuid, uuid, text) to authenticated;
