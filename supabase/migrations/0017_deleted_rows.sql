-- Nothing is ever really deleted.
--
-- A nightly backup answers "the database is gone". It does not answer the
-- thing that actually happens: somebody deletes one topic on a Wednesday and
-- nobody notices until Saturday. Restoring last night's snapshot to recover
-- one row would throw away three days of marks to get it back.
--
-- So every delete copies the row it removed into an archive first. The row is
-- still gone from the table -- deleting still works, cascades still cascade --
-- but the record of what was in it survives, with who did it and when.
--
-- This is deliberately at the database level, not in the application. It
-- catches the grid, a server action, an import, a migration, and somebody
-- typing DELETE into the SQL editor at two in the morning. An application-level
-- guard catches only the paths somebody remembered to guard.

create table deleted_rows (
  id          bigserial   primary key,
  table_name  text        not null,
  -- Null for the tables keyed by a pair, like progress. The whole row is in
  -- `data` regardless; this is only here to make the common lookup fast.
  row_id      text,
  data        jsonb       not null,
  deleted_at  timestamptz not null default now(),
  deleted_by  uuid        references coaches (id)
);

create index deleted_rows_table_time on deleted_rows (table_name, deleted_at desc);
create index deleted_rows_row on deleted_rows (row_id) where row_id is not null;

comment on table deleted_rows is
  'Every row removed from a tracked table, kept so a mistaken delete is a lookup rather than a restore.';

create or replace function public.archive_deleted_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into deleted_rows (table_name, row_id, data, deleted_by)
  values (
    tg_table_name,
    to_jsonb(old) ->> 'id',
    to_jsonb(old),
    auth.uid()
  );
  return old;
end;
$$;

comment on function public.archive_deleted_row() is
  'Before-delete trigger: copies the row into deleted_rows. security definer so it runs whatever the deleter may touch.';

-- Every table holding something a coach would be upset to lose.
--
-- progress_events is excluded: it is already an append-only history, and it
-- only disappears when the student it belongs to does -- whose own rows are
-- archived here anyway.
--
-- The cascade is the point. Deleting one topic removes a progress row for
-- every student; each of those fires this trigger separately, so the archive
-- ends up holding all 645 of them rather than a single line saying a topic
-- went missing.
do $$
declare
  t text;
begin
  foreach t in array array[
    'programs', 'levels', 'topics', 'students', 'enrollments',
    'progress', 'sessions', 'session_topics', 'attendance',
    'session_notes', 'class_series', 'class_regulars'
  ]
  loop
    execute format(
      'create trigger archive_before_delete
         before delete on public.%I
         for each row execute function public.archive_deleted_row()',
      t
    );
  end loop;
end;
$$;

-- Access: readable by admin, and writable by nobody.
--
-- The insert happens inside a security definer function, which runs as the
-- owner and needs no grant here. So the API roles get select only -- there is
-- no path through which an archived row can be edited or removed by anyone
-- signed into the app. An archive that the person who made the mistake can
-- also delete is not an archive.
alter table deleted_rows enable row level security;

create policy "admin reads" on deleted_rows
  for select to authenticated using (public.is_admin());

grant select on deleted_rows to authenticated;
revoke insert, update, delete on deleted_rows from authenticated;
revoke all on deleted_rows from anon;
revoke all on sequence deleted_rows_id_seq from anon, authenticated;
