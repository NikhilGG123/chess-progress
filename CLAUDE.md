# Chess Progress — project memory

Read this before changing anything. It is written so that somebody with no
prior context — a different assistant, a future maintainer, or a technical
person at the centre — can pick the project up cold.

`README.md` is the developer quick start. This file is the *why*.

Last substantially updated: **2026-09-03**, after the centre's data was imported.

---

## 1. What this is

A web app for a chess centre, replacing a shared Excel workbook and, latterly,
a first-pass Supabase app the centre had already built. Coaches run a class,
take attendance, and mark each student against the topics in their level. The
record is permanent and per student, not per spreadsheet tab.

Built by Nikhil, unpaid, as a personal project. The coaches are **Brad** and
**Tim**. It is intended to become their daily tool, which is the standard every
decision here is held to: if a thing would not survive a Wednesday evening with
thirty children in the room, it is wrong.

**Live demo** (invented data, safe to share): https://chess-dashboard-mu.vercel.app
**Repository**: https://github.com/NikhilGG123/chess-progress (public)
**Demo database**: its own Supabase project — id in `OPERATIONS.md`

**The centre's live system**: a separate Supabase project holding their real
data as of 2026-09-03 — 645 students, 12,398 marks, 523 classes. Deployed
separately from the demo; see §5. Their **old** project was the import's source
and is read-only to us. All three project ids are in `OPERATIONS.md`, which is
not in this repository: this one is public, and the live project holds six
hundred children's records.

Two databases, two deployments, and every command that touches the live one is
spelled differently on purpose — `apply-to-live.mjs`, not `apply-sql.mjs`;
`npm run deploy:live`, not `npm run build`.

---

## 2. How the centre actually works

- Students progress through **levels**. Each level has a fixed **topic list** —
  16, 22, 20 and 12 topics for chess levels 1 to 4.
- A coach records one **mark** per student per topic. Five of them:

  | Mark | Stored as | Meaning |
  | --- | --- | --- |
  | (blank) | `not_seen` | Not covered with this student yet |
  | `I` | `seen_once` | Seen one time |
  | `R` | `seen_multiple` | Seen multiple times |
  | `T` | `needs_testing` | Ready to be tested |
  | `X` | `complete` | Tested and finished |

  **`X` means complete.** An outsider reads X as a cross and assumes the
  opposite — this app shipped with exactly that mistake, and it would have
  inverted every student's record on import. Three independent sources agree:
  the coaches themselves, the workbook's own grid formula, and their Supabase
  app, where 3,702 rows read `Completed`. `tests/status.test.ts` pins it.
  **Do not "fix" it.**

- **Promotion is always a coach's judgement.** Nothing in the app moves a
  student between levels, and the one bulk action that exists cannot mark
  anything as tested or complete.
- Classes repeat weekly. A slot may hold one level or several — the centre runs
  fourteen classes across four evenings.
- Most children in a class attend every week ("regulars"); drop-ins are common
  enough to matter.

### A class, start to finish

1. Open the class for today (usually already on the calendar).
2. Check in the regulars with one button; find drop-ins with the search box.
3. Tick which topics the class covered.
4. Press *Everyone here saw these* — every attendee moves one step on those
   topics, blank → I → R, and no further.
5. Mark individuals by hand where a coach's judgement applies: T when a student
   is ready to be tested, X when they have passed.
6. Jot a note per student where it is worth remembering.

---

## 3. The data model

Two decisions explain most of the schema:

**Progress hangs off the topic, not the level.** One row per student per topic;
a row's level is reached through `topics.level_id`. Promoting a student
therefore touches no progress row, so their old level survives automatically as
history. Had the level been stored on the progress row, promotion would mean
deleting history or duplicating it.

**A student enrolls per programme.** `enrollments (student_id, program_id,
level_id)` replaced a single `students.current_level_id`, because a child can do
chess and coding at once and one column cannot hold both.

```
programs ── levels ── topics ─┐
                              ├─ progress (student, topic, status)
students ─┬─ enrollments ─────┘
          ├─ attendance ── sessions ─┬─ session_topics
          ├─ session_notes ──────────┘
          └─ progress_events            class_series ─┬─ generates sessions
                                                      └─ class_regulars
```

| Table | Holds |
| --- | --- |
| `programs` | Chess, Coding, whatever comes next |
| `levels` | Belong to a programme; `number` unique *within* a programme |
| `topics` | Ordered within a level by `sort_order` |
| `students` | Name and active flag only |
| `enrollments` | One row per student per programme, with their current level |
| `progress` | The permanent record: one row per student per topic |
| `progress_events` | Every change, with the class it happened in |
| `class_series` | A repeating class: weekdays, time, start date, programme |
| `class_regulars` | The stars — who attends this class every week |
| `sessions` | One class on one date; generated or one-off. `notes` is about the class itself, not a student |
| `session_topics` | What that class covered |
| `attendance` | Who was in the room |
| `session_notes` | Free text, per student per class |
| `coaches` | Mirrors auth users; carries the `role` |
| `merge_dismissals` | Pairs of pages a coach has said are *different* children |

### Things worth knowing

- **`progress_events` is written by a trigger**, so every path is covered — the
  grid, the bulk advance, an import, someone's own SQL. Blank rows created by
  enrolling a student are deliberately *not* logged: a blank is the absence of
  history, and logging twenty-two of them per student would bury the real
  entries.
- **`set_progress(student, topic, status, session)`** is the one entry point for
  marking a cell. It writes the row and its history together, so the entry knows
  which class it belongs to.
- **`advance_session_topics(session)`** has an absolute ceiling: `not_seen →
  seen_once → seen_multiple` and nothing else. It never regresses anyone and
  never produces `needs_testing` or `complete`. Attending a lesson is evidence a
  student *saw* something; it is not evidence they understood it. Eight tests
  hold this.
- **Suggested lesson** is the first topic in the level's order that is not
  `complete`. A plain rule on purpose: a coach glances at it mid-lesson, and if
  they cannot predict what it will say they stop trusting it.
- **`generate_all_series(through)`** keeps every active class materialised some
  weeks ahead, run nightly by the backup workflow. The centre's classes run
  indefinitely, and the app used to need a coach to press "Extend" -- so the
  calendar quietly emptied, which is how Tim found it. Sessions are still
  materialised rather than computed, because a cancelled week has to stay
  cancelled.
- **`merge_students(keep, absorb, name)`** folds one page into another: marks,
  classes, notes, attendance and history all move before anything is deleted.
  Same-topic collisions keep the mark that is further along; note collisions
  keep both. Coaches may run it, not only Admin -- see §4.

---

## 4. Access

Four accounts. Public sign-up is **disabled on both projects** — verified by
attempting a registration and receiving `signup_disabled`. Worth re-checking
after any Supabase change: it is on by default, and a new project holding six
hundred children's names arrives with the door open.

The live logins are in `coach-credentials.txt`, gitignored. They are still
`@example.com` placeholders — **swap them for the coaches' real addresses before
handover, or a password reset has nowhere to go.**

| Account | Role | Can |
| --- | --- | --- |
| Brad, Tim, Extra | `coach` | Everything day to day, including deleting a class |
| Admin | `admin` | Also delete topics, levels, programmes and students |

The line is **blast radius**, not seniority. Cancelling a class affects one day
and coaches do it routinely; making them fetch the Admin password for it
guarantees that password ends up on a sticky note. Deleting a topic cascades
into every student's record, so it waits behind an account nobody is signed
into by default.

Deletes that coaches *can* do state what will be lost first ("3 students checked
in, 2 notes") rather than asking "are you sure?", which is answered yes by
reflex.

**Merging students is a coach action, deliberately**, even though it deletes a
row. Nothing is lost when it does -- everything moves to the surviving record
first -- and it is a cleanup chore the coaches must work through over weeks.
Putting the Admin password in their hands for it would undo the reason that
account exists.

### Two mechanisms, both required

**Row-level security decides which rows. A `GRANT` decides whether you may touch
the table at all, and Postgres checks it first.** A table created over a direct
connection inherits neither. Every new table needs an explicit grant block —
copy the pattern in `0003_grants.sql`.

`anon` has nothing in this schema. `TRUNCATE` is revoked from the API roles
entirely, because RLS does not filter it — a policy about which rows you may
delete says nothing about a statement that empties the table.

---

## 5. Running it

```bash
npm install
cp .env.example .env.local     # fill in from the Supabase dashboard
npm run dev                    # http://localhost:3000
npm test                       # 50 tests; the database ones roll themselves back
npm run build                  # full type check
```

Sign in as `brad@example.com` / `ChessCoach2026!` (demo accounts;
`admin@example.com` for the Admin role).

### Migrations

Plain SQL in `supabase/migrations/`, applied **by hand, in order**. Nothing runs
them automatically and re-running one is expected to fail loudly.

```bash
node scripts/apply-sql.mjs supabase/migrations/0015_whatever.sql
node scripts/apply-sql.mjs --verify         # row counts
```

Each file runs in its own transaction, so a failure applies nothing.
`supabase/setup_all.sql` (regenerate with `bash supabase/build_setup_all.sh`)
joins every migration for standing up a fresh project; it deliberately excludes
the demo data.

### Keeping the calendar filled

```bash
node scripts/top-up-classes.mjs [weeks]     # default 8
```

Idempotent. Runs nightly in CI; the Extend button on the sessions page is the
manual fallback.

### Backups

The free Supabase tier takes **no automatic backups at all**. Three answers:

```bash
node scripts/backup.mjs                            # snapshot to backups/
node scripts/backup.mjs --restore backups/<file>   # replaces every table
```

plus a nightly GitHub Action (`.github/workflows/backup.yml`, needs the
`SUPABASE_DB_URL` and `SUPABASE_DB_PASSWORD` secrets), and a **Download backup**
button on the admin page. Take one before any import.

### Importing the centre's data

```bash
node scripts/import_supabase.mjs --roster roster.txt   # report + write SQL
node scripts/apply-sql.mjs supabase/import/real_data.sql
```

Reads *their* Supabase project (`THEIR_SUPABASE_URL`, `THEIR_SUPABASE_SECRET_KEY`)
and never writes to it. `--roster` is Brad's enrolment list, one full name per
line, used to put proper names on pages that carry only a first name -- **never**
to decide who is current, because the list misses anyone paying another way and
every drop-in. `roster.txt` and `supabase/import/` are gitignored.

### Deploying

Two deployments, from the same repository:

| | Where | Data | How |
| --- | --- | --- | --- |
| Public demo | Vercel, auto from `main` | 81 invented students | push |
| The centre | Cloudflare Workers | their 645 real ones | `npm run deploy:live` |

Not on Vercel for both: Vercel's free tier is for **non-commercial** use, and a
centre that charges for classes is not that. Cloudflare's free tier attaches no
such condition.

```bash
npm run preview:live      # build the worker and run it locally
npm run deploy:live       # build and publish it
```

`scripts/deploy-live.mjs` reads `REAL_SUPABASE_*` from `.env.local` and maps it
onto the `NEXT_PUBLIC_*` names at build time. The app uses **only** the
publishable key at runtime, so the worker holds no secrets — there is nothing to
install on Cloudflare beyond the code. `wrangler login` once, first.

### Checking it against the real data

```bash
npm run preview:live &                 # or `next start` on 3100
BASE_URL=http://127.0.0.1:8787 node scripts/verify-live.mjs
```

Signs in as a coach and as the Admin, walks every route, samples six students
spread across the roster, opens a class that actually happened, checks a coach
sees nothing to press on the admin page, and fires one server action so a write
is proven and not assumed. Reads passwords from `coach-credentials.txt` and
never prints them.

Worth running rather than trusting: everything here renders fine against 81
invented students and the failure modes at 645 — the thousand-row cap, a slow
join — are silent.

### The demo data

`scripts/generate_demo_seed.mjs` writes `supabase/seed/001_placeholder_seed.sql`.
It simulates a twelve-week term rather than sprinkling random statuses, so the
data is internally consistent — nobody is ahead on a topic their class never
covered. 81 students, 1,616 progress rows, deliberately past the thousand-row
cap so the demo exercises the paging.

Every demo id begins `5eed0000`, which is how
`supabase/seed/999_placeholder_teardown.sql` finds it and nothing else.

---

## 6. Traps this codebase has already hit

Every one of these passed the type checker and the build. All were found by
running the thing.

- **A policy is not a grant.** RLS policies on tables with no table privilege
  produced `permission denied for table students` for a signed-in coach.
- **`TRUNCATE` ignores RLS.** `anon` held it on a table created after the
  migration that revoked anon's access.
- **The API silently truncates at 1000 rows.** No error, no flag, just a short
  array. A class of 46 students on a 22-topic level is 1,012 progress rows, so
  the tail would have rendered as blank and coaches would have watched their
  marks apparently vanish. Everything that scales with the roster pages
  explicitly in `lib/queries.ts`.
- **Never import a plain value from a `"use client"` module into a server
  component.** Client modules export references, not values, so `WEEKDAYS.filter`
  or `cellKey()` compiles, type-checks, then throws a 500 at request time.
  Shared constants belong in `lib/`. This happened twice.
- **Realtime needs the coach's token.** A socket carrying only the publishable
  key reports `SUBSCRIBED` and then silently receives nothing, because realtime
  re-checks every change against the subscriber's own policies. The session is
  recovered from cookies asynchronously, so it must be awaited before
  subscribing — see `components/use-realtime.tsx`.
- **RLS does not raise on a forbidden DELETE**, it matches zero rows. Code that
  only checks for an error reports success while nothing was deleted.
- **Vercel blocks deploys whose commit email is not on a GitHub account.** This
  repo commits as `120427206+NikhilGG123@users.noreply.github.com` for that
  reason. Change it back to the `.edu` address and pushes will build nothing
  while git looks perfectly healthy.
- **Never let an action swallow its error.** A save that silently does nothing
  looks identical to one that worked, and a coach walks away believing a change
  was recorded.
- **Distinguish "no result" from "the query failed."** The app once told coaches
  their account was not a coach when the real cause was a missing grant.

---

## 7. Conventions

- `npm test` before committing; the database tests are safe against the live
  project because each runs in a transaction that is rolled back.
- Commit per working change, not in one batch. Explain *why* in the message.
- Keep the suggested-lesson rule deterministic. No ML.
- Real student data never enters the repository: `supabase/import/` and
  `backups/` are gitignored.
- Ask before running migrations against a database holding real data.

---

## 8. What the coaches settled, and what is still open

Both answered on 2026-09-03. Four of these reversed decisions that had already
been made, which is the argument for asking rather than guessing.

**Settled:**

- **Level 4 has no real topics.** Tim: "they are all unset. There simply are not
  developed level 4 topics." Brad: "leaving them as place fillers is fine for
  now." Their twelve slots are named `Topic 1` … `Topic 12` and import as-is,
  renameable in the app whenever they decide.
- **The 654 rows are pages, not children** -- one per student per level, roughly
  490 actual children. Tim: "assigning Rohan M level 3 and Rohan from his level 2
  sheet to Rohan Mistry student account… I had started putting in the framework but
  had not done the legwork." That framework is their `participants` table.
- **Duplicate names come from two habits**: first names only for years, then a
  last initial. So one child is "Rohan", "Rohan M" and "Rohan Mistry".
- **The 98 classes with attendance but no lesson are real.** Brad: "probably the
  coach did check in but forgot to record the lesson." They import on their real
  dates, labelled, rather than collapsing into a dump class.
- **Classes at the same time are separate classes.** Tim: "no reason to have them
  as a single class, because they are run separately, schedules might change,
  and it should be fairly straightforward to go back to 'the level 3 class from
  Tuesday' and mark something I forgot." Fourteen classes, not eight slots.
- **`CopyPasta`, `Copy Paste`, `Student List`** are spreadsheet relics. Tim: "get
  rid of them." Nine rows, skipped.
- **The timetable**: Tue 6:00 (L1, L2), Tue 7:00 (L3), Wed 6:30 (L1, L4), Wed
  7:30 (L2, L3), Fri 4:30 (L1, L2), Fri 5:35 (L3, L4), Sat 2:00 (L3), Sat 3:10
  (L1, L2).

**Still open:**

- **Who is currently enrolled.** Brad's list covers 63 children but "is not quite
  everyone… some people pay me through PayPal… missing the drop in kids as
  well." Only 162 of the 654 pages have ever been marked present. Nobody was
  deactivated on import; if a fuller register appears, `--only` is an afternoon.
- **What Level 4 actually contains**, whenever they decide. Twelve renameable
  placeholders are waiting.
- **Wednesday 6:20 or 6:30.** Their own data said 6:30 and that is what imported.
  A coach can change it in the app.
- **Whether two concurrent classes means two check-ins is friction.** Imported
  faithfully; revisit only if the coaches say so.
- **A Coding programme.** The schema carries programmes and the coaches asked for
  coding classes, but their old system had none, so the live database holds only
  Chess. Adding one is a coach action, not a migration.

---

## 8a. The import, 2026-09-03

Their old project was read, never written to. Everything below was checked
against it afterwards, not assumed.

| | |
| --- | --- |
| Students (pages) | 645 |
| Enrollments | 645 |
| Progress marks | 12,398 |
| Attendance | 2,196 |
| Classes held | 523, from 2026-01-03 |
| Repeating classes | 14, each generated 8 weeks ahead |
| Topics / levels | 70 / 4 (16, 22, 20, 12) |
| `progress_events` | 0 — correct; an import is not history |

Marks mirror the source exactly: `not_seen 4,951 · seen_once 2,435 ·
seen_multiple 678 · needs_testing 632 · complete 3,702`. The 3,702 is the
number that pins `X = complete`.

111 of those classes carry the note *"attendance taken, lesson not recorded"*
and 592 attendances between them — real evenings where a coach checked people
in and never got back to the sheet, kept on their real dates rather than
collapsed into one dump class.

Verified after the fact by `scripts/verify-live.mjs` (every route, six students,
a class that happened, one server action) and by running all 57 tests against
the live database in transactions that roll back. Row counts were identical
before and after.

The outstanding operational work — credentials to rotate, switches to flip —
is in `OPERATIONS.md`, which is **not** in the repository. A list of "this key
leaked and has not been rotated yet" is an invitation, and this repo is public.

## 9. What is not built, deliberately

- Parent accounts or logins.
- Automatic promotion between levels.
- Structured session notes.
- Payments, despite a `payments` table existing in their old system.
