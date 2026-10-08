"use server";
// Log in and log out. These run on the server, never in the browser.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null };

export async function logIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message === "Invalid login credentials") return { error: "Wrong email or password." };
      if (error.name === "AuthRetryableFetchError" || error.message === "fetch failed") {
        return { error: "Can't reach the server. Check your internet connection." };
      }
      return { error: error.message };
    }
  } catch {
    return { error: "Can't reach the server. Check your internet connection." };
  }

  redirect("/");
}

export async function logOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
