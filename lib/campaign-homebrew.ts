// Homebrew made in the app (pure, tested): the editor's forms checked and turned into the shapes the rest
// of the app already uses: spells for the sheet (SpellInfo) and spell lists (SpellLite), feats and subclasses
// for the level-up engine (book rows), monsters as stat blocks for Session mode and the fight planner.
import type { BookRow } from "./books/merge";
import type { MonsterStats } from "./encounter/build";
import type { SpellLite, SubclassData, Text } from "./levelup/types";
import { ABILITIES, type Ability, type SpellInfo } from "./rules";

export type HomebrewKind = "spell" | "feat" | "subclass";
export type HomebrewRow = { id: string; kind: HomebrewKind; rules: "2014" | "2024"; parent: string; name: string; data: unknown; status: "pending" | "approved" | "rejected"; requested_by: string; dm_note: string | null };

export type SpellForm = {
  name: string; level: number; school: string; classes: string[]; casting_time: string; range: string; duration: string; components: string;
  concentration: boolean; ritual: boolean; description: string; higher_levels: string;
  roll: { kind: "none" | "spell_attack" | "save" | "heal" | "damage_only"; damage: string; damage_type: string; save_ability: Ability | ""; half_on_save: boolean; per_level: string };
};
export type FeatForm = { name: string; category: string; prereq: string; text: string };
export type SubclassForm = { cls: string; name: string; flavor: string; text: string; features: { level: number; name: string; text: string }[] };
export type MonsterForm = {
  name: string; ac: number; hp: number; init: number; cr: string; size_type: string;
  actions: { name: string; kind: "attack" | "save"; bonus: number; dc: number; ability: Ability; damage: string; damage_type: string }[];
  multiattack: number;
};

const DICE = /^\s*\d{0,2}d\d{1,3}(\s*[+-]\s*(\d{0,2}d\d{1,3}|\d{1,3}))*\s*$|^\s*\d{1,3}\s*$/i;
const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const int = (v: unknown, lo: number, hi: number, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };

export function checkSpell(f: SpellForm): { data: SpellForm } | { error: string } {
  const name = str(f.name, 60);
  if (!name) return { error: "Give the spell a name." };
  if (!str(f.description, 4000)) return { error: "Say what the spell does." };
  const kind = (["none", "spell_attack", "save", "heal", "damage_only"] as const).includes(f.roll?.kind) ? f.roll.kind : "none";
  if (kind !== "none" && !DICE.test(f.roll.damage ?? "")) return { error: "Dice like 3d6 or 2d8+4." };
  if (kind === "save" && !ABILITIES.includes(f.roll.save_ability as Ability)) return { error: "Pick the saving throw." };
  if (f.roll?.per_level && !DICE.test(f.roll.per_level)) return { error: "“Higher levels” dice like 1d6." };
  return { data: {
    name, level: int(f.level, 0, 9, 1), school: str(f.school, 20) || "Evocation", classes: (f.classes ?? []).map((c) => str(c, 20)).filter(Boolean).slice(0, 12),
    casting_time: str(f.casting_time, 40) || "Action", range: str(f.range, 40) || "60 feet", duration: str(f.duration, 40) || "Instantaneous", components: str(f.components, 80) || "V, S",
    concentration: !!f.concentration, ritual: !!f.ritual, description: str(f.description, 4000), higher_levels: str(f.higher_levels, 1000),
    roll: { kind, damage: str(f.roll?.damage, 30), damage_type: str(f.roll?.damage_type, 20).toLowerCase(), save_ability: kind === "save" ? f.roll.save_ability : "", half_on_save: !!f.roll?.half_on_save, per_level: str(f.roll?.per_level, 20) },
  } };
}
export function checkFeat(f: FeatForm): { data: FeatForm } | { error: string } {
  const name = str(f.name, 60);
  if (!name) return { error: "Give the feat a name." };
  if (!str(f.text, 4000)) return { error: "Say what the feat does." };
  return { data: { name, category: str(f.category, 30) || "General", prereq: str(f.prereq, 120), text: str(f.text, 4000) } };
}
export function checkSubclass(f: SubclassForm, classes: string[]): { data: SubclassForm } | { error: string } {
  if (!classes.includes(f.cls)) return { error: "Pick its class." };
  const name = str(f.name, 60);
  if (!name) return { error: "Give the subclass a name." };
  const features = (f.features ?? []).map((x) => ({ level: int(x.level, 1, 20, 3), name: str(x.name, 60), text: str(x.text, 3000) })).filter((x) => x.name);
  if (!features.length) return { error: "Add at least one feature (level, name, what it does)." };
  return { data: { cls: f.cls, name, flavor: str(f.flavor, 300), text: str(f.text, 2000), features: features.sort((a, b) => a.level - b.level).slice(0, 30) } };
}
export function checkMonster(f: MonsterForm): { stats: MonsterStats } | { error: string } {
  const name = str(f.name, 60);
  if (!name) return { error: "Give the monster a name." };
  const actions = (f.actions ?? []).filter((a) => str(a.name, 60)).map((a) => {
    if (a.damage && !DICE.test(a.damage)) throw new Error(`${a.name}: damage like 2d6+3.`);
    return a.kind === "save"
      ? { name: str(a.name, 60), kind: "save" as const, dc: int(a.dc, 5, 30, 13), ability: (ABILITIES.includes(a.ability) ? a.ability : "DEX") as Ability, damage: str(a.damage, 30), damage_type: str(a.damage_type, 20).toLowerCase() }
      : { name: str(a.name, 60), kind: "attack" as const, bonus: int(a.bonus, -5, 20, 4), damage: str(a.damage, 30), damage_type: str(a.damage_type, 20).toLowerCase() };
  });
  if (!actions.length) return { error: "Add at least one action (an attack or a save)." };
  const multi = int(f.multiattack, 1, 6, 1);
  return { stats: {
    name, ac: int(f.ac, 5, 30, 13), hp: int(f.hp, 1, 999, 10), init: int(f.init, -5, 15, 0), cr: str(f.cr, 6) || undefined, size_type: str(f.size_type, 60) || undefined,
    actions: actions as MonsterStats["actions"], ...(multi > 1 ? { multiattack: { count: multi, uses: [actions[0].name] } } : {}),
  } };
}
/** In checkMonster an action with bad dice throws: this turns that into the usual answer. */
export function safeMonster(f: MonsterForm) { try { return checkMonster(f); } catch (e) { return { error: (e as Error).message }; } }

// ---------------------------------------------------------------- into the app's own shapes

export function toSpellInfo(d: SpellForm): SpellInfo {
  return {
    name: d.name, level: d.level, school: d.school, classes: d.classes, casting_time: d.casting_time, ritual: d.ritual, range: d.range, components: d.components,
    duration: d.duration, concentration: d.concentration, description: d.description, higher_levels: d.higher_levels || null,
    action: /bonus/i.test(d.casting_time) ? "bonus" : /reaction/i.test(d.casting_time) ? "reaction" : "action",
    roll: d.roll.kind === "none" ? null : {
      kind: d.roll.kind, damage: d.roll.damage, ...(d.roll.damage_type ? { damage_type: d.roll.damage_type } : {}),
      ...(d.roll.kind === "save" ? { save_ability: d.roll.save_ability as Ability, half_on_save: d.roll.half_on_save } : {}),
      ...(d.roll.per_level ? { per_level: d.roll.per_level } : {}), ...(d.level === 0 && d.roll.kind !== "heal" ? { cantrip_scaling: true } : {}),
    },
  } as SpellInfo;
}
export const toSpellLite = (d: SpellForm): SpellLite => ({
  name: d.name, level: d.level, school: d.school, classes: d.classes, concentration: d.concentration, ritual: d.ritual,
  casting_time: d.casting_time, range: d.range, duration: d.duration, description: d.description.slice(0, 1200),
});

/** Approved feats and subclasses as book rows, so the level-up engine and builder offer them. */
export function toBookRows(rows: HomebrewRow[]): BookRow[] {
  const out: BookRow[] = [];
  for (const r of rows) {
    if (r.status !== "approved") continue;
    if (r.kind === "feat") {
      const f = r.data as FeatForm;
      out.push({ kind: "feat", rules: r.rules, parent: "", name: f.name, book: "Homebrew", data: { name: f.name, category: f.category, prereq: f.prereq || null, text: f.text } });
    }
    if (r.kind === "subclass") {
      const s = r.data as SubclassForm;
      const levels: Record<string, Text[]> = {};
      for (const x of s.features) (levels[String(x.level)] ??= []).push({ name: x.name, text: x.text });
      const data: SubclassData = { name: s.name, flavor: s.flavor, text: s.text, levels, choices: {} };
      out.push({ kind: "subclass", rules: r.rules, parent: s.cls, name: s.name, book: "Homebrew", data });
    }
  }
  return out;
}
