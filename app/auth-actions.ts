"use server";
// Log in, sign up and log out. These run on the server, never in the browser.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error: string | null; message?: string | null };

function friendlyError(error: { name?: string; message: string }) {
  if (error.message === "Invalid login credentials") return "Wrong email or password.";
  if (error.message === "Email not confirmed") return "Confirm your email first (check your inbox), then log in.";
  if (error.message === "User already registered") return "That email already has an account. Log in instead.";
  if (error.name === "AuthRetryableFetchError" || error.message === "fetch failed") {
    return "Can't reach the server. Check your internet connection.";
  }
  return error.message;
}

export async function logIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: friendlyError(error) };
  } catch {
    return { error: "Can't reach the server. Check your internet connection." };
  }

  redirect("/");
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!name || !email || !password) return { error: "Fill in your name, email and password." };
  if (password.length < 6) return { error: "Use a password with at least 6 characters." };

  const supabase = await createClient();
  let loggedIn = false;
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: name } }, // becomes your name in the app
    });
    if (error) return { error: friendlyError(error) };
    loggedIn = !!data.session;
  } catch {
    return { error: "Can't reach the server. Check your internet connection." };
  }

  if (!loggedIn) {
    // Supabase is set to "confirm email": the user must click the link first.
    return { error: null, message: "Almost there! Check your email and click the link, then log in." };
  }
  redirect("/");
}

export async function logOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
