// The SRD library (spells, items) is the same for everyone and almost never changes,
// so the server keeps it in its cache instead of asking the database on every page.
// Server only. Uses the secret-key client because cached code can't read the visitor's cookies;
// that's fine here: these tables are public rules text, nothing private.
import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "./supabase/admin";
import { SPELL_COLUMNS } from "./character-data";
import type { SpellLite } from "./levelup/types";

type Row = Record<string, unknown>;

/** Reads a whole table in pages of 1000 rows. */
async function readAll(q: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw new Error("Couldn't read the SRD library."); // not cached: the next visit tries again
    if (!data?.length) break;
    out.push(...(data as Row[]));
    if (data.length < 1000) break;
  }
  return out;
}

/** Every spell with the columns the sheet and the fight planner use. */
export async function allSpells(): Promise<Row[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("srd");
  const db = createAdminClient();
  return readAll((a, b) => db.from("srd_spells").select(SPELL_COLUMNS).order("name").range(a, b));
}

/** Just these spells (by name), like `.in("name", names)` but from the cache. */
export async function spellsNamed(names: string[]): Promise<Row[]> {
  if (!names.length) return [];
  const want = new Set(names);
  return (await allSpells()).filter((s) => want.has(s.name as string));
}

/** All spell names (stats use them to tell spells from attacks). */
export async function spellNames(): Promise<{ name: string }[]> {
  return (await allSpells()).map((s) => ({ name: s.name as string }));
}

/** Every spell, trimmed for the pick lists (builder, level-up). */
export async function spellLite(): Promise<SpellLite[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("srd");
  const db = createAdminClient();
  const rows = await readAll((a, b) => db.from("srd_spells")
    .select("name, level, school, classes, concentration, ritual, casting_time, range, duration, description").lte("level", 9).order("name").range(a, b));
  return (rows as SpellLite[]).map((s) => ({ ...s, classes: s.classes ?? [], description: (s.description ?? "").slice(0, 1200) }));
}

/** The item library of one rule set (2014 or 2024), with weapon data. */
export async function itemsFor(rules: "2014" | "2024"): Promise<Row[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("srd");
  const db = createAdminClient();
  return readAll((a, b) => db.from("srd_items").select("id, name, kind, data").eq("rules", rules).order("id").range(a, b));
}
