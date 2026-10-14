// Loads the assistant's library (rules text, spells, class features, feats, items, monsters) once per server
// and keeps it in memory for an hour. Server only. All of it is public SRD data, the same for everyone.
import type { SupabaseClient } from "@supabase/supabase-js";
import { rulesData } from "../levelup/data";
import { itemDocs, monsterDocs, rulesDataDocs, spellDocs, type ItemRow, type MonsterRow, type SpellRow } from "./docs";
import { NOTES_2014 } from "./notes-2014";
import rules2024 from "./rules-2024.json";
import { buildIndex, type Index, type KDoc } from "./search";

export type Edition = "2014" | "2024" | "mixed";
export type Library = { index: Index; spells: Map<string, SpellRow> };

const TTL = 60 * 60_000;
const cache = new Map<Edition, { at: number; lib: Promise<Library> }>();

async function readAll<T>(q: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error || !data?.length) break;
    out.push(...(data as T[]));
    if (data.length < 1000) break;
  }
  return out;
}

async function load(supabase: SupabaseClient, ed: Edition): Promise<Library> {
  const eds = ed === "mixed" ? ["2014", "2024"] : [ed];
  const [spells, items, monsters] = await Promise.all([
    readAll<SpellRow>((a, b) => supabase.from("srd_spells").select("name, level, school, classes, casting_time, ritual, range, components, duration, concentration, description, higher_levels").order("name").range(a, b)),
    readAll<ItemRow>((a, b) => supabase.from("srd_items").select("id, rules, name, kind, category, rarity, attunement, summary, description").in("rules", eds).order("id").range(a, b)),
    readAll<MonsterRow>((a, b) => supabase.from("srd_monsters").select("name, cr, ac, hp, data").order("name").range(a, b)),
  ]);
  const docs: KDoc[] = [
    ...(rules2024 as { pieces: { id: string; title: string; text: string }[] }).pieces.map((p) => ({ id: p.id, kind: "rule" as const, title: p.title, text: p.text, boost: 0.15 })),
    ...(ed !== "2024" ? NOTES_2014.map((n) => ({ ...n, boost: 0.3 })) : []),
    ...spellDocs(spells),
    ...eds.flatMap((e) => rulesDataDocs(rulesData(e as "2014" | "2024"))),
    ...itemDocs(items),
    ...monsterDocs(monsters),
  ];
  return { index: buildIndex(docs), spells: new Map(spells.map((s) => [s.name.toLowerCase(), s])) };
}

export function library(supabase: SupabaseClient, ed: Edition): Promise<Library> {
  const hit = cache.get(ed);
  if (hit && Date.now() - hit.at < TTL) return hit.lib;
  const lib = load(supabase, ed);
  cache.set(ed, { at: Date.now(), lib });
  lib.catch(() => cache.delete(ed)); // a failed load isn't kept
  return lib;
}
