# Chess Progress

A progress tracker for a chess academy, replacing the shared spreadsheet three
coaches were running their classes from.

A coach opens the evening's class, checks in who turned up, ticks what the
lesson covered, and marks each student against the topics in their level. The
record is permanent and belongs to the student, not to a tab in a workbook.

**[Live demo →](https://chess-dashboard-mu.vercel.app)** — every student in it
is invented. Sign in with `brad@example.com` / `ChessCoach2026!`, or
`admin@example.com` for the account that is allowed to delete things.

The academy's own instance runs the same code against their real records: 645
students, 12,398 marks and 523 classes migrated out of the system they had
before.

---

## What it does

**Marks.** One per student per topic, five of them, taken from the notation the
coaches already used on paper:

| Mark | Means |
| :---: | --- |
| – | not covered with this student yet |
| `I` | seen once |
| `R` | seen several times |
| `T` | ready to be tested |
| `X` | tested and complete |

`X` means *complete*. Read as a cross it means the opposite, and this app
shipped once with exactly that mistake — enough to invert every student's
record on import. A test pins it now.

**A class, start to finish.** Regulars are starred, so check-in is one button
and the search box is there for drop-ins. Tick the topics the lesson covered,
press *Everyone here saw these*, and every attendee moves one step — blank → I
→ R, and no further. Whether a child is ready to be tested is a coach's
judgement and the app never guesses it.

**The grid** is the spreadsheet they knew, with diagonal headings so twenty-two
topics fit on a screen, and a suggested next lesson per student: the first
topic in the level they have not finished. A deliberately plain rule — a coach
glances at it mid-lesson, and one they cannot predict is one they stop
trusting.

**Everything else** the spreadsheet could not do: a permanent history of every
mark with the class it changed in, a repeating timetable that keeps its own
calendar filled, per-student notes, several programmes (chess, coding, whatever
comes next), nightly backups, and a screen for folding the several pages one
child accumulated over years into a single record.

---

## Decisions worth reading

**Progress hangs off the topic, not the level.** One row per student per topic;
a row's level is reached through `topics.level_id`. Promoting a student
therefore touches no progress row, and their old level survives as history for
free. Storing the level on the progress row would have made promotion mean
either deleting history or duplicating it.

**Row-level security is only half of it.** A policy decides *which rows*; a
`GRANT` decides whether you may touch the table at all, and Postgres checks
that first. Tables created over a direct connection inherit neither, so the
app once answered a signed-in coach with `permission denied for table
students`. Every table now carries an explicit grant block.

**The API truncates at 1,000 rows in silence.** No error, no flag, just a short
array. A class of 46 students on a 22-topic level is 1,012 progress rows, so
the tail would have rendered blank and coaches would have watched their marks
apparently vanish. Everything that scales with the roster pages explicitly.

**Roles are drawn around blast radius, not seniority.** Coaches can delete a
class, because they do it routinely and making them fetch an admin password
guarantees that password ends up on a sticky note. Deleting a *topic* cascades
into every student's record, so it waits behind an account nobody is signed
into by default. Deletes say what will be lost — "3 students checked in, 2
notes" — rather than asking "are you sure?", which is answered yes by reflex.

**Merging duplicate students is not automated.** Their old system kept one page
per student per level and recorded first names only for years, so one child is
"Rohan", "Rohan M" and "Rohan Mistry". Tested against attendance, 109 of 126
same-name groups had too little evidence to decide either way, and 27 students
legitimately attend two classes — so there is no reliable second key. Fusing
two children's records is far worse than leaving them apart, so the app ships a
review screen with the evidence on it and a coach decides.

**Database tests run inside a transaction and roll back**, which is why they
can be pointed at the production database. Every bug that ever reached a page
in this project lived in that layer — a policy without a grant, a trigger that
had to fire, a realtime socket that reported `SUBSCRIBED` and then delivered
nothing because it carried the wrong token. None of it is visible to a type
checker.

---

## Stack

**TypeScript · Next.js 16** (App Router, server components, server actions,
Turbopack) **· React 19 · Supabase** (Postgres, auth, row-level security,
realtime) **· Tailwind CSS v4 · Vitest**

Deployed on **Vercel** (this demo) and **Cloudflare Workers** via OpenNext (the
academy's instance). A nightly **GitHub Action** takes a backup and keeps the
class calendar generated eight weeks ahead.

Schema, policies and functions are plain SQL migrations applied by hand and in
order — sixteen of them, in `supabase/migrations/`.

---

## Running it

```bash
npm install
cp .env.example .env.local     # fill in from the Supabase dashboard
npm run dev                    # http://localhost:3000
```

Then, in a fresh Supabase project, paste `supabase/setup_all.sql` into the SQL
editor: it is every migration plus the coach rows plus the demo data, joined
into one file. Regenerate it with `bash supabase/build_setup_all.sh`.

There is no public sign-up. Coach accounts are created in the Supabase console
and given a row in `coaches`.

| Command | |
| --- | --- |
| `npm run dev` | development server |
| `npm run build` | production build, including a full type check |
| `npm test` | 57 tests — unit, plus database tests when `.env.local` has credentials |
| `npm run lint` | ESLint |
| `node scripts/generate_demo_seed.mjs` | regenerate the demo data |
| `node scripts/backup.mjs` | snapshot every table to `backups/` |
| `node scripts/check-names.mjs` | fails if a real student's name reached a tracked file |

The demo data simulates a twelve-week term rather than sprinkling random
statuses, so it is internally consistent — nobody is ahead on a topic their
class never covered. Every generated id begins `5eed0000`, which is how the
teardown script finds it and nothing else.

---

## Layout

```
app/(app)/          signed-in pages; the route group carries the nav shell
app/login/          the only page outside it
components/         client components — grids, pickers, forms, realtime
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
attendance and notes in the demo are generated, and
`scripts/check-names.mjs` tests that claim rather than trusting it — every
name on the academy's enrolment list, against every tracked file. The academy's records live in
their own Supabase project; the importer reads their old system and never
writes to it, and its output, their roster and every backup are gitignored.

Built unpaid, for a chess academy that had outgrown its spreadsheet.
