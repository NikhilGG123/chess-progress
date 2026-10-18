-- A flag that means "look this student up in Jumbula".
--
-- The coaches were offered payment tracking and turned it down. What they
-- asked for instead is one checkbox per student: ticked means something needs
-- attention, and the place to find out what is Jumbula, their registration and
-- payments system.
--
-- That is the better design. No amounts, no balances, no due dates, no card
-- details, and no second source of truth to drift out of step with the system
-- that actually holds the money. This app carries a pointer; Jumbula carries
-- the facts.
--
-- Deliberately no note column. A free-text box beside a child's name is where
-- somebody eventually writes "mum has not paid since April, do not call after
-- six" -- exactly the detail this design exists to keep out of a database four
-- people share. If the flag needs explaining, it is explained in Jumbula.
--
-- Called "follow-up" rather than "payment" throughout, including in the UI.
-- This appears next to children's names on a screen a coach opens in a room
-- with parents in it, and "payment overdue" read over a shoulder is a problem
-- for that family.

alter table students
  add column needs_followup  boolean     not null default false,
  add column followup_set_by uuid        references coaches (id),
  -- Who and when, because "this has been flagged since June and nobody
  -- noticed" is a question somebody will ask.
  add column followup_set_at timestamptz;

comment on column students.needs_followup is
  'Something about this student needs looking at in Jumbula. Carries no detail on purpose.';

-- Only the flagged ones are ever queried as a set, and there are 645 students
-- of whom a handful will be flagged at a time.
create index students_needs_followup on students (needs_followup) where needs_followup;

-- No new policy or grant: these are columns on `students`, which coaches
-- already read and update in full under the policy from 0001. Worth stating
-- plainly rather than leaving the reader to check -- a new *table* would need
-- both a policy and an explicit grant, which is the trap 0003 exists for.
