// Server helpers for level-ups (not a "use server" file: nothing here can be called from a browser).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SpellLite } from "./types";
import { spellLite } from "../srd-cache";
import { homebrewSpells } from "../books/server";
import { toSpellLite } from "../campaign-homebrew";

/** Every spell in the library, trimmed for the pick lists (the server's SRD cache), plus the campaign's approved homebrew spells. */
export async function loadSpellLite(_supabase?: SupabaseClient, campaignId?: string | null): Promise<SpellLite[]> {
  const [srd, home] = await Promise.all([spellLite(), homebrewSpells(campaignId)]);
  if (!home.length) return srd;
  const names = new Set(srd.map((s) => s.name.toLowerCase()));
  return [...srd, ...home.filter((h) => !names.has(h.name.toLowerCase())).map(toSpellLite)];
}
