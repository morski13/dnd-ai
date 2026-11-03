"use server";
// Log in, sign up and log out with a username and a password. These run on the server, never in the browser.
// Supabase still needs an email per account: new accounts get a placeholder one (lib/username.ts) and are made
// confirmed right away, so no email is ever sent. Old accounts can still log in with their real email.
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cleanUsername, looksLikeEmail, placeholderEmail, usernameProblem } from "@/lib/username";

export type AuthState = { error: string | null; message?: string | null };

const OFFLINE = "Can't reach the server. Check your internet connection.";
const NEEDS_SQL = "Usernames aren't set up yet: run supabase/33-usernames.sql in Supabase first.";

function friendlyError(error: { name?: string; message: string }) {
  if (error.message === "Invalid login credentials") return "Wrong username or password.";
  if (error.message === "Email not confirmed") return "This account isn't confirmed yet. Check the email you signed up with, then log in.";
  if (error.name === "AuthRetryableFetchError" || error.message === "fetch failed") return OFFLINE;
  return error.message;
}

/** The email behind a username (server only). null = no such username. */
async function emailForUsername(username: string): Promise<string | null | { error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("profiles").select("id").eq("username", cleanUsername(username)).maybeSingle();
  if (error) return /username/.test(error.message) ? { error: NEEDS_SQL } : { error: error.message };
  if (!data) return null;
  const { data: u } = await admin.auth.admin.getUserById(data.id as string);
  return u?.user?.email ?? null;
}

export async function logIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const login = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!login || !password) return { error: "Enter your username and password." };

  const supabase = await createClient();
  try {
    // an account from before usernames can still type its email
    let email = looksLikeEmail(login) ? login : null;
    if (!email) {
      const found = await emailForUsername(login);
      if (found && typeof found === "object") return found;
      if (!found) return { error: "Wrong username or password." }; // same message: don't tell who has an account
      email = found;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: friendlyError(error) };
  } catch {
    return { error: OFFLINE };
  }
  redirect("/");
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const raw = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!raw.trim() || !password) return { error: "Pick a username and a password." };
  const problem = usernameProblem(raw);
  if (problem) return { error: problem };
  if (password.length < 6) return { error: "Use a password with at least 6 characters." };
  const username = cleanUsername(raw);

  const supabase = await createClient();
  try {
    const taken = await emailForUsername(username);
    if (taken && typeof taken === "object") return taken;
    if (taken) return { error: "That username is taken. Try another one (add a number, say)." };

    // made confirmed at once (no email to confirm), then logged in like any other account
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.createUser({
      email: placeholderEmail(username, process.env.USERNAME_EMAIL_DOMAIN || undefined),
      password,
      email_confirm: true,
      user_metadata: { username, display_name: raw.trim() }, // the name shown in the app, as typed
    });
    if (error) {
      if (/already been registered|already registered|exists/i.test(error.message)) return { error: "That username is taken. Try another one." };
      return { error: friendlyError(error) };
    }
    const { error: inErr } = await supabase.auth.signInWithPassword({ email: placeholderEmail(username, process.env.USERNAME_EMAIL_DOMAIN || undefined), password });
    if (inErr) return { error: friendlyError(inErr) };
  } catch {
    return { error: OFFLINE };
  }
  redirect("/");
}

export async function logOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
