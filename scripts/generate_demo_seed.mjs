#!/usr/bin/env node
/**
 * Writes supabase/seed/001_placeholder_seed.sql — the demo dataset.
 *
 *   node scripts/generate_demo_seed.mjs
 *
 * This is the data behind the public demo. It contains no real child: every
 * name is generated, and the only thing taken from the centre is the chess
 * curriculum itself, which is not personal data.
 *
 * It SIMULATES A TERM rather than sprinkling random statuses about. Twelve
 * weeks of classes are played out in order: who turned up, what was covered,
 * how each student moved. The progress rows are wherever that simulation
 * finished, and the history entries are the moves that got them there. That
 * matters because a scattering of random values produces impossible records --
 * a student "complete" on a topic their class never covered, a history that
 * disagrees with the grid -- and anyone looking closely at the demo would see
 * it.
 *
 * Deliberately sized past a thousand progress rows, so the paging in
 * lib/queries.ts is exercised by the demo itself rather than only by the real
 * roster.
 *
 * Every id begins 5eed0000, which is how 999_placeholder_teardown.sql finds
 * this data and nothing else.
 */
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(
  path.resolve(import.meta.dirname, ".."),
  "supabase",
  "seed",
  "001_placeholder_seed.sql",
);

// ---------------------------------------------------------------------------
// Deterministic randomness: the same seed file every run, so a regenerated
// demo is a reviewable diff rather than a whole new dataset.
// ---------------------------------------------------------------------------
let state = 20260903;
function random() {
  state |= 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (list) => list[Math.floor(random() * list.length)];
const chance = (p) => random() < p;

const KIND = {
  program: "001",
  level: "002",
  topic: "003",
  student: "004",
  series: "005",
  session: "006",
};
let counters = {};
function id(kind) {
  counters[kind] = (counters[kind] ?? 0) + 1;
  return `5eed0000-0000-4000-8${KIND[kind]}-${String(counters[kind]).padStart(12, "0")}`;
}

const q = (v) =>
  v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`;

// ---------------------------------------------------------------------------
// The curriculum. Levels 1-3 are the centre's own, verbatim. Level 4 is
// invented: their own system has twelve unnamed placeholder slots for it, so
// there is nothing real to copy.
// ---------------------------------------------------------------------------
const CHESS = {
  1: [
    "Center",
    "Development",
    "Castling",
    "Pawn Shield",
    "Checkmate Patterns",
    "Check/Checkmate/Stalemate",
    "Targets",
    "Scholar",
    "Safe Squares",
    "Adding Attackers",
    "Defensive Moves",
    "Fencing",
    "Trades and Exchanges",
    "Move Recognition",
    "Promotion",
    "En Passant",
  ],
  2: [
    "Piece Relationships",
    "Forks",
    "Pins",
    "Skewers",
    "Discovery",
    "Batteries",
    "K+1P",
    "King in the Endgame",
    "Basic Opening Concepts",
    "Responding to Opening Errors",
    "Trading When Winning",
    "Middle Game Transition",
    "QK Checkmate",
    "Checklist of Moves",
    "Backrank Checkmate",
    "KR Checkmate",
    "Notation",
    "Understanding Opponent Moves",
    "Attacking the King",
    "Improving Pieces",
    "Checkmate Patterns",
    "Draws",
  ],
  3: [
    "Combinations",
    "Basic Openings Database",
    "Interference",
    "Attraction",
    "Deflection",
    "X-Ray",
    "Overload",
    "In-Between Move",
    "Winning Endgames",
    "Passed Pawns",
    "KBB Checkmate",
    "King and Edgepawn",
    "Pawn Breakthroughs",
    "Candidate Moves",
    "Middle Game Mating",
    "Forcing draws",
    "Advanced Mating Patterns",
    "Clock Management",
    "Opposite Side Castling",
    "Remove the Defender",
  ],
  4: [
    "Annotating Your Own Games",
    "Identifying Critical Moments",
    "Post-Mortem Analysis",
    "Engine-Assisted Review",
    "Classical Game Study",
    "Building a Study Plan",
    "Endgame Technique Review",
    "Time Management Review",
    "Opening Repertoire",
    "Tournament Preparation",
    "Calculation Under Pressure",
    "Playing Out Difficult Positions",
  ],
};

// A second programme, to show the app is not chess-shaped.
const CODING = {
  1: [
    "Sequencing",
    "Loops",
    "Conditionals",
    "Variables",
    "Events",
    "Debugging Basics",
    "Sprites and Motion",
    "Simple Games",
  ],
  2: [
    "Functions",
    "Lists and Arrays",
    "Nested Loops",
    "Input Validation",
    "Working with Files",
    "Simple Algorithms",
    "Reading Error Messages",
    "Building a Project",
  ],
};

const FIRST = [
  "Maya",
  "Devon",
  "Aisha",
  "Leo",
  "Chen",
  "Priya",
  "Sam",
  "Tomas",
  "Ruth",
  "Noor",
  "Felix",
  "Ines",
  "Kofi",
  "Lena",
  "Omar",
  "Yuki",
  "Ada",
  "Bruno",
  "Clara",
  "Diego",
  "Elif",
  "Farid",
  "Greta",
  "Hugo",
  "Iris",
  "Jonas",
  "Kira",
  "Luca",
  "Mira",
  "Nils",
  "Oona",
  "Pablo",
  "Quinn",
  "Rosa",
  "Stefan",
  "Tara",
  "Umar",
  "Vera",
  "Wren",
  "Xavi",
  "Yara",
  "Zane",
  "Anika",
  "Ben",
  "Cato",
  "Dara",
  "Emre",
  "Fiona",
  "Gus",
  "Hana",
];
const LAST = [
  "Fitzgerald",
  "Park",
  "Rahman",
  "Marquez",
  "Wei",
  "Nair",
  "O'Connor",
  "Vidal",
  "Okafor",
  "Haddad",
  "Berg",
  "Silva",
  "Mensah",
  "Kaur",
  "Nowak",
  "Tanaka",
  "Lindqvist",
  "Moreau",
  "Vargas",
  "Petrov",
  "Ellis",
  "Abadi",
  "Novak",
  "Reyes",
  "Ibrahim",
  "Sorensen",
  "Duarte",
  "Kimura",
];

const WEEKDAY_NAME = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// ---------------------------------------------------------------------------
// Build the world
// ---------------------------------------------------------------------------
// Chess is bootstrap data created by migration 0010, not demo data -- a real
// deployment needs it and the teardown must not remove it. So the seed adopts
// the existing row by name and only invents the second programme.
const programs = [
  {
    id: null,
    ref: "(select id from programs where name = 'Chess')",
    name: "Chess",
    sort: 1,
    levels: [],
  },
  { id: id("program"), ref: null, name: "Coding", sort: 2, levels: [] },
];
for (const program of programs) {
  if (program.ref === null) program.ref = `'${program.id}'`;
}

function addLevels(program, curriculum) {
  for (const [number, topics] of Object.entries(curriculum)) {
    const level = {
      id: id("level"),
      number: Number(number),
      name: `Level ${number}`,
      program,
      topics: topics.map((name, index) => ({
        id: id("topic"),
        name,
        sort: index + 1,
      })),
    };
    program.levels.push(level);
  }
}
addLevels(programs[0], CHESS);
addLevels(programs[1], CODING);

const chess = programs[0];
const coding = programs[1];

// Roughly the shape of the centre's own roster: a wide base, thinning sharply.
const PER_LEVEL = { 1: 30, 2: 28, 3: 16, 4: 6 };

const usedNames = new Set();
function name() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const candidate = `${pick(FIRST)} ${pick(LAST)}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
  }
  return `Student ${usedNames.size + 1}`;
}

const students = [];
for (const level of chess.levels) {
  for (let i = 0; i < PER_LEVEL[level.number]; i += 1) {
    students.push({
      id: id("student"),
      name: name(),
      active: true,
      enrollments: [{ program: chess, level }],
    });
  }
}

// One student who has left, so the roster's "removed" section is not empty.
students.push({
  id: id("student"),
  name: name(),
  active: false,
  enrollments: [{ program: chess, level: chess.levels[0] }],
});

// A handful do both programmes at once -- the reason enrollments exist.
for (const student of students.filter(() => chance(0.16)).slice(0, 14)) {
  student.enrollments.push({
    program: coding,
    level: chance(0.7) ? coding.levels[0] : coding.levels[1],
  });
}

// The timetable, echoing the shape of the centre's real one: several classes a
// week, some sharing a slot.
const series = [
  { level: chess.levels[0], weekday: 2, time: "18:00" },
  { level: chess.levels[0], weekday: 5, time: "16:30" },
  { level: chess.levels[1], weekday: 5, time: "16:30" },
  { level: chess.levels[2], weekday: 6, time: "15:10" },
  { level: chess.levels[3], weekday: 3, time: "18:30" },
  { level: coding.levels[0], weekday: 4, time: "17:00" },
].map((entry) => ({
  ...entry,
  id: id("series"),
  name: `${entry.level.program.name} ${entry.level.name} — ${WEEKDAY_NAME[entry.weekday]}`,
  regulars: [],
}));

// Most students are regulars of a class at their level; the rest drop in.
for (const student of students) {
  for (const enrollment of student.enrollments) {
    const options = series.filter((s) => s.level === enrollment.level);
    if (options.length === 0) continue;
    if (chance(0.82)) pick(options).regulars.push(student);
  }
}

// ---------------------------------------------------------------------------
// Play out the term
// ---------------------------------------------------------------------------
const WEEKS = 12;
const ORDER = ["not_seen", "seen_once", "seen_multiple"];

const progress = new Map(); // `${studentId}:${topicId}` -> status
const events = [];
const sessions = [];
const attendance = [];
const sessionTopics = [];
const sessionNotes = [];

const key = (studentId, topicId) => `${studentId}:${topicId}`;
const statusOf = (studentId, topicId) =>
  progress.get(key(studentId, topicId)) ?? "not_seen";

function setStatus(studentId, topicId, to, sessionId, when) {
  const from = statusOf(studentId, topicId);
  if (from === to) return;
  progress.set(key(studentId, topicId), to);
  events.push({ studentId, topicId, from, to, sessionId, when });
}

/** Sunday-based weekday, counting back from today. */
function dateFor(weeksAgo, weekday) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay() + weekday - weeksAgo * 7);
  return date;
}

const NOTES = [
  "Rushed the last two — worth another look next week.",
  "Really clicked today. Ready to be tested soon.",
  "Quiet, but got there in the end.",
  "Needs a slower pass over this one.",
  "Confident. Tested clean.",
  "Distracted early on, better after the break.",
  "Asked good questions about the endgame.",
];

for (let weeksAgo = WEEKS; weeksAgo >= 0; weeksAgo -= 1) {
  for (const klass of series) {
    const when = dateFor(weeksAgo, klass.weekday);
    if (when > new Date()) continue;

    const sessionId = id("session");
    const iso = when.toISOString().slice(0, 10);
    sessions.push({
      id: sessionId,
      date: iso,
      time: klass.time,
      series: klass,
      program: klass.level.program,
    });

    // Who turned up: most regulars, plus the odd drop-in from the same level.
    const present = klass.regulars.filter(() => chance(0.85));
    const dropIns = students.filter(
      (s) =>
        !klass.regulars.includes(s) &&
        s.active &&
        s.enrollments.some((e) => e.level === klass.level) &&
        chance(0.06),
    );
    const room = [...present, ...dropIns];
    for (const student of room)
      attendance.push({ sessionId, studentId: student.id });

    // The class works forward through the curriculum over the term.
    const topics = klass.level.topics;
    const reached = Math.min(
      topics.length,
      Math.ceil(((WEEKS - weeksAgo + 1) / (WEEKS + 1)) * topics.length) + 1,
    );
    const coveredToday = [];
    const howMany = 1 + (chance(0.55) ? 1 : 0);
    for (let i = 0; i < howMany; i += 1) {
      const topic = topics[Math.max(0, Math.floor(random() * reached))];
      if (!coveredToday.includes(topic)) coveredToday.push(topic);
    }
    for (const topic of coveredToday) {
      sessionTopics.push({ sessionId, topicId: topic.id });
    }

    // Covering a topic moves everyone in the room one step, and no further.
    for (const student of room) {
      for (const topic of coveredToday) {
        const current = statusOf(student.id, topic.id);
        const index = ORDER.indexOf(current);
        if (index >= 0 && index < ORDER.length - 1) {
          setStatus(student.id, topic.id, ORDER[index + 1], sessionId, when);
        }
      }

      // And a coach's judgement, on a topic that has been seen enough.
      if (chance(0.3)) {
        const ready = topics.filter(
          (t) => statusOf(student.id, t.id) === "seen_multiple",
        );
        if (ready.length > 0) {
          setStatus(
            student.id,
            pick(ready).id,
            "needs_testing",
            sessionId,
            when,
          );
        }
      }
      if (chance(0.35)) {
        const testing = topics.filter(
          (t) => statusOf(student.id, t.id) === "needs_testing",
        );
        if (testing.length > 0) {
          setStatus(student.id, pick(testing).id, "complete", sessionId, when);
        }
      }

      if (chance(0.07)) {
        sessionNotes.push({
          sessionId,
          studentId: student.id,
          text: pick(NOTES),
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// A few children left behind an older page
//
// The centre's real system keeps one page per student per level, and for years
// recorded first names only -- so a child who moved up appears twice, once as
// "Rohan Mistry" and once as plain "Rohan" on the level they finished. The demo
// carries a handful of these so the tidy-up screen has something real to do.
// ---------------------------------------------------------------------------
const legacyPages = [];

for (const student of students.filter((s) => s.active).slice(0, 60)) {
  if (legacyPages.length >= 5) break;

  const chessEnrollment = student.enrollments.find((e) => e.program === chess);
  if (!chessEnrollment || chessEnrollment.level.number < 2) continue;
  if (!chance(0.5)) continue;

  const earlier = chess.levels.find(
    (l) => l.number === chessEnrollment.level.number - 1,
  );
  if (!earlier) continue;

  const page = {
    id: id("student"),
    // First name only, as the old sheets had it.
    name: student.name.split(" ")[0],
    active: false,
    enrollments: [{ program: chess, level: earlier }],
  };
  students.push(page);
  legacyPages.push(page);

  // They finished that level -- which is why they moved up.
  for (const topic of earlier.topics) {
    progress.set(
      key(page.id, topic.id),
      chance(0.85) ? "complete" : "needs_testing",
    );
  }

  // And they were in its class, earlier in the term than their current one.
  const earlierClass = series.find((klass) => klass.level === earlier);
  if (earlierClass) {
    const early = sessions
      .filter((session) => session.series === earlierClass)
      .slice(0, 4);
    for (const session of early) {
      attendance.push({ sessionId: session.id, studentId: page.id });
    }
  }
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------
const out = [];
const w = (line = "") => out.push(line);

w(
  "-- ===========================================================================",
);
w("-- DEMONSTRATION DATA — DELETE BEFORE ANY REAL IMPORT");
w("--");
w(
  "-- Generated by scripts/generate_demo_seed.mjs. Do not edit by hand: change",
);
w("-- the generator and re-run it.");
w("--");
w("-- Every id begins '5eed0000', which is how");
w(
  "-- supabase/seed/999_placeholder_teardown.sql finds this data and nothing else.",
);
w("--");
w(
  "-- NO REAL CHILD APPEARS HERE. Every name is generated. The only thing taken",
);
w("-- from the centre is the chess curriculum for levels 1-3, which is not");
w("-- personal data. Level 4's topics are invented -- their own system holds");
w("-- twelve unnamed placeholder slots, so there was nothing real to copy.");
w("--");
w("-- A term of classes is simulated in order, so the data is internally");
w("-- consistent: a student is only ahead on topics their class actually");
w("-- covered, and the history explains the grid.");
w(
  `-- ${students.length} students · ${progress.size} progress rows · ${sessions.length} classes · ${events.length} history entries`,
);
w(
  `-- Including ${legacyPages.length} children who left an older page behind on a level they`,
);
w("-- finished, so the tidy-up screen has something real to work through.");
w(
  "-- ===========================================================================",
);
w();
w("begin;");
w();
w("-- Triggers off: the blank-row trigger would race the statuses below, and");
w("-- the history trigger would stamp every event with the moment of the seed");
w("-- rather than the date it is meant to have happened.");
w("set local session_replication_role = replica;");
w();

w("-- Programmes -----------------------------------------------------------");
w(
  "-- Chess already exists (migration 0010); only the second one is demo data.",
);
for (const program of programs) {
  if (program.id === null) continue;
  w(
    `insert into programs (id, name, sort_order) values (${q(program.id)}, ${q(program.name)}, ${program.sort});`,
  );
}
w();

w("-- Levels and topics ----------------------------------------------------");
for (const program of programs) {
  for (const level of program.levels) {
    w(
      `insert into levels (id, program_id, number, name) values (${q(level.id)}, ${program.ref}, ${level.number}, ${q(level.name)});`,
    );
    for (const topic of level.topics) {
      w(
        `insert into topics (id, level_id, name, sort_order) values (${q(topic.id)}, ${q(level.id)}, ${q(topic.name)}, ${topic.sort});`,
      );
    }
  }
}
w();

w("-- Students and enrollments ---------------------------------------------");
for (const student of students) {
  w(
    `insert into students (id, full_name, is_active) values (${q(student.id)}, ${q(student.name)}, ${student.active});`,
  );
  for (const enrollment of student.enrollments) {
    w(
      `insert into enrollments (student_id, program_id, level_id) values (${q(student.id)}, ${enrollment.program.ref}, ${q(enrollment.level.id)});`,
    );
  }
}
w();

w("-- Where the term left everyone -----------------------------------------");
for (const [cell, status] of progress) {
  const [studentId, topicId] = cell.split(":");
  w(
    `insert into progress (student_id, topic_id, status) values (${q(studentId)}, ${q(topicId)}, ${q(status)});`,
  );
}
w();

w("-- The timetable --------------------------------------------------------");
for (const klass of series) {
  const start = dateFor(WEEKS, klass.weekday).toISOString().slice(0, 10);
  w(
    `insert into class_series (id, name, weekdays, session_time, start_date, program_id) values ` +
      `(${q(klass.id)}, ${q(klass.name)}, array[${klass.weekday}], ${q(klass.time)}, ${q(start)}, ${klass.level.program.ref});`,
  );
  for (const student of klass.regulars) {
    w(
      `insert into class_regulars (series_id, student_id) values (${q(klass.id)}, ${q(student.id)});`,
    );
  }
}
w();

w("-- Classes that happened ------------------------------------------------");
for (const session of sessions) {
  w(
    `insert into sessions (id, session_date, session_time, series_id, program_id) values ` +
      `(${q(session.id)}, ${q(session.date)}, ${q(session.time)}, ${q(session.series.id)}, ${session.program.ref});`,
  );
}
for (const row of sessionTopics) {
  w(
    `insert into session_topics (session_id, topic_id) values (${q(row.sessionId)}, ${q(row.topicId)});`,
  );
}
for (const row of attendance) {
  w(
    `insert into attendance (session_id, student_id) values (${q(row.sessionId)}, ${q(row.studentId)});`,
  );
}
for (const row of sessionNotes) {
  w(
    `insert into session_notes (session_id, student_id, note_text) values (${q(row.sessionId)}, ${q(row.studentId)}, ${q(row.text)});`,
  );
}
w();

w("-- How everyone got there -----------------------------------------------");
for (const event of events) {
  w(
    `insert into progress_events (student_id, topic_id, from_status, to_status, session_id, changed_at) values ` +
      `(${q(event.studentId)}, ${q(event.topicId)}, ${q(event.from)}, ${q(event.to)}, ${q(event.sessionId)}, ${q(event.when.toISOString())});`,
  );
}
w();

w("-- Triggers back on, then the blanks ------------------------------------");
w("set local session_replication_role = origin;");
w();
w(
  "-- A blank row for every topic nobody has touched yet, so each grid renders",
);
w("-- a full row. This writes no history: a blank is the absence of it.");
w("select public.ensure_progress_rows(id) from students;");
w("");
w("-- Four weeks of classes ahead, so the demo always has one to open. The");
w("-- simulation above only plays out the past; without this the Today page");
w("-- greets a visitor with nothing.");
w("select public.generate_all_series((current_date + 28)::date);");
w();
w("commit;");

fs.writeFileSync(OUT, out.join("\n") + "\n", "utf8");

console.log(`students          ${students.length}`);
console.log(
  `  older pages     ${legacyPages.length}  (for the tidy-up screen)`,
);
console.log(
  `  also coding     ${students.filter((s) => s.enrollments.length > 1).length}`,
);
console.log(
  `progress rows     ${progress.size}  (before blanks are filled in)`,
);
console.log(`classes           ${sessions.length}`);
console.log(`attendance        ${attendance.length}`);
console.log(`topics covered    ${sessionTopics.length}`);
console.log(`history entries   ${events.length}`);
console.log(`session notes     ${sessionNotes.length}`);
console.log(
  `\nwritten to supabase/seed/001_placeholder_seed.sql (${out.length} lines)`,
);
