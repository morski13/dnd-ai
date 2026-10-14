// Server helpers for level-ups (not a "use server" file: nothing here can be called from a browser).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SpellLite } from "./types";

/** Every spell in the library, trimmed for the pick lists. */
export async function loadSpellLite(supabase: SupabaseClient): Promise<SpellLite[]> {
  const { data } = await supabase.from("srd_spells")
    .select("name, level, school, classes, concentration, ritual, casting_time, range, duration, description").lte("level", 9);
  return ((data ?? []) as SpellLite[]).map((s) => ({ ...s, classes: s.classes ?? [], description: (s.description ?? "").slice(0, 1200) }));
}
