-- Chess is no longer the only thing the centre teaches
--
-- Coding classes are coming, and a child may well do both at once. That single
-- fact is why this is a table rather than a label: students.current_level_id
-- can only hold one level, so "Chess Level 2 and Coding Level 1" is
-- unrepresentable. Enrollments replace it.
--
-- Sessions gain a programme too. Without it, a grid cannot tell which of a
-- student's levels it is supposed to be showing.

create table programs (
  id         uuid primary key default gen_random_uuid(),
  name       text        not null unique,
  sort_order int         not null default 1,
  created_at timestamptz not null default now()
);

insert into programs (name, sort_order) values ('Chess', 1);

-- ---------------------------------------------------------------------------
-- Levels belong to a programme. Level 1 of chess and Level 1 of coding are
-- different things, so the number is only unique within a programme.
-- ---------------------------------------------------------------------------
alter table levels add column program_id uuid references programs (id) on delete cascade;
update levels set program_id = (select id from programs where name = 'Chess');
alter table levels alter column program_id set not null;

alter table levels drop constraint levels_number_key;
alter table levels add constraint levels_program_number_key unique (program_id, number);

-- ---------------------------------------------------------------------------
-- A class belongs to a programme
-- ---------------------------------------------------------------------------
alter table sessions add column program_id uuid references programs (id);
update sessions set program_id = (select id from programs where name = 'Chess');
alter table sessions alter column program_id set not null;

alter table class_series add column program_id uuid references programs (id);
update class_series set program_id = (select id from programs where name = 'Chess');
alter table class_series alter column program_id set not null;

create index sessions_program_idx on sessions (program_id);

-- ---------------------------------------------------------------------------
-- Enrollment: one row per student per programme, holding the level they are
-- currently at in it.
-- ---------------------------------------------------------------------------
create table enrollments (
  student_id uuid        not null references students (id) on delete cascade,
  program_id uuid        not null references programs (id) on delete cascade,
  level_id   uuid        references levels (id),
  created_at timestamptz not null default now(),
  primary key (student_id, program_id)
);

create index enrollments_level_idx on enrollments (level_id);

insert into enrollments (student_id, program_id, level_id)
select s.id, (select id from programs where name = 'Chess'), s.current_level_id
  from students s
 where s.current_level_id is not null;

-- ---------------------------------------------------------------------------
-- The "fill in a blank row for every topic" trigger moves from students to
-- enrollments, since that is now where a level is recorded.
-- ---------------------------------------------------------------------------
drop trigger if exists students_ensure_progress_ins on students;
drop trigger if exists students_ensure_progress_upd on students;

create or replace function public.ensure_progress_rows(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into progress (student_id, topic_id, status)
  select e.student_id, t.id, 'not_seen'::progress_status
    from enrollments e
    join topics t on t.level_id = e.level_id
   where e.student_id = p_student_id
  on conflict (student_id, topic_id) do nothing;
end;
$$;

create or replace function public.enrollments_ensure_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.level_id is not null then
    perform public.ensure_progress_rows(new.student_id);
  end if;
  return new;
end;
$$;

create trigger enrollments_ensure_progress_ins
  after insert on enrollments
  for each row
  execute function public.enrollments_ensure_progress();

create trigger enrollments_ensure_progress_upd
  after update of level_id on enrollments
  for each row
  when (new.level_id is distinct from old.level_id)
  execute function public.enrollments_ensure_progress();

-- Adding a topic must reach students through their enrollment now.
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

  insert into progress (student_id, topic_id, status)
  select e.student_id, v_id, 'not_seen'::progress_status
    from enrollments e
   where e.level_id = p_level_id
  on conflict (student_id, topic_id) do nothing;

  return v_id;
end;
$$;

alter table students drop column current_level_id;

-- ---------------------------------------------------------------------------
-- Security. New tables inherit nothing; see 0003 and 0009.
-- ---------------------------------------------------------------------------
alter table programs    enable row level security;
alter table enrollments enable row level security;

create policy "coach reads"   on programs for select to authenticated using (public.is_coach());
create policy "coach creates" on programs for insert to authenticated with check (public.is_coach());
create policy "coach edits"   on programs for update to authenticated using (public.is_coach()) with check (public.is_coach());
-- Deleting a programme cascades to its levels, and through them to every topic.
create policy "admin deletes" on programs for delete to authenticated using (public.is_admin());

create policy "coach reads"   on enrollments for select to authenticated using (public.is_coach());
create policy "coach creates" on enrollments for insert to authenticated with check (public.is_coach());
create policy "coach edits"   on enrollments for update to authenticated using (public.is_coach()) with check (public.is_coach());
-- Unenrolling destroys nothing: progress hangs off topics, so re-enrolling
-- restores exactly what was there.
create policy "coach deletes" on enrollments for delete to authenticated using (public.is_coach());

grant select, insert, update, delete on public.programs    to authenticated;
grant select, insert, update, delete on public.enrollments to authenticated;
grant select, insert, update, delete on public.programs    to service_role;
grant select, insert, update, delete on public.enrollments to service_role;
revoke all on public.programs    from anon;
revoke all on public.enrollments from anon;
revoke truncate on public.programs, public.enrollments from authenticated;
