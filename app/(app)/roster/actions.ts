"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export type RosterFormState = { error: string | null; added: string | null };

/**
 * Add a student. Their level is set here, at the point a coach has just tested
 * them -- the app never guesses or auto-advances a level. Inserting with a
 * level fires the students_ensure_progress trigger, so the new student lands
 * in the grid with a full row of 'not seen' rather than a row of holes.
 */
export async function addStudent(
  _prevState: RosterFormState,
  formData: FormData,
): Promise<RosterFormState> {
  const name = String(formData.get("full_name") ?? "").trim();
  const programId = String(formData.get("program_id") ?? "").trim();
  const levelId = String(formData.get("level_id") ?? "").trim();

  if (!name) return { error: "Enter the student's name.", added: null };

  const supabase = await createClient();
  const { data: student, error } = await supabase
    .from("students")
    .insert({ full_name: name })
    .select("id")
    .single();

  if (error) return { error: error.message, added: null };

  // The enrollment is what triggers the blank progress rows, so a student
  // added without a programme simply has nothing to track yet.
  if (programId) {
    const { error: enrollError } = await supabase.from("enrollments").insert({
      student_id: student.id,
      program_id: programId,
      level_id: levelId || null,
    });
    if (enrollError) return { error: enrollError.message, added: null };
  }

  revalidatePath("/roster");
  revalidatePath("/");
  return { error: null, added: name };
}

/**
 * Place a student in a programme, or move them between its levels.
 *
 * Their old progress is untouched -- it hangs off the topic, so past levels
 * stay readable on their page -- and the trigger fills in the new level's
 * topics as blanks. Choosing "not enrolled" removes the enrollment and nothing
 * else: re-enrolling restores exactly what was there.
 */
export async function setEnrollment(formData: FormData) {
  const studentId = String(formData.get("student_id") ?? "");
  const programId = String(formData.get("program_id") ?? "");
  const levelId = String(formData.get("level_id") ?? "");
  if (!studentId || !programId) return;

  const supabase = await createClient();

  if (!levelId) {
    const { error } = await supabase
      .from("enrollments")
      .delete()
      .eq("student_id", studentId)
      .eq("program_id", programId);
    if (error)
      throw new Error(`Could not unenroll the student: ${error.message}`);
  } else {
    const { error } = await supabase
      .from("enrollments")
      .upsert(
        { student_id: studentId, program_id: programId, level_id: levelId },
        { onConflict: "student_id,program_id" },
      );
    if (error) throw new Error(`Could not change the level: ${error.message}`);
  }

  revalidatePath("/roster");
  revalidatePath(`/students/${studentId}`);
}

/**
 * "Remove" is deactivation, never deletion: the record of what a child learned
 * outlives their enrolment, and a returning student picks up where they left.
 */
export async function setStudentActive(formData: FormData) {
  const studentId = String(formData.get("student_id") ?? "");
  const active = String(formData.get("is_active") ?? "") === "true";
  if (!studentId) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .update({ is_active: active })
    .eq("id", studentId);

  if (error) {
    throw new Error(
      `Could not ${active ? "restore" : "remove"} the student: ${error.message}`,
    );
  }

  revalidatePath("/roster");
  revalidatePath(`/students/${studentId}`);
}

export type MergeResult = { error: string | null; merged: number };

/**
 * Fold several pages into one child.
 *
 * The decision is the coach's; this only carries it out. Each absorb is its own
 * database call, and the function moves everything before deleting anything, so
 * a failure part way leaves intact records rather than a half-merged one.
 */
export async function mergeStudents(input: {
  keepId: string;
  absorbIds: string[];
  fullName: string;
}): Promise<MergeResult> {
  if (input.absorbIds.length === 0) return { error: null, merged: 0 };

  const supabase = await createClient();
  let merged = 0;

  for (const absorbId of input.absorbIds) {
    const { error } = await supabase.rpc("merge_students", {
      p_keep: input.keepId,
      p_absorb: absorbId,
      p_full_name: input.fullName.trim() || null,
    });

    if (error) {
      return {
        error: `${error.message}${merged > 0 ? ` (${merged} already merged)` : ""}`,
        merged,
      };
    }
    merged += 1;
  }

  revalidatePath("/roster");
  revalidatePath("/roster/merge");
  return { error: null, merged };
}

/**
 * "These are different children." Records every pair in the group so it stops
 * being suggested, without touching the records themselves.
 */
export async function dismissMerge(studentIds: string[]): Promise<MergeResult> {
  if (studentIds.length < 2) return { error: null, merged: 0 };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pairs: {
    student_a: string;
    student_b: string;
    dismissed_by: string | null;
  }[] = [];
  for (let i = 0; i < studentIds.length; i += 1) {
    for (let j = i + 1; j < studentIds.length; j += 1) {
      // The table requires a < b so a pair cannot be stored twice.
      const [a, b] = [studentIds[i], studentIds[j]].sort();
      pairs.push({
        student_a: a,
        student_b: b,
        dismissed_by: user?.id ?? null,
      });
    }
  }

  const { error } = await supabase
    .from("merge_dismissals")
    .upsert(pairs, { onConflict: "student_a,student_b" });

  if (error) return { error: error.message, merged: 0 };

  revalidatePath("/roster/merge");
  return { error: null, merged: pairs.length };
}

export type FollowupResult = { error: string | null };

/**
 * Flag or unflag a student for follow-up.
 *
 * The flag means "look this student up in Jumbula" and carries no detail of
 * its own -- no amount, no reason, no note. See migration 0018 for why.
 *
 * Returns its error rather than throwing, because the caller is a checkbox in
 * a long list: one failing must say so beside itself and leave the rest of the
 * page alone.
 */
export async function setFollowup(input: {
  studentId: string;
  needsFollowup: boolean;
}): Promise<FollowupResult> {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("students")
    .update({
      needs_followup: input.needsFollowup,
      // Cleared on unflag, so a stale name and date cannot sit behind an
      // unticked box waiting to confuse somebody.
      followup_set_by: input.needsFollowup ? auth.user.id : null,
      followup_set_at: input.needsFollowup ? new Date().toISOString() : null,
    })
    .eq("id", input.studentId);

  if (error) return { error: error.message };

  revalidatePath("/follow-up");
  revalidatePath("/roster");
  return { error: null };
}
