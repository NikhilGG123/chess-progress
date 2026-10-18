"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export type LoginState = { error: string | null };

/**
 * Email and password sign-in. Accounts are made by hand in the Supabase
 * console -- public sign-up is disabled -- so there is no register path.
 */
export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter both your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Deliberately vague: naming which half was wrong tells an attacker
    // which emails have accounts.
    return { error: "That email and password combination is not recognised." };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

/** Ends the session and drops every cached signed-in page with it. */
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
