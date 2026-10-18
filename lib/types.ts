import type { Status } from "./status";

export type Program = {
  id: string;
  name: string;
  sort_order: number;
};

export type Level = {
  id: string;
  number: number;
  name: string;
  program_id: string;
};

export type Topic = {
  id: string;
  level_id: string;
  name: string;
  sort_order: number;
};

export type Student = {
  id: string;
  full_name: string;
  is_active: boolean;
  /**
   * Something about this student needs looking at in Jumbula, the centre's
   * registration and payments system. Carries no detail on purpose -- see
   * migration 0018.
   */
  needs_followup: boolean;
  followup_set_at: string | null;
};

/**
 * Where a student stands in one programme. A child doing chess and coding has
 * two of these; the level is null while they are enrolled but unplaced.
 */
export type Enrollment = {
  program: Program;
  level: Level | null;
};

export type StudentWithEnrollments = Student & { enrollments: Enrollment[] };

/** The level a student is at in one particular programme, if any. */
export function levelIn(
  student: StudentWithEnrollments,
  programId: string,
): Level | null {
  return (
    student.enrollments.find((e) => e.program.id === programId)?.level ?? null
  );
}

export type ProgressRow = {
  student_id: string;
  topic_id: string;
  status: Status;
  updated_at: string;
};

export type Session = {
  id: string;
  session_date: string;
  session_time: string | null;
  program_id: string;
};

export type SessionNote = {
  session_id: string;
  student_id: string;
  note_text: string;
  updated_at: string;
};

/**
 * PostgREST returns a to-one embed as an object, but the query builder's types
 * widen it to an array. Everything that embeds a parent row goes through here.
 */
export function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
