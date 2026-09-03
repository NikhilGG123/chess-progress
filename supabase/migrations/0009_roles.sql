-- Two kinds of coach
--
-- The centre has no automatic backups on the free tier, so a delete made by
-- accident during a class is not recoverable from anything but last night's
-- snapshot. Rather than making every coach cautious, the destructive acts are
-- moved behind a separate Admin login that nobody is signed into by default.
--
-- The line is drawn by blast radius, not by how "advanced" an action feels:
--
--   a class (session)      any coach   affects one day; cancelling classes is routine
--   a repeating class      any coach   same, and it spares sessions with attendance
--   a topic                Admin       cascades to every student's record of it
--   a level                Admin       cascades to every topic beneath it
--   a student              Admin       true deletion; "Remove" on the roster is
--                                      deactivation and stays open to coaches
--   progress rows          Admin       only ever removed by cascade in practice
--
-- Coaches keep delete on attendance -- un-checking someone in is routine -- and
-- on their own session notes.

create type coach_role as enum ('coach', 'admin');

alter table coaches add column role coach_role not null default 'coach';

-- Mirrors public.is_coach() in 0001. Security definer so it can read the
-- coaches table regardless of that table's own policies.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from coaches where id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Replace the blanket "coach full access" policies with per-command ones.
-- Reading, creating and editing stay at coach level everywhere; only DELETE
-- differs, table by table.
-- ---------------------------------------------------------------------------
do $$
declare
  v_table text;
  v_admin_only boolean;
begin
  foreach v_table in array array[
    'levels', 'topics', 'students', 'progress',
    'sessions', 'attendance', 'session_notes', 'class_series'
  ] loop
    v_admin_only := v_table in ('levels', 'topics', 'students', 'progress');

    execute format('drop policy if exists "coach full access" on public.%I', v_table);

    execute format(
      'create policy "coach reads" on public.%I for select to authenticated
         using (public.is_coach())', v_table);
    execute format(
      'create policy "coach creates" on public.%I for insert to authenticated
         with check (public.is_coach())', v_table);
    execute format(
      'create policy "coach edits" on public.%I for update to authenticated
         using (public.is_coach()) with check (public.is_coach())', v_table);

    if v_admin_only then
      execute format(
        'create policy "admin deletes" on public.%I for delete to authenticated
           using (public.is_admin())', v_table);
    else
      execute format(
        'create policy "coach deletes" on public.%I for delete to authenticated
           using (public.is_coach())', v_table);
    end if;
  end loop;
end
$$;
