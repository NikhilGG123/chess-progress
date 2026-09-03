-- The coaches' five marks, corrected
--
-- The app shipped with four statuses and, critically, with X meaning "not
-- seen". It means the opposite. Confirmed with Brad and Tim on 2026-09-02,
-- which matches what their workbook already implied: its grid formula writes X
-- when the lesson log recorded that topic as done, and X outnumbers the tick
-- 3400 to 34 -- under the old reading, nobody at the centre had ever finished
-- anything.
--
-- The real key, in their order of progression:
--
--   (blank)  none
--   I        seen one time
--   R        seen multiple times      <- new, was missing entirely
--   T        test
--   X        complete                 <- was "not seen"
--
-- RENAME preserves every existing row, so no data migration is needed:
-- 'seen' rows become 'seen_once' and 'checked_off' rows become 'complete',
-- which is what they always meant.
--
-- This file contains nothing but the type change. Postgres permits ADD VALUE
-- inside a transaction but forbids *using* the new value in that same
-- transaction, and apply-sql.mjs wraps each file in one -- so anything that
-- writes 'seen_multiple' has to live in a later migration.

alter type progress_status rename value 'seen' to 'seen_once';
alter type progress_status rename value 'checked_off' to 'complete';
alter type progress_status add value 'seen_multiple' after 'seen_once';
