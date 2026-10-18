"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export type TopicFormState = { error: string | null };

/**
 * Everything here edits the coaches' own curriculum. Levels 1-3 came out of
 * their spreadsheet as-is and Level 4 is still guesswork, so they need to be
 * able to fix all of it themselves rather than asking for a code change.
 */

export async function addTopic(
  _prevState: TopicFormState,
  formData: FormData,
): Promise<TopicFormState> {
  const levelId = String(formData.get("level_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!levelId) return { error: "Missing level." };
  if (!name) return { error: "Enter a topic name." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_topic", {
    p_level_id: levelId,
    p_name: name,
  });

  if (error) return { error: error.message };

  revalidatePath("/curriculum");
  return { error: null };
}

export async function renameTopic(formData: FormData) {
  const topicId = String(formData.get("topic_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!topicId || !name) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("topics")
    .update({ name })
    .eq("id", topicId);
  if (error) throw new Error(`Could not rename the topic: ${error.message}`);

  revalidatePath("/curriculum");
}

export async function moveTopic(formData: FormData) {
  const topicId = String(formData.get("topic_id") ?? "");
  const direction = String(formData.get("direction") ?? "") === "up" ? -1 : 1;
  if (!topicId) return;

  const supabase = await createClient();
  const { error } = await supabase.rpc("move_topic", {
    p_topic_id: topicId,
    p_direction: direction,
  });
  if (error) throw new Error(`Could not move the topic: ${error.message}`);

  revalidatePath("/curriculum");
}

/**
 * Deleting a topic cascades its progress rows: every student's record of that
 * topic goes with it. The page says so before the button is pressed.
 */
export async function deleteTopic(formData: FormData) {
  const topicId = String(formData.get("topic_id") ?? "");
  if (!topicId) return;

  const supabase = await createClient();
  const { error } = await supabase.from("topics").delete().eq("id", topicId);
  if (error) throw new Error(`Could not delete the topic: ${error.message}`);

  revalidatePath("/curriculum");
}

export async function renameLevel(formData: FormData) {
  const levelId = String(formData.get("level_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!levelId || !name) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("levels")
    .update({ name })
    .eq("id", levelId);
  if (error) throw new Error(`Could not rename the level: ${error.message}`);

  revalidatePath("/curriculum");
  revalidatePath("/roster");
}

/**
 * Programmes and levels, which until now could only be created by running SQL
 * by hand.
 *
 * The coaches asked for coding classes when they asked for everything else in
 * v2, and the schema has carried programmes since 0010 -- a student enrolls per
 * programme precisely so a child can do chess and coding at once. What was
 * never built was any way to say "there is now a programme called Coding". The
 * demo has one only because its seed script inserts it, which is why the demo
 * looks richer than the academy's own instance and is not.
 *
 * The database already allowed this: 0010 grants coaches insert on programs,
 * and 0001 gives them full access to levels. Only the screen was missing.
 */

export async function addProgram(
  _prevState: TopicFormState,
  formData: FormData,
): Promise<TopicFormState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter a name for the programme." };

  const supabase = await createClient();

  // Appended rather than inserted anywhere in particular: Chess is their main
  // programme and should stay at the top of every list it appears in.
  const { data: last } = await supabase
    .from("programs")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);

  const { error } = await supabase
    .from("programs")
    .insert({ name, sort_order: (last?.[0]?.sort_order ?? 0) + 1 });

  if (error) {
    return {
      error: /duplicate|unique/i.test(error.message)
        ? `There is already a programme called ${name}.`
        : error.message,
    };
  }

  revalidatePath("/curriculum");
  revalidatePath("/roster");
  revalidatePath("/sessions");
  return { error: null };
}

export async function addLevel(
  _prevState: TopicFormState,
  formData: FormData,
): Promise<TopicFormState> {
  const programId = String(formData.get("program_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!programId) return { error: "Missing programme." };
  if (!name) return { error: "Enter a name for the level." };

  const supabase = await createClient();

  // `number` is unique within a programme, so the next one is one past the
  // highest that exists -- not the count, which would collide the moment a
  // level in the middle is ever deleted.
  const { data: last } = await supabase
    .from("levels")
    .select("number")
    .eq("program_id", programId)
    .order("number", { ascending: false })
    .limit(1);

  const { error } = await supabase.from("levels").insert({
    program_id: programId,
    name,
    number: (last?.[0]?.number ?? 0) + 1,
  });

  if (error) return { error: error.message };

  revalidatePath("/curriculum");
  revalidatePath("/roster");
  return { error: null };
}

export async function renameProgram(formData: FormData) {
  const programId = String(formData.get("program_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!programId || !name) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("programs")
    .update({ name })
    .eq("id", programId);
  if (error)
    throw new Error(`Could not rename the programme: ${error.message}`);

  revalidatePath("/curriculum");
  revalidatePath("/roster");
}
