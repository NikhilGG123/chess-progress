"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { isStatus, type Status } from "@/lib/status";

export type ActionResult = { error: string | null };

/**
 * Write one cell of a student's permanent progress record.
 *
 * Deliberately does not revalidate: the grid is a client component that
 * already holds the new value, and re-rendering the whole route on every cell
 * click would make a coach's rapid pass down a column feel sticky. Other
 * routes are dynamic, so they read fresh values on navigation anyway.
 */
export async function setProgress(input: {
  studentId: string;
  topicId: string;
  status: Status;
  /** The class this happened in, when it happened in one. */
  sessionId?: string;
}): Promise<ActionResult> {
  if (!isStatus(input.status)) return { error: "Unknown status." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session has expired. Sign in again." };

  // Through the RPC rather than a direct upsert, so the write and its history
  // entry happen together and the entry knows which class it belongs to.
  const { error } = await supabase.rpc("set_progress", {
    p_student_id: input.studentId,
    p_topic_id: input.topicId,
    p_status: input.status,
    p_session_id: input.sessionId ?? null,
  });

  return { error: error?.message ?? null };
}

/** Check one student in to a class, or back out of it. */
export async function setAttendance(input: {
  sessionId: string;
  studentId: string;
  present: boolean;
}): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = input.present
    ? await supabase
        .from("attendance")
        .upsert(
          { session_id: input.sessionId, student_id: input.studentId },
          { onConflict: "session_id,student_id" },
        )
    : await supabase
        .from("attendance")
        .delete()
        .eq("session_id", input.sessionId)
        .eq("student_id", input.studentId);

  if (error) return { error: error.message };

  // Attendance changes which students the grid renders, so this one does need
  // the server to rebuild the page.
  revalidatePath(`/sessions/${input.sessionId}`);
  return { error: null };
}

/**
 * Check a whole group in or out at once.
 *
 * With a roster of several hundred, ticking a class in one by one is the
 * difference between the app being usable at 4:30pm and not. One statement
 * either way, so a group of thirty is one round trip rather than thirty.
 */
export async function setAttendanceBulk(input: {
  sessionId: string;
  studentIds: string[];
  present: boolean;
}): Promise<ActionResult> {
  if (input.studentIds.length === 0) return { error: null };

  const supabase = await createClient();

  const { error } = input.present
    ? await supabase.from("attendance").upsert(
        input.studentIds.map((studentId) => ({
          session_id: input.sessionId,
          student_id: studentId,
        })),
        { onConflict: "session_id,student_id" },
      )
    : await supabase
        .from("attendance")
        .delete()
        .eq("session_id", input.sessionId)
        .in("student_id", input.studentIds);

  if (error) return { error: error.message };

  revalidatePath(`/sessions/${input.sessionId}`);
  return { error: null };
}

/**
 * Star a student as a regular of a repeating class, or unstar them.
 *
 * The star belongs to the class, not the student: "the Wednesday Level 1
 * regulars" is the set a coach actually wants to check in, and a child can be
 * a regular of one class while dropping in to another.
 */
export async function setRegular(input: {
  seriesId: string;
  studentId: string;
  isRegular: boolean;
}): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = input.isRegular
    ? await supabase
        .from("class_regulars")
        .upsert(
          { series_id: input.seriesId, student_id: input.studentId },
          { onConflict: "series_id,student_id" },
        )
    : await supabase
        .from("class_regulars")
        .delete()
        .eq("series_id", input.seriesId)
        .eq("student_id", input.studentId);

  return { error: error?.message ?? null };
}

/**
 * Mark which topics a class covered. Drives the session log, and is what the
 * one-press advance works from -- so nothing is ever recorded against a topic
 * the class did not actually touch.
 */
export async function setSessionTopic(input: {
  sessionId: string;
  topicId: string;
  covered: boolean;
}): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = input.covered
    ? await supabase
        .from("session_topics")
        .upsert(
          { session_id: input.sessionId, topic_id: input.topicId },
          { onConflict: "session_id,topic_id" },
        )
    : await supabase
        .from("session_topics")
        .delete()
        .eq("session_id", input.sessionId)
        .eq("topic_id", input.topicId);

  if (error) return { error: error.message };

  revalidatePath(`/sessions/${input.sessionId}`);
  return { error: null };
}

/**
 * Everyone present moves one step on the topics covered today.
 *
 * The ceiling lives in the database function, not here: none -> seen once ->
 * seen multiple times, and it stops. Test and Complete are a coach's judgement
 * about a particular child, never a side effect of attendance.
 */
export async function advanceSession(
  sessionId: string,
): Promise<{ error: string | null; changed: number }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("advance_session_topics", {
    p_session_id: sessionId,
  });

  if (error) return { error: error.message, changed: 0 };

  revalidatePath(`/sessions/${sessionId}`);
  return { error: null, changed: (data as number) ?? 0 };
}

/**
 * Save a coach's free-text note about one student in one class. One note per
 * pair, overwritten in place; the page autosaves, so this runs often.
 */
export async function saveNote(input: {
  sessionId: string;
  studentId: string;
  text: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session has expired. Sign in again." };

  const { error } = await supabase.from("session_notes").upsert(
    {
      session_id: input.sessionId,
      student_id: input.studentId,
      note_text: input.text,
      updated_by: user.id,
    },
    { onConflict: "session_id,student_id" },
  );

  return { error: error?.message ?? null };
}
