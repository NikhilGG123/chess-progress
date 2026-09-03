"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export type SessionFormState = { error: string | null };

/**
 * Create a class session and go straight to it. A session is just a date and a
 * time -- attendance and the grid live on the page it opens.
 */
export async function createSession(
  _prevState: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  const date = String(formData.get("session_date") ?? "").trim();
  const time = String(formData.get("session_time") ?? "").trim();
  const programId = String(formData.get("program_id") ?? "").trim();

  if (!date) return { error: "Pick a date for the class." };
  if (!programId) return { error: "Pick which programme this class is for." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      session_date: date,
      session_time: time || null,
      program_id: programId,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/sessions");
  revalidatePath("/");
  redirect(`/sessions/${data.id}`);
}

export type SeriesFormState = { error: string | null; created: number | null };

/** Weeks of classes to materialise at a time. A term's worth, roughly. */
const DEFAULT_WEEKS = 8;

/** `weeks` of classes measured from `from`, or from today if that is later. */
function throughDate(weeks: number, from?: string): string {
  const start = from ? new Date(`${from}T00:00:00`) : new Date();
  const base = start > new Date() ? start : new Date();
  base.setDate(base.getDate() + weeks * 7);
  return base.toISOString().slice(0, 10);
}

/**
 * Describe a repeating class once -- "Level 1, Wednesdays and Fridays, 4:30"
 * -- and generate its sessions.
 *
 * The sessions it creates are ordinary rows. A coach can delete one week's
 * class, or add an extra one, without the timetable arguing back.
 */
export async function createSeries(
  _prevState: SeriesFormState,
  formData: FormData,
): Promise<SeriesFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const time = String(formData.get("session_time") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "").trim();
  const programId = String(formData.get("program_id") ?? "").trim();
  const weeks = Number(formData.get("weeks") ?? DEFAULT_WEEKS);

  const weekdays = formData
    .getAll("weekdays")
    .map((value) => Number(value))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);

  if (!name) return { error: "Give the class a name.", created: null };
  if (weekdays.length === 0)
    return { error: "Pick at least one day of the week.", created: null };
  if (!startDate) return { error: "Pick a start date.", created: null };
  if (!programId)
    return { error: "Pick which programme this class is for.", created: null };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: series, error } = await supabase
    .from("class_series")
    .insert({
      name,
      weekdays,
      session_time: time || null,
      start_date: startDate,
      program_id: programId,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message, created: null };

  const { data: created, error: genError } = await supabase.rpc(
    "generate_series_sessions",
    { p_series_id: series.id, p_through: throughDate(weeks, startDate) },
  );

  if (genError) return { error: genError.message, created: null };

  revalidatePath("/sessions");
  revalidatePath("/");
  return { error: null, created: (created as number) ?? 0 };
}

/** Top the timetable back up to another few weeks ahead. */
export async function extendSeries(formData: FormData) {
  const seriesId = String(formData.get("series_id") ?? "");
  const weeks = Number(formData.get("weeks") ?? DEFAULT_WEEKS);
  if (!seriesId) return;

  const supabase = await createClient();
  const { error } = await supabase.rpc("generate_series_sessions", {
    p_series_id: seriesId,
    p_through: throughDate(weeks),
  });
  if (error) throw new Error(`Could not add more classes: ${error.message}`);

  revalidatePath("/sessions");
  revalidatePath("/");
}

/**
 * Stop a repeating class: no more generation, and its future classes are
 * cleared off the calendar -- except any that already have someone checked in,
 * which are somebody's record of a real lesson and are left alone.
 */
export async function stopSeries(formData: FormData) {
  const seriesId = String(formData.get("series_id") ?? "");
  if (!seriesId) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("class_series")
    .update({ is_active: false })
    .eq("id", seriesId);
  if (error) throw new Error(`Could not stop the class: ${error.message}`);

  const today = new Date().toISOString().slice(0, 10);
  const { data: upcoming } = await supabase
    .from("sessions")
    .select("id, attendance (student_id)")
    .eq("series_id", seriesId)
    .gte("session_date", today);

  const empty = (upcoming ?? [])
    .filter((row) => ((row.attendance as unknown[] | null)?.length ?? 0) === 0)
    .map((row) => row.id as string);

  if (empty.length > 0) {
    await supabase.from("sessions").delete().in("id", empty);
  }

  revalidatePath("/sessions");
  revalidatePath("/");
}

export async function deleteSession(formData: FormData) {
  const id = String(formData.get("session_id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  // Attendance and notes cascade. Progress does not: it belongs to the
  // student, not to the class they happened to be in when it was recorded.
  const { error } = await supabase.from("sessions").delete().eq("id", id);
  if (error) throw new Error(`Could not delete the session: ${error.message}`);

  revalidatePath("/sessions");
  revalidatePath("/");
  redirect("/sessions");
}
