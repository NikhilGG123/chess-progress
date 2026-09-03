-- Publish the tables two coaches can edit at the same time
--
-- Brad and Tim work the same class from two devices. Without this, the later
-- write silently wins and neither screen shows the other's marks until it is
-- reloaded -- and a session note, which saves as whole text, loses a paragraph
-- rather than a cell.
--
-- Realtime respects row-level security: a subscriber is sent a change only if
-- their own policies would have let them read the row, so publishing these
-- tables does not widen access. Nothing here is readable without a coach
-- account.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['progress', 'attendance', 'session_notes'] loop
    if not exists (
      select 1
        from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end
$$;

-- Send the whole row on update and delete, not just the primary key. Without
-- it a deleted attendance row arrives too thin to match against the session on
-- screen, and an updated note arrives without the text it replaced.
alter table public.progress      replica identity full;
alter table public.session_notes replica identity full;
alter table public.attendance    replica identity full;
