// Loads the added books (book_content + book spells) and merges them into the rules data. Server only.
// Cached for a minute or so: after you run a book's SQL, the builder and level-up show it shortly after.
import type { SupabaseClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "../supabase/admin";
import { builderData } from "../builder/data";
import { rulesData } from "../levelup/data";
import type { BuilderData, Rules } from "../builder/types";
import type { RulesData } from "../levelup/types";
import { mergeBuilder, mergeRules, type BookRow, type BookSpell } from "./merge";
import { toBookRows, type HomebrewRow, type SpellForm } from "../campaign-homebrew";

/** Every added row (subclasses, species, backgrounds, feats) and the book spells' class lists. Empty when no book is added yet. */
export async function bookContent(): Promise<{ rows: BookRow[]; spells: BookSpell[] }> {
  "use cache";
  cacheLife("minutes");
  cacheTag("srd", "books");
  return loadBookContent(createAdminClient());
}

/** The same, read with any client (no cache): for code that keeps its own cache, like the Tavern's library. */
export async function loadBookContent(db: SupabaseClient): Promise<{ rows: BookRow[]; spells: BookSpell[] }> {
  const [content, spells] = await Promise.all([
    db.from("book_content").select("kind, rules, parent, name, book, data").order("kind").order("name"),
    db.from("srd_spells").select("name, classes").not("book", "is", null),
  ]);
  // before 26-books.sql has been run the table and column don't exist: just the SRD then
  return {
    rows: content.error ? [] : ((content.data ?? []) as BookRow[]),
    spells: spells.error ? [] : ((spells.data ?? []) as BookSpell[]).map((s) => ({ name: s.name, classes: s.classes ?? [] })),
  };
}

/** Level-up rules data merged with already loaded book content. */
export function rulesWith(rules: string | null | undefined, book: { rows: BookRow[]; spells: BookSpell[] }): RulesData {
  return mergeRules(rulesData(rules === "2014" ? "2014" : "2024"), book.rows, book.spells);
}

/** Level-up rules data for a rule set, with the books' subclasses and feats (and the campaign's approved homebrew). */
export async function rulesDataFor(rules: string | null | undefined, campaignId?: string | null): Promise<RulesData> {
  const base = rulesData(rules === "2014" ? "2014" : "2024");
  const [{ rows, spells }, home] = await Promise.all([bookContent(), campaignId ? campaignHomebrew(campaignId) : Promise.resolve([])]);
  return mergeRules(base, [...rows, ...toBookRows(home)], spells);
}

/** The campaign's approved homebrew made in the app (31-campaign-homebrew.sql; nothing before it's run). */
export async function campaignHomebrew(campaignId: string): Promise<HomebrewRow[]> {
  const { data, error } = await createAdminClient().from("campaign_homebrew")
    .select("id, kind, rules, parent, name, data, status, requested_by, dm_note").eq("campaign_id", campaignId).eq("status", "approved");
  return error ? [] : ((data ?? []) as HomebrewRow[]);
}

/** Approved homebrew spells, for the spell lists (SpellLite) and the sheet (SpellInfo). */
export async function homebrewSpells(campaignId: string | null | undefined): Promise<SpellForm[]> {
  if (!campaignId) return [];
  return (await campaignHomebrew(campaignId)).filter((r) => r.kind === "spell").map((r) => r.data as SpellForm);
}

/** Builder data for a rule set, with the books' species and backgrounds. */
export async function builderDataFor(rules: Rules): Promise<BuilderData> {
  const { rows } = await bookContent();
  return mergeBuilder(builderData(rules), rows);
}
