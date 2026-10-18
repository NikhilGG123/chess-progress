#!/usr/bin/env node
/**
 * Turns the coaches' existing Supabase project into SQL this app can load.
 *
 *   node scripts/import_supabase.mjs                 # report + write the SQL
 *   node scripts/apply-sql.mjs supabase/import/real_data.sql
 *
 * Reads their project over the API with a secret key, so nothing on their side
 * is touched, altered or locked. Writes nothing anywhere until the second
 * command is run deliberately.
 *
 * WHAT THEIR MODEL IS, AND HOW IT MAPS
 *
 *   theirs                        ours
 *   ------                        ----
 *   levels                        levels (under the Chess programme)
 *   topics                        topics
 *   students                      students + one enrollment each
 *   student_topic_mastery         progress
 *   classes (day + time + level)  class_series
 *   students.primary_class_id[]   class_regulars
 *   class_sessions                sessions + session_topics + a class note
 *   attendance                    attendance
 *   participants/payments/notes   not imported -- see the report
 *
 * Their four status words map exactly onto the five marks, which is a useful
 * independent confirmation of the key:
 *
 *   (no row)     -> not_seen        blank
 *   Introduced   -> seen_once       I
 *   Reviewed     -> seen_multiple   R
 *   Test         -> needs_testing   T
 *   Completed    -> complete        X
 *
 * Their ids are carried across unchanged wherever they are UUIDs, so a row in
 * the new system can always be traced back to the row it came from.
 *
 * --roster <file> takes the centre's enrolment list, one full name per line. It
 * is used to put PROPER NAMES on pages that only carry a first name, never to
 * decide who is current: Brad was explicit that the list misses anyone paying
 * another way, and every drop-in. Nobody is deactivated by it.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const REPO = path.resolve(import.meta.dirname, "..");
const OUT = path.join(REPO, "supabase", "import", "real_data.sql");

const STATUS = {
  Introduced: "seen_once",
  Reviewed: "seen_multiple",
  Test: "needs_testing",
  Completed: "complete",
};

const WEEKDAY = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

// Rows whose "name" is clearly an artefact of the spreadsheet this came from.
const JUNK_NAMES = new Set([
  "student list",
  "copypasta",
  "copy paste",
  "test",
  "vanilla",
]);

function env() {
  const out = {};
  for (const line of fs
    .readFileSync(path.join(REPO, ".env.local"), "utf8")
    .split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const ENV = env();
if (!ENV.THEIR_SUPABASE_URL || !ENV.THEIR_SUPABASE_SECRET_KEY) {
  console.error(
    "THEIR_SUPABASE_URL and THEIR_SUPABASE_SECRET_KEY must be set in .env.local.\n" +
      "Create a secret key in THEIR project: Settings -> API Keys -> New secret key.",
  );
  process.exit(1);
}

const headers = {
  apikey: ENV.THEIR_SUPABASE_SECRET_KEY,
  Authorization: `Bearer ${ENV.THEIR_SUPABASE_SECRET_KEY}`,
};

const rosterFlag = process.argv.indexOf("--roster");
const ROSTER_FILE = rosterFlag === -1 ? null : process.argv[rosterFlag + 1];

/**
 * The enrolment list, as {first, last, full}. Names only -- the source document
 * also holds parent contact details and medical notes, which have no business
 * in this repository or this database.
 */
function loadRoster(file) {
  if (!file) return [];
  if (!fs.existsSync(file)) {
    console.error(`no such roster file: ${file}`);
    process.exit(1);
  }
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((full) => {
      const parts = full.split(/\s+/);
      return {
        full,
        first: parts[0].toLowerCase(),
        last: parts.slice(1).join(" ").toLowerCase(),
      };
    });
}

const normalise = (name) =>
  String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

/**
 * Match one of their pages to a real child.
 *
 * Three ways, narrowest first. The last one is the useful case -- most pages
 * carry a bare first name -- and it only fires when exactly one child on the
 * roster has that name, so "mateo" (Mateo Alves and Mateo Ferreira) resolves to
 * nothing rather than to a coin flip.
 */
function resolveName(pageName, roster) {
  const name = normalise(pageName);
  if (!name || roster.length === 0) return null;

  const exact = roster.filter((entry) => normalise(entry.full) === name);
  if (exact.length === 1) return exact[0].full;

  // "arun k" -> Arun Kelleher
  const initial = name.match(/^(\S+)\s+([a-z])$/);
  if (initial) {
    const hits = roster.filter(
      (entry) =>
        entry.first === initial[1] && entry.last.startsWith(initial[2]),
    );
    if (hits.length === 1) return hits[0].full;
  }

  // "rohan" -> Rohan Mistry, but only when there is exactly one Rohan.
  if (!name.includes(" ")) {
    const hits = roster.filter((entry) => entry.first === name);
    if (hits.length === 1) return hits[0].full;
  }

  return null;
}

/** Page past the API's silent 1000-row cap. */
async function all(pathAndQuery) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(
      `${ENV.THEIR_SUPABASE_URL}/rest/v1/${pathAndQuery}`,
      {
        headers: { ...headers, Range: `${from}-${from + 999}` },
      },
    );
    if (!res.ok)
      throw new Error(`${pathAndQuery}: ${res.status} ${await res.text()}`);
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < 1000) return rows;
  }
}

const q = (value) =>
  value === null || value === undefined
    ? "null"
    : `'${String(value).replace(/'/g, "''")}'`;

/** Their levels are integers; ours are UUIDs. Derive one, stably. */
const levelUuid = (levelId) => {
  const hash = crypto
    .createHash("sha1")
    .update(`level:${levelId}`)
    .digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    "4" + hash.slice(13, 16),
    "8" + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join("-");
};

/** '6:00 PM' -> '18:00'. Returns null for anything unparseable. */
function toTime(text) {
  const m = String(text ?? "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let hour = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") hour += 12;
  return `${String(hour).padStart(2, "0")}:${m[2]}`;
}

async function main() {
  console.log("Reading their project…\n");

  const [levels, topics, students, mastery, classes, sessions, attendance] =
    await Promise.all([
      all("levels?select=*&order=level_number"),
      all("topics?select=*&order=level_id,sort_order"),
      all("students?select=*"),
      all(
        "student_topic_mastery?select=student_id,topic_id,status,notes,last_updated",
      ),
      all("classes?select=*"),
      all("class_sessions?select=*"),
      all("attendance?select=*"),
    ]);

  const roster = loadRoster(ROSTER_FILE);
  const resolved = new Map(); // page id -> proper full name
  if (roster.length > 0) {
    for (const student of students) {
      const proper = resolveName(student.name, roster);
      if (proper) resolved.set(student.id, proper);
    }
  }

  const topicIds = new Set(topics.map((t) => t.id));
  const studentIds = new Set(students.map((s) => s.id));
  const classById = new Map(classes.map((c) => [c.id, c]));

  // ---- what will not come across, and why --------------------------------
  const junk = students.filter((s) =>
    JUNK_NAMES.has((s.name ?? "").trim().toLowerCase()),
  );
  const unnamed = students.filter((s) => !(s.name ?? "").trim());
  const skipStudent = new Set([...junk, ...unnamed].map((s) => s.id));

  const orphanMastery = mastery.filter(
    (m) =>
      !topicIds.has(m.topic_id) ||
      !studentIds.has(m.student_id) ||
      skipStudent.has(m.student_id),
  );
  const unknownStatus = mastery.filter((m) => !STATUS[m.status]);

  const badTimes = classes.filter((c) => !toTime(c.time));
  const badDays = classes.filter((c) => WEEKDAY[c.day_of_week] === undefined);

  // Attendance is keyed on (class, date); ours hangs off a session. Match them
  // up, and mint a session for any attendance whose class meeting was never
  // recorded -- otherwise those children silently vanish from the record.
  const sessionKey = (classId, date) => `${classId}|${date}`;
  const sessionByKey = new Map(
    sessions.map((s) => [sessionKey(s.class_id, s.date), s]),
  );
  const inventedSessions = [];

  for (const row of attendance) {
    const key = sessionKey(row.class_id, row.date);
    if (!sessionByKey.has(key) && classById.has(row.class_id)) {
      const invented = {
        id: crypto.randomUUID(),
        class_id: row.class_id,
        date: row.date,
        topics_covered: [],
        // Brad: "probably the coach did check in but forgot to record the
        // lesson." So the class happened and the attendance is real; only the
        // lesson record is missing. Saying so stops a blank topic list reading
        // as a class that taught nothing.
        notes: "Imported — attendance taken, lesson not recorded",
        invented: true,
      };
      sessionByKey.set(key, invented);
      inventedSessions.push(invented);
    }
  }

  const allSessions = [...sessionByKey.values()];
  const droppedAttendance = attendance.filter(
    (row) =>
      !sessionByKey.has(sessionKey(row.class_id, row.date)) ||
      !studentIds.has(row.student_id),
  );

  // Regulars: their primary_class_id is an array of the classes a student
  // attends every week, which is exactly what a star means here.
  const regulars = [];
  for (const student of students) {
    if (skipStudent.has(student.id)) continue;
    for (const classId of student.primary_class_id ?? []) {
      if (classById.has(classId))
        regulars.push({ classId, studentId: student.id });
    }
  }

  const duplicateNames = [
    ...students
      .filter((s) => !skipStudent.has(s.id))
      .reduce((map, s) => {
        const key = (s.name ?? "").trim().toLowerCase();
        map.set(key, (map.get(key) ?? 0) + 1);
        return map;
      }, new Map()),
  ].filter(([, n]) => n > 1);

  // ---- the report --------------------------------------------------------
  const line = "=".repeat(70);
  console.log(line);
  console.log("  IMPORT REPORT — nothing has been written to either database");
  console.log(line);
  console.log(`  source                 ${ENV.THEIR_SUPABASE_URL}`);
  console.log();
  console.log("  coming across:");
  console.table([
    { table: "levels", rows: levels.length },
    { table: "topics", rows: topics.length },
    { table: "students", rows: students.length - skipStudent.size },
    {
      table: "enrollments",
      rows: students.filter((s) => !skipStudent.has(s.id) && s.current_level_id)
        .length,
    },
    {
      table: "progress",
      rows: mastery.length - orphanMastery.length - unknownStatus.length,
    },
    {
      table: "class_series",
      rows: classes.length - badTimes.length - badDays.length,
    },
    { table: "class_regulars", rows: regulars.length },
    { table: "sessions", rows: allSessions.length },
    {
      table: "session_topics",
      rows: allSessions.reduce(
        (n, s) => n + (s.topics_covered ?? []).length,
        0,
      ),
    },
    { table: "attendance", rows: attendance.length - droppedAttendance.length },
  ]);

  console.log("  status mapping:");
  const statusCounts = new Map();
  for (const m of mastery)
    statusCounts.set(m.status, (statusCounts.get(m.status) ?? 0) + 1);
  console.table(
    [...statusCounts.entries()].map(([theirs, rows]) => ({
      theirs,
      ours: STATUS[theirs] ?? "UNMAPPED — SKIPPED",
      rows,
    })),
  );

  console.log("  not coming across:");
  const skipped = [
    ["participants", "3 rows — a newer table this app has no equivalent for"],
    ["payments", "0 rows — out of scope"],
    ["student_notes", "0 rows — per-topic notes, no equivalent yet"],
    [
      "attendance.drop_in",
      `${attendance.filter((a) => a.drop_in).length} flagged — the star on a class carries this instead`,
    ],
  ];
  for (const [what, why] of skipped)
    console.log(`    ${what.padEnd(22)} ${why}`);
  console.log();

  if (junk.length || unnamed.length) {
    console.log(
      `  ! ${junk.length + unnamed.length} student rows skipped as artefacts:`,
    );
    for (const s of [...junk, ...unnamed].slice(0, 8)) {
      console.log(`      ${JSON.stringify(s.name)}  (${s.id})`);
    }
    console.log();
  }

  if (orphanMastery.length || unknownStatus.length) {
    console.log(
      `  ! ${orphanMastery.length} progress rows point at a student or topic that`,
    );
    console.log(
      `    no longer exists; ${unknownStatus.length} carry a status with no mapping.`,
    );
    console.log();
  }

  if (inventedSessions.length) {
    console.log(
      `  ! ${inventedSessions.length} classes existed only in the attendance table —`,
    );
    console.log(
      "    somebody was marked present on a day with no class recorded.",
    );
    console.log("    A session is created for each so nobody is lost.");
    console.log();
  }

  if (droppedAttendance.length) {
    console.log(
      `  ! ${droppedAttendance.length} attendance rows dropped (unknown student or class).`,
    );
    console.log();
  }

  if (badTimes.length || badDays.length) {
    console.log(
      `  ! ${badTimes.length} classes have an unreadable time, ${badDays.length} an unreadable day.`,
    );
    console.log();
  }

  if (roster.length > 0) {
    const people = new Map();
    for (const [pageId, full] of resolved) {
      if (!people.has(full)) people.set(full, []);
      people.get(full).push(pageId);
    }
    const split = [...people.entries()].filter(([, pages]) => pages.length > 1);

    console.log(`  roster: ${roster.length} names from ${ROSTER_FILE}`);
    console.log(`    pages given a proper name        ${resolved.size}`);
    console.log(`    distinct children recognised     ${people.size}`);
    console.log(`    children split across pages      ${split.length}`);
    console.log(
      "    -> these are the strongest merge candidates, and the tool",
    );
    console.log("       will pre-fill the name so they only need confirming:");
    for (const [full, pages] of split.slice(0, 8)) {
      console.log(`         ${full} (${pages.length} pages)`);
    }
    if (split.length > 8)
      console.log(`         … and ${split.length - 8} more`);
    console.log(
      "    Nobody is deactivated by this list -- Brad says it misses",
    );
    console.log("    anyone paying another way, and every drop-in.");
    console.log();
  }

  console.log(`  duplicate names: ${duplicateNames.length}`);
  console.log(
    "    Their ids keep these apart, so the import is safe — but the",
  );
  console.log(
    "    coaches will see repeated names in a list and should rename them.",
  );
  console.log(
    "    " +
      duplicateNames
        .slice(0, 6)
        .map(([name, n]) => `${name} x${n}`)
        .join(", "),
  );
  console.log();

  // ---- the SQL -----------------------------------------------------------
  const sql = [];
  const w = (text) => sql.push(text);

  w("-- Generated by scripts/import_supabase.mjs — do not edit by hand.");
  w(`-- Source: ${ENV.THEIR_SUPABASE_URL}`);
  w(`-- Generated: ${new Date().toISOString()}`);
  w("--");
  w("-- Apply with:  node scripts/apply-sql.mjs supabase/import/real_data.sql");
  w("--");
  w(
    "-- Intended for a database that has had supabase/seed/999_placeholder_teardown.sql",
  );
  w("-- run against it, or one that never had the demo data at all.");
  w("");
  w("begin;");
  w("");
  w("-- Triggers off while loading. The blank-row trigger would race the real");
  w("-- statuses being inserted, and the history trigger would write 7000");
  w(
    "-- events all stamped with the moment of the import, which is not history.",
  );
  w("set local session_replication_role = replica;");
  w("");

  w(
    "-- Programme ------------------------------------------------------------",
  );
  w("insert into programs (name, sort_order) values ('Chess', 1)");
  w("  on conflict (name) do nothing;");
  w("");

  w(
    "-- Levels ---------------------------------------------------------------",
  );
  for (const level of levels) {
    w(
      `insert into levels (id, program_id, number, name) ` +
        `select '${levelUuid(level.id)}', id, ${level.level_number}, ${q(level.name)} ` +
        `from programs where name = 'Chess' ` +
        `on conflict (id) do nothing;`,
    );
  }
  w("");

  w(
    "-- Topics ---------------------------------------------------------------",
  );
  for (const topic of topics) {
    w(
      `insert into topics (id, level_id, name, sort_order) values ` +
        `('${topic.id}', '${levelUuid(topic.level_id)}', ${q(topic.name)}, ${topic.sort_order}) ` +
        `on conflict (id) do nothing;`,
    );
  }
  w("");

  w(
    "-- Students and their enrollment ----------------------------------------",
  );
  for (const student of students) {
    if (skipStudent.has(student.id)) continue;
    w(
      `insert into students (id, full_name, is_active) values ` +
        `('${student.id}', ${q(resolved.get(student.id) ?? student.name.trim())}, ` +
        `${student.active ? "true" : "false"}) on conflict (id) do nothing;`,
    );
    if (student.current_level_id) {
      w(
        `insert into enrollments (student_id, program_id, level_id) ` +
          `select '${student.id}', id, '${levelUuid(student.current_level_id)}' from programs where name = 'Chess' ` +
          `on conflict (student_id, program_id) do nothing;`,
      );
    }
  }
  w("");

  w(
    "-- Progress -------------------------------------------------------------",
  );
  const skipMastery = new Set(orphanMastery.concat(unknownStatus));
  for (const row of mastery) {
    if (skipMastery.has(row)) continue;
    w(
      `insert into progress (student_id, topic_id, status, updated_at) values ` +
        `('${row.student_id}', '${row.topic_id}', '${STATUS[row.status]}', ` +
        `${row.last_updated ? q(row.last_updated) : "now()"}) ` +
        `on conflict (student_id, topic_id) do update set status = excluded.status;`,
    );
  }
  w("");

  w(
    "-- Repeating classes ----------------------------------------------------",
  );
  const seriesId = new Map();
  for (const klass of classes) {
    const time = toTime(klass.time);
    const day = WEEKDAY[klass.day_of_week];
    if (time === null || day === undefined) continue;

    const level = levels.find((l) => l.id === klass.level_id);
    const name = `${level?.name ?? "Class"} — ${klass.day_of_week} ${klass.time}`;
    const dates = allSessions
      .filter((s) => s.class_id === klass.id)
      .map((s) => s.date)
      .sort();

    seriesId.set(klass.id, klass.id);
    w(
      `insert into class_series (id, name, weekdays, session_time, start_date, is_active, program_id) ` +
        `select '${klass.id}', ${q(name)}, array[${day}], '${time}', ` +
        `${dates.length ? q(dates[0]) : "current_date"}, ${klass.active ? "true" : "false"}, id ` +
        `from programs where name = 'Chess' on conflict (id) do nothing;`,
    );
  }
  w("");

  w(
    "-- Regulars (their primary_class_id) ------------------------------------",
  );
  for (const { classId, studentId } of regulars) {
    if (!seriesId.has(classId)) continue;
    w(
      `insert into class_regulars (series_id, student_id) values ('${classId}', '${studentId}') ` +
        `on conflict do nothing;`,
    );
  }
  w("");

  w(
    "-- Classes that happened ------------------------------------------------",
  );
  for (const session of allSessions) {
    const klass = classById.get(session.class_id);
    const time = klass ? toTime(klass.time) : null;
    const series = seriesId.has(session.class_id)
      ? `'${session.class_id}'`
      : "null";
    w(
      `insert into sessions (id, session_date, session_time, series_id, program_id, notes) ` +
        `select '${session.id}', ${q(session.date)}, ${time ? q(time) : "null"}, ${series}, id, ` +
        `${session.notes ? q(session.notes) : "null"} ` +
        `from programs where name = 'Chess' on conflict (id) do nothing;`,
    );
    for (const topicId of session.topics_covered ?? []) {
      if (!topicIds.has(topicId)) continue;
      w(
        `insert into session_topics (session_id, topic_id) values ('${session.id}', '${topicId}') ` +
          `on conflict do nothing;`,
      );
    }
  }
  w("");

  w(
    "-- Attendance -----------------------------------------------------------",
  );
  const seenAttendance = new Set();
  for (const row of attendance) {
    const session = sessionByKey.get(sessionKey(row.class_id, row.date));
    if (
      !session ||
      !studentIds.has(row.student_id) ||
      skipStudent.has(row.student_id)
    )
      continue;
    const key = `${session.id}|${row.student_id}`;
    if (seenAttendance.has(key)) continue;
    seenAttendance.add(key);
    w(
      `insert into attendance (session_id, student_id) values ('${session.id}', '${row.student_id}') ` +
        `on conflict do nothing;`,
    );
  }
  w("");

  w(
    "-- Triggers back on, then fill in the blanks ----------------------------",
  );
  w("set local session_replication_role = origin;");
  w("");
  w("-- Every enrolled student gets a blank row for any topic in their level");
  w("-- that has no record yet, so the grid renders a full row. This logs no");
  w("-- history: a blank is the absence of history.");
  w("select public.ensure_progress_rows(id) from students;");
  w("");
  w("-- Eight weeks of classes ahead, so the calendar is populated the moment");
  w("-- they sign in rather than after the first nightly top-up.");
  w("select public.generate_all_series((current_date + 56)::date);");
  w("");
  w("commit;");
  w("");
  w("-- Check before trusting it:");
  w("--   select count(*) from students;");
  w("--   select status, count(*) from progress group by status order by 1;");
  w("--   select count(*) from sessions;");

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, sql.join("\n"), "utf8");

  console.log(
    `  SQL written to supabase/import/real_data.sql (${sql.length} statements)`,
  );
  console.log("  Nothing is live until you run:");
  console.log("    node scripts/apply-sql.mjs supabase/import/real_data.sql");
  console.log(line);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
