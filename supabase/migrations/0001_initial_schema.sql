-- Chess Center Progress Dashboard — initial schema
-- Contains NO student data. Placeholder rows live in supabase/seed/ and are
-- deleted before the real import. Never put seed data in this file.

-- ---------------------------------------------------------------------------
-- Status enum
-- ---------------------------------------------------------------------------
create type progress_status as enum (
  'not_seen',
  'seen',
  'needs_testing',
  'checked_off'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Coaches. Rows are created manually; there is no public signup.
create table coaches (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text        not null,
  created_at   timestamptz not null default now()
);

create table levels (
  id         uuid primary key default gen_random_uuid(),
  number     int         not null unique,
  name       text        not null,
  created_at timestamptz not null default now()
);

-- "order" is reserved in Postgres, hence sort_order.
create table topics (
  id         uuid primary key default gen_random_uuid(),
  level_id   uuid        not null references levels (id) on delete cascade,
  name       text        not null,
  sort_order int         not null,
  created_at timestamptz not null default now(),
  unique (level_id, sort_order)
);

-- is_active supports "remove a student" without destroying their record.
create table students (
  id               uuid primary key default gen_random_uuid(),
  full_name        text        not null,
  current_level_id uuid        references levels (id),
  is_active        boolean     not null default true,
  created_at       timestamptz not null default now()
);

-- The permanent record. No level column: a row's level is reached through
-- topic_id -> topics.level_id. Promoting a student therefore touches nothing
-- here, so past-level history survives automatically.
create table progress (
  student_id uuid            not null references students (id) on delete cascade,
  topic_id   uuid            not null references topics (id)   on delete cascade,
  status     progress_status not null default 'not_seen',
  updated_at timestamptz     not null default now(),
  updated_by uuid            references coaches (id),
  primary key (student_id, topic_id)
);

create table sessions (
  id           uuid primary key default gen_random_uuid(),
  session_date date        not null,
  session_time time,
  created_by   uuid        references coaches (id),
  created_at   timestamptz not null default now()
);

create table attendance (
  session_id uuid        not null references sessions (id) on delete cascade,
  student_id uuid        not null references students (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, student_id)
);

-- Free-text notepad, one per student per session. Coaches use their own
-- shorthand; this is deliberately unstructured.
create table session_notes (
  session_id uuid        not null references sessions (id) on delete cascade,
  student_id uuid        not null references students (id) on delete cascade,
  note_text  text        not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid        references coaches (id),
  primary key (session_id, student_id)
);

-- ---------------------------------------------------------------------------
-- Indexes for the hot paths (session grid, roster, focus mode)
-- ---------------------------------------------------------------------------
create index topics_level_order_idx   on topics (level_id, sort_order);
create index students_active_idx      on students (is_active, full_name);
create index progress_student_idx     on progress (student_id);
create index attendance_session_idx   on attendance (session_id);
create index sessions_date_idx        on sessions (session_date desc);

-- ---------------------------------------------------------------------------
-- Auto-create progress rows
--
-- When a student is added with a level, or moved to a new level, they need a
-- not_seen row for every topic in that level so the grid renders a full row
-- instead of gaps. ON CONFLICT DO NOTHING means existing statuses are never
-- overwritten -- including on a move back to a previously-held level.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_progress_rows(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into progress (student_id, topic_id, status)
  select s.id, t.id, 'not_seen'::progress_status
    from students s
    join topics   t on t.level_id = s.current_level_id
   where s.id = p_student_id
  on conflict (student_id, topic_id) do nothing;
end;
$$;

create or replace function public.students_ensure_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.current_level_id is not null then
    perform public.ensure_progress_rows(new.id);
  end if;
  return new;
end;
$$;

create trigger students_ensure_progress_ins
  after insert on students
  for each row
  execute function public.students_ensure_progress();

create trigger students_ensure_progress_upd
  after update of current_level_id on students
  for each row
  when (new.current_level_id is distinct from old.current_level_id)
  execute function public.students_ensure_progress();

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger progress_touch_updated_at
  before update on progress
  for each row execute function public.touch_updated_at();

create trigger session_notes_touch_updated_at
  before update on session_notes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
--
-- Access model: you must be an authenticated coach to touch anything.
-- ---------------------------------------------------------------------------
create or replace function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from coaches where id = auth.uid());
$$;

alter table coaches       enable row level security;
alter table levels        enable row level security;
alter table topics        enable row level security;
alter table students      enable row level security;
alter table progress      enable row level security;
alter table sessions      enable row level security;
alter table attendance    enable row level security;
alter table session_notes enable row level security;

-- The coaches table gets a plain read-all policy rather than is_coach().
-- is_coach() reads this table, so using it here would be self-referential.
-- Only coaches can authenticate (public signup is disabled), so read-all for
-- authenticated is equivalent in practice. No write policies: coach rows are
-- managed with the secret key, never through the client.
create policy "coaches readable by authenticated"
  on coaches for select to authenticated
  using (true);

create policy "coach full access" on levels        for all to authenticated using (public.is_coach()) with check (public.is_coach());
create policy "coach full access" on topics        for all to authenticated using (public.is_coach()) with check (public.is_coach());
create policy "coach full access" on students      for all to authenticated using (public.is_coach()) with check (public.is_coach());
create policy "coach full access" on progress      for all to authenticated using (public.is_coach()) with check (public.is_coach());
create policy "coach full access" on sessions      for all to authenticated using (public.is_coach()) with check (public.is_coach());
create policy "coach full access" on attendance    for all to authenticated using (public.is_coach()) with check (public.is_coach());
create policy "coach full access" on session_notes for all to authenticated using (public.is_coach()) with check (public.is_coach());
