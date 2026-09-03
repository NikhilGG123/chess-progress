-- ===========================================================================
-- REMOVE ALL PLACEHOLDER DATA
--
-- Run this BEFORE importing the coaches' real roster on Wednesday.
--
-- Every placeholder row was created with a UUID beginning '5eed0000', so this
-- deletes exactly that data and nothing else. Coach rows (000_coaches.sql) use
-- real auth UUIDs and are deliberately left untouched.
--
-- Safe to run more than once.
-- ===========================================================================

begin;

-- Child rows first. Most would cascade, but being explicit means this script
-- is still correct if the foreign keys are ever changed.
delete from session_notes where session_id::text like '5eed0000-%'
                             or student_id::text like '5eed0000-%';

delete from attendance    where session_id::text like '5eed0000-%'
                             or student_id::text like '5eed0000-%';

delete from progress      where student_id::text like '5eed0000-%'
                             or topic_id::text   like '5eed0000-%';

-- Tables added after this script was first written. Missing one leaves rows
-- pointing at students who no longer exist.
delete from progress_events where student_id::text like '5eed0000-%'
                              or topic_id::text   like '5eed0000-%';

delete from session_topics  where session_id::text like '5eed0000-%'
                              or topic_id::text    like '5eed0000-%';

delete from class_regulars  where series_id::text  like '5eed0000-%'
                              or student_id::text  like '5eed0000-%';

delete from enrollments     where student_id::text like '5eed0000-%';

-- Sessions generated from a placeholder series are caught by the series
-- clause as well as their own id, so a regenerated timetable leaves nothing.
delete from sessions      where id::text like '5eed0000-%'
                             or series_id::text like '5eed0000-%';
delete from class_series  where id::text like '5eed0000-%';
delete from students      where id::text like '5eed0000-%';
delete from topics        where id::text like '5eed0000-%';
delete from levels        where id::text like '5eed0000-%';

-- Programmes invented by the seed. 'Chess' is created by migration 0010 and is
-- not demo data, so it is deliberately left alone.
delete from programs      where id::text like '5eed0000-%';

commit;

-- ---------------------------------------------------------------------------
-- Verification — every count must be 0.
-- ---------------------------------------------------------------------------
select 'levels'        as table_name, count(*) from levels        where id::text         like '5eed0000-%'
union all select 'topics',            count(*) from topics        where id::text         like '5eed0000-%'
union all select 'students',          count(*) from students      where id::text         like '5eed0000-%'
union all select 'sessions',          count(*) from sessions      where id::text         like '5eed0000-%'
union all select 'progress',          count(*) from progress      where student_id::text like '5eed0000-%'
union all select 'attendance',        count(*) from attendance    where student_id::text like '5eed0000-%'
union all select 'session_notes',     count(*) from session_notes where student_id::text like '5eed0000-%'
union all select 'class_series',      count(*) from class_series  where id::text         like '5eed0000-%'
union all select 'enrollments',       count(*) from enrollments   where student_id::text like '5eed0000-%'
union all select 'class_regulars',    count(*) from class_regulars where student_id::text like '5eed0000-%'
union all select 'session_topics',    count(*) from session_topics where topic_id::text   like '5eed0000-%'
union all select 'progress_events',   count(*) from progress_events where student_id::text like '5eed0000-%';

-- Coaches should still be present (expect 3):
select count(*) as coaches_remaining from coaches;
