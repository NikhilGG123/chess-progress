-- Close two gaps found auditing the live database
--
-- 1. TRUNCATE is not filtered by row-level security. A policy that restricts
--    which rows you may delete does nothing about a statement that empties the
--    table, so holding TRUNCATE is holding "erase everything" regardless of
--    what the policies say. Nobody needs it through the API.
--
-- 2. class_series was created in 0004, after 0003 revoked anon's privileges,
--    so it inherited a fresh set and anon ended up holding TRUNCATE on it.
--    Any table added later would do the same, hence the default privileges
--    below as well as the one-off revoke.
--
-- Also narrows the coaches table: the app only ever needs the signed-in
-- coach's own row, and a signed-in stranger should not be able to enumerate
-- the staff.

-- ---------------------------------------------------------------------------
-- Anonymous requests get nothing in this schema, now and in future
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- ---------------------------------------------------------------------------
-- Coaches keep row access but lose the table-wide hammer
-- ---------------------------------------------------------------------------
revoke truncate on all tables in schema public from authenticated;
alter default privileges in schema public revoke truncate on tables from authenticated;

-- ---------------------------------------------------------------------------
-- service_role is the admin path used by import and maintenance tooling. It
-- bypasses RLS by design; it was left without the ordinary grants on tables
-- created after 0003, which would fail confusingly at import time.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on all tables in schema public to service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

-- ---------------------------------------------------------------------------
-- A coach reads their own row, not the staff list
--
-- is_coach() is security definer and so is unaffected; it is the only thing
-- that needs to see other rows.
-- ---------------------------------------------------------------------------
drop policy if exists "coaches readable by authenticated" on coaches;

create policy "coach reads own row"
  on coaches for select to authenticated
  using (id = auth.uid());
