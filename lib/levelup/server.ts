// Server helpers for level-ups (not a "use server" file: nothing here can be called from a browser).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SpellLite } from "./types";
import { spellLite } from "../srd-cache";

/** Every spell in the library, trimmed for the pick lists (from the server's SRD cache). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- callers still pass their client; the cache doesn't need it
export async function loadSpellLite(_supabase?: SupabaseClient): Promise<SpellLite[]> {
  return spellLite();
}
