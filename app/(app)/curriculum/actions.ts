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
  const { error } = await supabase.from("topics").update({ name }).eq("id", topicId);
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
  const { error } = await supabase.from("levels").update({ name }).eq("id", levelId);
  if (error) throw new Error(`Could not rename the level: ${error.message}`);

  revalidatePath("/curriculum");
  revalidatePath("/roster");
}
