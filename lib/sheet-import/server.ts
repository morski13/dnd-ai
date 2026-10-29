// Server side of the sheet import: looks the sheet's spells and items up in the libraries and
// writes everything a new character needs beyond the basics (equipment, coins, attacks, features). Server only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { putInBag } from "../items/server";
import type { Attack } from "../rules";
import { buildAttacks, buildFeatures, type LibWeapon } from "./build";
import { cleanSheet } from "./clean";
import { findIn, makeIndex } from "./match";
import type { Coins, ImportedSheet } from "./types";

type DB = SupabaseClient;
type ItemRow = { id: string; name: string; kind: string; data: { damage?: string; type?: string; props?: string[]; range?: { normal?: number; long?: number } } | null };

export async function libraries(db: DB, rules: "2014" | "2024") {
  const [{ data: spells }, { data: items }] = await Promise.all([
    db.from("srd_spells").select("name"),
    db.from("srd_items").select("id, name, kind, data").eq("rules", rules),
  ]);
  const spellIdx = makeIndex((spells ?? []) as { name: string }[]);
  const itemIdx = makeIndex((items ?? []) as ItemRow[]);
  return {
    spell: (n: string) => findIn(spellIdx, n)?.name ?? null,
    item: (n: string) => findIn(itemIdx, n),
  };
}

/** For the review screen: which spells and items the app will recognise (the rest is kept as notes or plain items). */
export async function libraryCheck(db: DB, rules: "2014" | "2024", spells: string[], items: string[]) {
  const lib = await libraries(db, rules);
  return {
    spells: spells.slice(0, 120).map((n) => ({ name: n, found: lib.spell(n) })),
    items: items.slice(0, 80).map((n) => ({ name: n, found: lib.item(n)?.name ?? null })),
  };
}

export type ImportExtras = Pick<ImportedSheet, "saves" | "expertise" | "attacks" | "spells" | "equipment" | "coins" | "features" | "spellAbility" | "unknownClasses">;

/** The parts of a new character that come from the sheet, checked and matched to the libraries. */
export async function importedParts(db: DB, rules: "2014" | "2024", raw: unknown, ctx: { scores: Record<string, number>; prof: number; skills: string[] }) {
  // never trust what the browser sends back; the skills come from the form (expertise must be one of them)
  const s = cleanSheet({ ...(raw && typeof raw === "object" ? raw : {}), skills: ctx.skills }, "form");
  const lib = await libraries(db, rules);
  const known: string[] = [];
  const unknownSpells: string[] = [];
  for (const n of s.spells) { const hit = lib.spell(n); if (hit) { if (!known.includes(hit)) known.push(hit); } else unknownSpells.push(n); }

  const { attacks, equip } = buildAttacks(s.attacks, {
    scores: ctx.scores, prof: ctx.prof,
    isSpell: (n) => !!lib.spell(n) && !lib.item(n),
    weapon: (n) => { const it = lib.item(n); return it?.kind === "weapon" ? ({ name: it.name, ...(it.data ?? {}) } as LibWeapon) : null; },
  });
  return {
    saves: s.saves,
    expertise: s.expertise.filter((x) => ctx.skills.includes(x)),
    known,
    attacks: attacks as Attack[],
    equip,
    equipment: s.equipment.map((e) => ({ ...e, lib: lib.item(e.name) })),
    coins: s.coins as Coins,
    features: buildFeatures(s.features, { spells: unknownSpells, classes: s.unknownClasses }),
    spellAbility: s.spellAbility,
  };
}

/** After the character exists: put the sheet's equipment in their bag and equip the weapons they attack with. */
export async function fillBag(db: DB, a: { campaignId: string; characterId: string; equipment: Awaited<ReturnType<typeof importedParts>>["equipment"]; equip: string[] }) {
  for (const e of a.equipment) {
    await putInBag(db, { campaignId: a.campaignId, characterId: a.characterId, ref: e.lib ? `srd:${e.lib.id}` : null, name: e.lib?.name ?? e.name, qty: e.qty, source: "manual" });
  }
  // equipped weapons become attacks on the sheet (one of each is enough)
  for (const name of a.equip) {
    const { data } = await db.from("character_items").select("id").eq("character_id", a.characterId).eq("name", name).limit(1).maybeSingle();
    if (data) await db.from("character_items").update({ equipped: true }).eq("id", data.id);
  }
}
