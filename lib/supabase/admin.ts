// Server-only Supabase connection with the SECRET key. It skips the security rules,
// so only use it in server actions, AFTER checking the user is allowed to do the thing.
// The key has no NEXT_PUBLIC_ prefix, so Next.js never sends it to the browser.
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) {
    throw new Error("Missing SUPABASE_SECRET_KEY in .env.local (Supabase → Project Settings → API Keys → Secret keys).");
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
