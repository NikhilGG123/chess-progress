-- Table privileges for the API roles
--
-- Row-level security decides *which rows* a request may touch. It does not
-- grant the underlying table privilege, and Postgres checks the GRANT first.
-- Tables created through the Supabase dashboard inherit grants from that
-- role's default privileges; these were created over a direct psql-style
-- connection as `postgres`, which does not, so every policy in 0001 sat on a
-- table the API roles could not read at all:
--
--   permission denied for table students   (42501)
--
-- Granting broadly here is safe precisely because the policies are the real
-- gate: every one of them requires public.is_coach().

grant usage on schema public to authenticated;

-- Coaches is read-only from the client. Rows are created with the secret key
-- when an account is set up, never through the app.
grant select on public.coaches to authenticated;

grant select, insert, update, delete on
  public.levels,
  public.topics,
  public.students,
  public.progress,
  public.sessions,
  public.attendance,
  public.session_notes
to authenticated;

grant execute on function public.move_topic(uuid, int)  to authenticated;
grant execute on function public.add_topic(uuid, text)  to authenticated;

-- Anonymous requests get nothing: there are no public pages beyond /login,
-- and the login form talks to the auth API rather than to these tables.
revoke all on all tables in schema public from anon;

-- Tables added by later migrations inherit the same grants, so this class of
-- failure cannot come back.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
