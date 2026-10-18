import { createClient } from "@/utils/supabase/server";
import type { Status } from "./status";
import type {
  Enrollment,
  Level,
  Program,
  Session,
  StudentWithEnrollments,
  Topic,
} from "./types";
import { one } from "./types";

/**
 * The API returns at most 1000 rows per request and says nothing when it
 * truncates -- no error, no flag, just a short array. A Level 2 class of 46
 * students is 1012 progress rows, so the tail would render as "not seen" and a
 * coach's marks would look like they had vanished.
 *
 * Everything that can grow with the roster therefore pages explicitly.
 */
const PAGE = 1000;

/** Belt and braces: stop rather than loop forever if a page never shortens. */
const MAX_PAGES = 50;

async function fetchAll<T>(
  makeQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE;
    const { data, error } = await makeQuery(from, from + PAGE - 1);
    if (error) throw new Error(error.message);

    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }

  return rows;
}

/**
 * A long `in.(...)` list travels in the URL, which has its own length limit --
 * 400 student ids is roughly 15KB of query string. Ask in batches instead.
 */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

/**
 * The signed-in coach. proxy.ts has already redirected anonymous requests, so
 * a missing user here means the session died between the proxy and the render;
 * callers treat a null coach as "sign in again" rather than crashing.
 */
export async function currentCoach() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, coach: null, isAdmin: false, error: null };

  const { data: coach, error } = await supabase
    .from("coaches")
    .select("id, display_name, role")
    .eq("id", user.id)
    .maybeSingle();

  // "No row" and "the lookup failed" are different problems and need different
  // messages. Collapsing them told a coach their account was not a coach when
  // the real cause was a missing table grant.
  return {
    user,
    coach,
    isAdmin: coach?.role === "admin",
    error: error?.message ?? null,
  };
}

export async function getPrograms(): Promise<Program[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("programs")
    .select("id, name, sort_order")
    .order("sort_order")
    .order("name");
  return data ?? [];
}

export async function getLevels(): Promise<Level[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("levels")
    .select("id, number, name, program_id")
    .order("number");
  return data ?? [];
}

export type LevelWithTopics = Level & { topics: Topic[] };

export async function getLevelsWithTopics(): Promise<LevelWithTopics[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("levels")
    .select(
      "id, number, name, program_id, topics (id, level_id, name, sort_order)",
    )
    .order("number")
    .order("sort_order", { referencedTable: "topics" });

  return (data ?? []) as LevelWithTopics[];
}

export async function getStudents({ includeInactive = false } = {}): Promise<
  StudentWithEnrollments[]
> {
  const supabase = await createClient();

  const rows = await fetchAll<Record<string, unknown>>((from, to) => {
    let query = supabase
      .from("students")
      .select(
        `id, full_name, is_active, needs_followup, followup_set_at,
         enrollments (
           program:program_id (id, name, sort_order),
           level:level_id (id, number, name, program_id)
         )`,
      )
      .order("full_name")
      .range(from, to);

    if (!includeInactive) query = query.eq("is_active", true);
    return query;
  });

  return rows.map((row) => ({
    id: row.id as string,
    full_name: row.full_name as string,
    needs_followup: Boolean(row.needs_followup),
    followup_set_at: (row.followup_set_at as string | null) ?? null,
    is_active: row.is_active as boolean,
    enrollments: ((row.enrollments ?? []) as Record<string, unknown>[])
      .map((entry) => ({
        program: one<Program>(entry.program as never),
        level: one<Level>(entry.level as never),
      }))
      // A programme row is required; a level is not, since a student can be
      // enrolled before a coach has placed them.
      .filter((entry): entry is Enrollment => entry.program !== null)
      .sort((a, b) => a.program.sort_order - b.program.sort_order),
  }));
}

export type ProgressWithTopic = {
  student_id: string;
  status: Status;
  updated_at: string;
  topic: Topic & { level: Level | null };
};

/**
 * Progress rows for a set of students, each carrying its topic and that
 * topic's level. Batched by student and paged within each batch, so a full
 * class of a long level comes back whole.
 */
export async function getProgressWithTopics(
  studentIds: string[],
): Promise<ProgressWithTopic[]> {
  if (studentIds.length === 0) return [];

  const supabase = await createClient();
  const batches = await Promise.all(
    chunk(studentIds, 80).map((ids) =>
      fetchAll<Record<string, unknown>>((from, to) =>
        supabase
          .from("progress")
          .select(
            "student_id, status, updated_at, topic:topic_id (id, level_id, name, sort_order, level:level_id (id, number, name))",
          )
          .in("student_id", ids)
          .range(from, to),
      ),
    ),
  );

  return batches
    .flat()
    .map((row) => {
      const topic = one(row.topic as never) as
        | (Topic & { level: Level | Level[] | null })
        | null;
      if (!topic) return null;
      return {
        student_id: row.student_id as string,
        status: row.status as Status,
        updated_at: row.updated_at as string,
        topic: { ...topic, level: one<Level>(topic.level) },
      };
    })
    .filter((row): row is ProgressWithTopic => row !== null);
}

export type SessionSummary = Session & {
  attendance_count: number;
  series_name: string | null;
  /** What the class covered, for the log on the sessions page. */
  topics_covered: string[];
};

export async function getSessions(): Promise<SessionSummary[]> {
  const supabase = await createClient();

  // attendance(count) is an aggregate: one number per session rather than a
  // row per attendee, so a year of classes cannot blow past the row cap.
  const rows = await fetchAll<Record<string, unknown>>((from, to) =>
    supabase
      .from("sessions")
      .select(
        `id, session_date, session_time, program_id,
         attendance (count),
         series:series_id (name),
         session_topics (topic:topic_id (id, name))`,
      )
      .order("session_date", { ascending: false })
      .order("session_time", { ascending: false, nullsFirst: false })
      .range(from, to),
  );

  return rows.map((row) => ({
    id: row.id as string,
    session_date: row.session_date as string,
    session_time: row.session_time as string | null,
    attendance_count:
      (row.attendance as { count: number }[] | null)?.[0]?.count ?? 0,
    program_id: row.program_id as string,
    series_name: one<{ name: string }>(row.series as never)?.name ?? null,
    topics_covered: ((row.session_topics ?? []) as Record<string, unknown>[])
      .map(
        (entry) =>
          one<{ id: string; name: string }>(entry.topic as never)?.name,
      )
      .filter((name): name is string => Boolean(name))
      .sort(),
  }));
}

export type ClassSeries = {
  id: string;
  name: string;
  weekdays: number[];
  session_time: string | null;
  is_active: boolean;
  /** How many of its classes are still ahead of today. */
  upcoming: number;
  /** The furthest date it has been generated to, if any. */
  generated_through: string | null;
};

export async function getClassSeries(): Promise<ClassSeries[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: series } = await supabase
    .from("class_series")
    .select("id, name, weekdays, session_time, is_active")
    .order("created_at");

  if (!series || series.length === 0) return [];

  // Only the classes still ahead: that is what the page reports, and it keeps
  // this bounded by the generation window rather than by years of history.
  const upcoming = await fetchAll<{ series_id: string }>((from, to) =>
    supabase
      .from("sessions")
      .select("series_id")
      .not("series_id", "is", null)
      .gte("session_date", today)
      .range(from, to),
  );

  // The furthest date is one row per series, asked for directly.
  const furthest = await Promise.all(
    series.map(async (row) => {
      const { data } = await supabase
        .from("sessions")
        .select("session_date")
        .eq("series_id", row.id as string)
        .order("session_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data?.session_date as string | undefined) ?? null;
    }),
  );

  return series.map((row, index) => ({
    id: row.id as string,
    name: row.name as string,
    weekdays: (row.weekdays as number[]) ?? [],
    session_time: row.session_time as string | null,
    is_active: row.is_active as boolean,
    upcoming: upcoming.filter((s) => s.series_id === row.id).length,
    generated_through: furthest[index],
  }));
}

export type StudentClassHistory = {
  sessionId: string;
  date: string;
  time: string | null;
  className: string | null;
  classNote: string | null;
  /** The coach's note about this student in this class. */
  studentNote: string | null;
  topicsCovered: string[];
  /** What this student's record actually moved on the day. */
  changes: { topic: string; from: Status | null; to: Status }[];
};

/**
 * Every class a student attended, newest first, with what changed for them.
 *
 * The coaches asked to see progress against dates rather than only a current
 * position: "what did she actually get out of last Wednesday". That is what
 * progress_events is for -- the status column alone cannot answer it.
 */
export async function getStudentHistory(
  studentId: string,
): Promise<StudentClassHistory[]> {
  const supabase = await createClient();

  const attended = await fetchAll<{ session_id: string }>((from, to) =>
    supabase
      .from("attendance")
      .select("session_id")
      .eq("student_id", studentId)
      .range(from, to),
  );

  const sessionIds = attended.map((row) => row.session_id);
  if (sessionIds.length === 0) return [];

  const [sessions, events, notes] = await Promise.all([
    Promise.all(
      chunk(sessionIds, 80).map((ids) =>
        fetchAll<Record<string, unknown>>((from, to) =>
          supabase
            .from("sessions")
            .select(
              `id, session_date, session_time, notes,
               series:series_id (name),
               session_topics (topic:topic_id (name))`,
            )
            .in("id", ids)
            .range(from, to),
        ),
      ),
    ).then((batches) => batches.flat()),

    fetchAll<Record<string, unknown>>((from, to) =>
      supabase
        .from("progress_events")
        .select("session_id, from_status, to_status, topic:topic_id (name)")
        .eq("student_id", studentId)
        .not("session_id", "is", null)
        .range(from, to),
    ),

    Promise.all(
      chunk(sessionIds, 80).map((ids) =>
        fetchAll<Record<string, unknown>>((from, to) =>
          supabase
            .from("session_notes")
            .select("session_id, note_text")
            .eq("student_id", studentId)
            .in("session_id", ids)
            .range(from, to),
        ),
      ),
    ).then((batches) => batches.flat()),
  ]);

  const noteBySession = new Map(
    notes.map((row) => [row.session_id as string, row.note_text as string]),
  );

  const changesBySession = new Map<string, StudentClassHistory["changes"]>();
  for (const event of events) {
    const sessionId = event.session_id as string;
    const topic = one<{ name: string }>(event.topic as never)?.name;
    if (!topic) continue;
    if (!changesBySession.has(sessionId)) changesBySession.set(sessionId, []);
    changesBySession.get(sessionId)!.push({
      topic,
      from: (event.from_status as Status) ?? null,
      to: event.to_status as Status,
    });
  }

  return sessions
    .map((row) => ({
      sessionId: row.id as string,
      date: row.session_date as string,
      time: row.session_time as string | null,
      className: one<{ name: string }>(row.series as never)?.name ?? null,
      classNote: (row.notes as string | null) || null,
      studentNote: noteBySession.get(row.id as string) ?? null,
      topicsCovered: ((row.session_topics ?? []) as Record<string, unknown>[])
        .map((entry) => one<{ name: string }>(entry.topic as never)?.name)
        .filter((name): name is string => Boolean(name)),
      changes: changesBySession.get(row.id as string) ?? [],
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ---------------------------------------------------------------------------
// Finding pages that might be one child
// ---------------------------------------------------------------------------

export type MergeCandidate = {
  id: string;
  full_name: string;
  is_active: boolean;
  levels: string[];
  attended: number;
  firstSeen: string | null;
  lastSeen: string | null;
  complete: number;
  marks: number;
};

export type MergeGroup = {
  /** The fullest name in the group, offered as the one to keep. */
  suggestedName: string;
  students: MergeCandidate[];
};

const normalise = (name: string) =>
  name.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Could these two names be the same child?
 *
 * The centre wrote first names only for years and later started adding a last
 * initial, so one child appears as "Rohan", "Rohan M" and eventually
 * "Rohan Mistry".
 * Two names are compatible when they share a first name and neither surname
 * contradicts the other -- "Rohan" fits all three, while Mateo Alves and
 * Mateo Ferreira are ruled out despite sharing a first name.
 */
export function namesCouldMatch(a: string, b: string): boolean {
  const [firstA, ...restA] = normalise(a).split(" ");
  const [firstB, ...restB] = normalise(b).split(" ");
  if (!firstA || firstA !== firstB) return false;

  const lastA = restA.join(" ");
  const lastB = restB.join(" ");
  if (!lastA || !lastB) return true;

  return lastA.startsWith(lastB) || lastB.startsWith(lastA);
}

/**
 * Pages that plausibly belong to the same child, with the evidence a coach
 * needs to decide: which levels, how often they turned up and when, how much
 * has been marked.
 *
 * Nothing here merges anything. It cannot: the names are too thin to be sure,
 * and fusing two children's records is far worse than leaving them apart. This
 * only puts the candidates in front of somebody who knows.
 */
export async function getMergeCandidates(): Promise<MergeGroup[]> {
  const supabase = await createClient();

  const students = await getStudents({ includeInactive: true });
  if (students.length === 0) return [];

  // Group by first name, then split each group by whether the surnames agree.
  const byFirstName = new Map<string, StudentWithEnrollments[]>();
  for (const student of students) {
    const first = normalise(student.full_name).split(" ")[0];
    if (!first) continue;
    if (!byFirstName.has(first)) byFirstName.set(first, []);
    byFirstName.get(first)!.push(student);
  }

  const groups: StudentWithEnrollments[][] = [];
  for (const sharing of byFirstName.values()) {
    if (sharing.length < 2) continue;

    // Compatible with EVERY member, not merely one of them. A bare first name
    // is compatible with any surname, so "Jonas" would otherwise bridge Jonas
    // Marquez and Jonas Berg into a single group and assert that two different
    // children are one. Requiring agreement all round keeps each group
    // internally consistent; a bare name joins the first group it fits, and a
    // coach sees the rest separately.
    const remaining = [...sharing].sort(
      (a, b) => b.full_name.length - a.full_name.length,
    );
    while (remaining.length > 0) {
      const seed = remaining.shift()!;
      const group = [seed];
      for (let i = remaining.length - 1; i >= 0; i -= 1) {
        if (
          group.every((member) =>
            namesCouldMatch(member.full_name, remaining[i].full_name),
          )
        ) {
          group.push(remaining.splice(i, 1)[0]);
        }
      }
      if (group.length > 1) groups.push(group);
    }
  }

  if (groups.length === 0) return [];

  const candidateIds = groups.flat().map((student) => student.id);

  const [dismissals, attendance, progress] = await Promise.all([
    fetchAll<{ student_a: string; student_b: string }>((from, to) =>
      supabase
        .from("merge_dismissals")
        .select("student_a, student_b")
        .range(from, to),
    ),
    Promise.all(
      chunk(candidateIds, 80).map((ids) =>
        fetchAll<Record<string, unknown>>((from, to) =>
          supabase
            .from("attendance")
            .select("student_id, session:session_id (session_date)")
            .in("student_id", ids)
            .range(from, to),
        ),
      ),
    ).then((batches) => batches.flat()),
    Promise.all(
      chunk(candidateIds, 80).map((ids) =>
        fetchAll<{ student_id: string; status: Status }>((from, to) =>
          supabase
            .from("progress")
            .select("student_id, status")
            .in("student_id", ids)
            .range(from, to),
        ),
      ),
    ).then((batches) => batches.flat()),
  ]);

  const dismissed = new Set(
    dismissals.map((row) => `${row.student_a}|${row.student_b}`),
  );
  const isDismissed = (a: string, b: string) =>
    dismissed.has(a < b ? `${a}|${b}` : `${b}|${a}`);

  const dates = new Map<string, string[]>();
  for (const row of attendance) {
    const date = one<{ session_date: string }>(
      row.session as never,
    )?.session_date;
    if (!date) continue;
    const id = row.student_id as string;
    if (!dates.has(id)) dates.set(id, []);
    dates.get(id)!.push(date);
  }

  const marks = new Map<string, { complete: number; marks: number }>();
  for (const row of progress) {
    if (!marks.has(row.student_id))
      marks.set(row.student_id, { complete: 0, marks: 0 });
    const entry = marks.get(row.student_id)!;
    if (row.status !== "not_seen") entry.marks += 1;
    if (row.status === "complete") entry.complete += 1;
  }

  const describe = (student: StudentWithEnrollments): MergeCandidate => {
    const seen = (dates.get(student.id) ?? []).sort();
    const counts = marks.get(student.id) ?? { complete: 0, marks: 0 };
    return {
      id: student.id,
      full_name: student.full_name,
      is_active: student.is_active,
      levels: student.enrollments.map(
        (e) => `${e.program.name} ${e.level?.name ?? "unplaced"}`,
      ),
      attended: seen.length,
      firstSeen: seen[0] ?? null,
      lastSeen: seen.at(-1) ?? null,
      complete: counts.complete,
      marks: counts.marks,
    };
  };

  return (
    groups
      // A group where every pair has been dismissed is done with.
      .filter((group) =>
        group.some((a, i) =>
          group.some((b, j) => i < j && !isDismissed(a.id, b.id)),
        ),
      )
      .map((group) => ({
        // The fullest name is the best guess at the real one, and the coach can
        // edit it anyway.
        suggestedName: [...group].sort(
          (a, b) => b.full_name.length - a.full_name.length,
        )[0].full_name,
        students: group
          .map(describe)
          .sort(
            (a, b) =>
              b.marks - a.marks || a.full_name.localeCompare(b.full_name),
          ),
      }))
      .sort(
        (a, b) =>
          b.students.length - a.students.length ||
          a.suggestedName.localeCompare(b.suggestedName),
      )
  );
}
