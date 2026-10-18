# Chess Progress

[![CI](https://github.com/NikhilGG123/chess-progress/actions/workflows/ci.yml/badge.svg)](https://github.com/NikhilGG123/chess-progress/actions/workflows/ci.yml)

**Student progress tracking for a chess academy** — replacing the shared
spreadsheet three coaches ran their classes from.

[**Try the live demo →**](https://chess-dashboard-mu.vercel.app) · credentials
are on the sign-in page · every student in it is invented

<!-- SCREENSHOT 1: docs/screenshots/grid.png -->

A coach opens the evening's class, checks in who turned up, ticks what the
lesson covered, and marks each student against the topics in their level. The
record is permanent and belongs to the student, not to a tab in a workbook.

The academy's own instance runs this same code against their real records:
**645 students, 12,398 marks, 2,196 attendance records and 523 classes**,
migrated out of the system they had before.

---

## The problem

Four levels of chess, sixteen to twenty-two topics each, fourteen classes a
week across four evenings. The record of who had learned what lived in an Excel
workbook with a tab per level — so a child who moved up got a **new row on a
new tab**, and their old one stayed behind. After years of this, one child
could be three separate records, filed under "Rohan", "Rohan M" and "Rohan
Mistry", because for a long time only first names were written down.

Nothing in that workbook could answer *where does this child stand?* without
a coach reading across three tabs mid-lesson.

---

## Running a class

<!-- SCREENSHOT 2: docs/screenshots/class.png -->

1. **Open the class.** It's already on the calendar — the timetable repeats
   itself and generates eight weeks ahead.
2. **Check in.** Regulars are starred, so that's one button; the search box is
   there for drop-ins, who are common enough to matter.
3. **Tick what the lesson covered.**
4. **Press *Everyone here saw these*.** Every attendee moves one step on those
   topics — blank → `I` → `R`, and **no further**.
5. **Mark individuals by hand** where judgement applies: `T` when a student is
   ready to be tested, `X` when they have passed.

Step 4 stopping at `R` is the important one. Attending a lesson is evidence a
student *saw* something. It is not evidence they understood it, and no bulk
action in this app will ever claim otherwise.

### The five marks

| Mark | Stored as | Means |
| :---: | --- | --- |
| – | `not_seen` | not covered with this student yet |
| `I` | `seen_once` | seen once |
| `R` | `seen_multiple` | seen several times |
| `T` | `needs_testing` | ready to be tested |
| `X` | `complete` | tested and finished |

**`X` means complete.** Read as a cross it means the exact opposite, and this
app shipped once with that mistake — enough to invert every student's record on
import. It was caught by cross-checking three independent sources: the coaches,
the workbook's own grid formula, and the 3,702 rows their old database labelled
*Completed*. A test pins it now.

---

## The permanent record

<!-- SCREENSHOT 3: docs/screenshots/student.png -->

Every mark that changes is written to a history table with the class it changed
in, by a database trigger — so the grid, the bulk advance, an import and
somebody's ad-hoc SQL are all covered by the same guarantee.

Promoting a student touches no progress row at all, so their old level survives
as history for free. That falls out of the schema: progress hangs off the
**topic**, and a topic knows its own level.

---

## One child, several pages

<!-- SCREENSHOT 4: docs/screenshots/merge.png -->

The obvious move is to merge same-name records automatically. Tested against
attendance history, that turns out to be unsafe:

- **126** same-name groups sat at different levels
- **10** attended in separate periods — consistent with one child moving up
- **7** attended *in the same week* on two different pages
- **109** had too little attendance to tell either way

And the 7 prove nothing, because **27 students legitimately attend two
classes**. There is no reliable second key, and fusing two children's records
is far worse than leaving them apart.

So nothing is merged automatically. The app ships a review screen instead: one
name group at a time, with levels, attendance dates and progress counts on
screen, and a coach decides. Merging moves every mark, class, note and
attendance record to the surviving student before anything is deleted; where
the same topic exists on both, the mark further along wins.

---

## Engineering decisions worth reading

**Row-level security is only half of it.** A policy decides *which rows*; a
`GRANT` decides whether you may touch the table at all, and Postgres checks
that first. Tables created over a direct connection inherit neither — which is
how a signed-in coach once got `permission denied for table students`. Every
table now carries an explicit grant block.

**The API truncates at 1,000 rows in silence.** No error, no flag, just a short
array. A class of 46 students on a 22-topic level is 1,012 progress rows, so
the tail would have rendered blank and coaches would have watched their marks
apparently vanish. Everything that scales with the roster now pages explicitly.

**Roles are drawn around blast radius, not seniority.** Coaches can delete a
class, because they do it routinely and making them fetch an admin password
guarantees that password ends up on a sticky note. Deleting a *topic* cascades
into every student's record, so it waits behind an account nobody is signed
into by default. Deletes state what will be lost — "3 students checked in, 2
notes" — rather than asking "are you sure?", which is answered yes by reflex.

**Database tests run inside a transaction and roll back**, which is why they
can be pointed at the production database. Every bug that ever reached a page
in this project lived in that layer: a policy without a grant, a trigger that
had to fire, a realtime socket that reported `SUBSCRIBED` and then delivered
nothing because it carried the wrong token. None of it is visible to a type
checker.

**No real student data has ever been in this repository** — and
`scripts/check-names.mjs` tests that rather than trusting it, checking every
name on the academy's enrolment list against every tracked file. It found three
that had crept into code comments as examples.

---

## Stack

**TypeScript · Next.js 16** (App Router, server components, server actions) **·
React 19 · PostgreSQL** via **Supabase** (auth, row-level security, realtime)
**· Python** (workbook parser) **· Tailwind CSS v4 · Vitest**

Deployed on **Vercel** (this demo) and **Cloudflare Workers** via OpenNext (the
academy's instance — Vercel's free tier excludes commercial use). A nightly
**GitHub Action** takes a backup and keeps the class calendar generated eight
weeks ahead.

Schema, policies and functions are eighteen plain SQL migrations in
`supabase/migrations/`, applied by hand and in order.

---

## Running it

```bash
npm install
cp .env.example .env.local     # fill in from the Supabase dashboard
npm run dev                    # http://localhost:3000
```

In a fresh Supabase project, paste `supabase/setup_all.sql` into the SQL
editor — every migration plus the coach rows plus the demo data, joined into
one file. Regenerate it with `bash supabase/build_setup_all.sh`.

There is no public sign-up. Coach accounts are created in the Supabase console
and given a row in `coaches`.

| Command | |
| --- | --- |
| `npm run dev` | development server |
| `npm run build` | production build, including a full type check |
| `npm test` | 65 tests — unit, plus database tests when `.env.local` has credentials |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript alone, without a build |
| `npm run format` | Prettier; `format:check` is what CI runs |
| `node scripts/generate_demo_seed.mjs` | regenerate the demo data |
| `node scripts/backup.mjs` | snapshot every table to `backups/` |
| `node scripts/check-names.mjs` | fail if a real student's name reached a tracked file |

The demo data simulates a twelve-week term rather than sprinkling random
statuses, so it is internally consistent — nobody is ahead on a topic their
class never covered. Every generated id begins `5eed0000`, which is how the
teardown script finds it and nothing else.

---

## Layout

```
app/(app)/          signed-in pages; the route group carries the nav shell
app/login/          the only page outside it
components/         grouped by the part of the app they serve
  sessions/         a class: check-in, the grid, notes, the calendar
  students/         the roster, a student's record, merging duplicates
  curriculum/       programmes, levels and topics
  progress/         the mark picker and legend, shared by both grids
  admin/            the backup button
  layout/  ui/      the header shell, and generic building blocks
hooks/              realtime, the coach's local date, remembered toggles
lib/
  status.ts         the five marks, and what may follow what
  queries.ts        every read. Pages explicitly, because the API
                    silently truncates at 1000 rows
utils/supabase/     the three clients: browser, server, proxy
supabase/
  migrations/       schema, policies, grants, functions — plain SQL
  seed/             the demo term, and its teardown
scripts/            migrations, backups, imports, the demo generator
tests/              unit tests, and database tests that roll back
proxy.ts            Next.js 16's name for middleware; gates every route
```

`CLAUDE.md` is the long-form version of this file — the domain, the schema, the
access model, and every trap this codebase has already fallen into.

---

## On the data

No real student data is in this repository or in the demo. Names, marks,
attendance and notes in the demo are generated. The academy's records live in
their own Supabase project; the importer reads their old system and never
writes to it, and its output, their roster and every backup are gitignored.

Built unpaid, for a chess academy that had outgrown its spreadsheet.
