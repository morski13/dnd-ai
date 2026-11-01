// One character's own rules (content from other books / homebrew that only this character has).
// Stored in characters.homebrew (SQL 27). Pure helpers, used by the sheet, the server and the rules engine.
//  - crit range: Improved Critical 19–20 (Champion 3), Superior Critical 18–20 (Champion 15), or set by hand
//  - extra crit dice: Brutal Critical (2014 Barbarian 9/13/17: 1/2/3 extra weapon dice on a melee crit), or by hand
//  - toggles: switched bonuses like "Flaming Tongue ignited: +2d6 fire" on one weapon (or all weapons)
// The character's own actions (Wild Surge…) are ordinary sheet attacks marked `custom: true`.
import type { Ability, Attack, TableRow, ThenEffect } from "./rules";

export type HomebrewToggle = {
  id: string;
  name: string;            // "Flaming Tongue ignited"
  on: boolean;
  applies_to: string;      // an attack's name, or "*" = every weapon attack
  damage: string;          // extra damage dice per hit, "2d6"
  damage_type?: string;    // "fire"
};

export type Homebrew = {
  crit_range?: number | null;       // null / missing = worked out from the classes
  extra_crit_dice?: number | null;  // null / missing = worked out from the classes
  toggles?: HomebrewToggle[];
};

export const DAMAGE_TYPES = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"];
const DICE = /^\s*\d{1,2}d(4|6|8|10|12|20)(\s*\+\s*\d{1,2}d(4|6|8|10|12|20))*(\s*[+-]\s*\d{1,2})?\s*$/i;
export const isDice = (s: string) => DICE.test(s);

type Classes = { class: string; level: number; subclass?: string }[];

/** What the classes give on their own (shown as "Auto" in the editor). */
export function autoCrit(classes: Classes, ruleSet?: string | null) {
  let range = 20;
  for (const c of classes) {
    if (/^fighter$/i.test(c.class) && /champion/i.test(c.subclass ?? "")) range = Math.min(range, c.level >= 15 ? 18 : c.level >= 3 ? 19 : 20);
  }
  let extra = 0;
  if (ruleSet !== "2024") {
    const barb = classes.find((c) => /^barbarian$/i.test(c.class));
    if (barb) extra = barb.level >= 17 ? 3 : barb.level >= 13 ? 2 : barb.level >= 9 ? 1 : 0;
  }
  return { range, extra };
}

/** The crit range and extra crit dice that count: the character's own setting, else what the classes give. */
export function critRules(c: { class_levels: Classes; homebrew?: Homebrew | null; rule_set?: string | null }) {
  const auto = autoCrit(c.class_levels ?? [], c.rule_set);
  const hb = c.homebrew ?? {};
  return {
    range: hb.crit_range != null ? hb.crit_range : auto.range,
    extra: hb.extra_crit_dice != null ? hb.extra_crit_dice : auto.extra,
    auto,
  };
}

/** Switched-on toggles that add damage to this attack. */
export function activeToggles(hb: Homebrew | null | undefined, attack: { name: string; kind: string }) {
  return (hb?.toggles ?? []).filter((t) => t.on && (t.applies_to === "*" ? attack.kind === "weapon" : t.applies_to.toLowerCase() === attack.name.toLowerCase()));
}

/** Cleans what the browser sends (never trust it). */
export function cleanHomebrew(input: unknown): Homebrew {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const int = (v: unknown, lo: number, hi: number) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : null);
  const toggles = (Array.isArray(o.toggles) ? o.toggles : []).slice(0, 12).flatMap((t): HomebrewToggle[] => {
    const x = (t ?? {}) as Record<string, unknown>;
    const name = String(x.name ?? "").trim().slice(0, 50);
    const damage = String(x.damage ?? "").replace(/\s/g, "").slice(0, 30);
    if (!name || !isDice(damage)) return [];
    const type = String(x.damage_type ?? "").toLowerCase();
    return [{
      id: String(x.id ?? "").slice(0, 40) || Math.random().toString(36).slice(2, 10),
      name, on: !!x.on, applies_to: String(x.applies_to ?? "*").trim().slice(0, 60) || "*", damage,
      ...(DAMAGE_TYPES.includes(type) ? { damage_type: type } : {}),
    }];
  });
  return { crit_range: int(o.crit_range, 15, 20), extra_crit_dice: int(o.extra_crit_dice, 0, 6), toggles };
}

// ---------------------------------------------------------------------------
// The character's own actions (saved as sheet attacks with `custom: true`).
// ---------------------------------------------------------------------------

export const CUSTOM_KINDS = {
  weapon: "Weapon attack",
  spell_attack: "Spell attack",
  save: "Saving throw",
  damage_only: "Damage, no attack roll",
  heal: "Healing",
  boost: "Bonus to my hits",
  table: "Roll on a table",
  roll: "Just a roll",
} as const;
export type CustomKind = keyof typeof CUSTOM_KINDS;
const ACTIONS = ["action", "bonus", "reaction", "free", "other"] as const;
const ABIL = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;

/** Cleans an action from the editor. `resources` = the names the character has (for "uses …"). */
export function cleanCustomAction(input: unknown, resources: string[]): Attack | { error: string } {
  const x = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const name = String(x.name ?? "").trim().replace(/\s+/g, " ").slice(0, 50);
  if (!name) return { error: "Give the action a name." };
  const kind = String(x.kind ?? "") as CustomKind;
  if (!(kind in CUSTOM_KINDS)) return { error: "Pick what kind of action it is." };
  const damage = String(x.damage ?? "").replace(/\s/g, "");
  const flatBonus = Number(x.damage_bonus ?? 0);
  if (damage && !isDice(damage)) return { error: `"${damage}" isn't dice the app can roll. Write it like 1d10 or 2d6+3.` };
  if ((kind === "damage_only" || kind === "heal") && !damage) return { error: "Write the dice it rolls, like 1d10." };
  if (kind === "boost" && !damage && !(flatBonus > 0) && !x.gives_advantage && !x.resource) return { error: "A bonus needs extra dice, a flat number, advantage or a use it spends." };

  if (kind === "table" && !damage) return { error: "Write the table's die, like 1d8." };
  if (kind === "roll" && !damage) return { error: "Write the dice it rolls, like 1d4." };
  const ability = String(x.ability ?? "");
  const type = String(x.damage_type ?? "").toLowerCase();
  const action = String(x.action ?? "action");
  const resource = String(x.resource ?? "");
  const bonus = Math.round(Number(x.bonus ?? 0));
  const out: Attack = {
    name, kind, custom: true,
    action: (ACTIONS as readonly string[]).includes(action) ? (action as Attack["action"]) : "action",
    ...(damage ? { damage } : {}),
    ...(DAMAGE_TYPES.includes(type) ? { damage_type: type } : {}),
    ...(resource && resources.includes(resource) ? { resource } : {}),
    ...(String(x.range ?? "").trim() ? { range: String(x.range).trim().slice(0, 30) } : {}),
    ...(String(x.note ?? "").trim() ? { note: String(x.note).trim().slice(0, 200) } : {}),
  };
  if (kind === "weapon") {
    out.ability = ability === "finesse" || ability === "DEX" ? (ability as "finesse" | "DEX") : "STR";
    out.add_mod = x.add_mod !== false;
    if (x.ranged) out.ranged = true;
    if (Number.isFinite(bonus) && bonus) out.bonus = Math.max(-5, Math.min(5, bonus));
  } else if (kind === "spell_attack") {
    out.ability = "spell";
    out.add_mod = !!x.add_mod;
  } else if (kind === "save") {
    out.ability = "spell";
    out.save_ability = (ABIL as readonly string[]).includes(String(x.save_ability)) ? (x.save_ability as Attack["save_ability"]) : "DEX";
    out.half_on_save = !!x.half_on_save;
    out.add_mod = !!x.add_mod;
  } else if (kind === "damage_only" || kind === "heal") {
    out.ability = (ABIL as readonly string[]).includes(ability) ? (ability as Attack["ability"]) : ability === "spell" ? "spell" : undefined;
    out.add_mod = !!x.add_mod && !!out.ability;
    if (!out.ability) delete out.ability;
  } else if (kind === "boost") {
    const applies = String(x.applies ?? "weapon");
    if (damage || flatBonus > 0 || x.gives_advantage) out.applies = (["str_weapon", "finesse_ranged", "weapon", "attack"] as const).find((a) => a === applies) ?? "weapon";
    if (flatBonus > 0) out.damage_bonus = Math.min(20, Math.round(flatBonus));
    if (x.once_per_turn) out.once_per_turn = true;
    if (x.gives_advantage) out.gives_advantage = true;
    out.action = (ACTIONS as readonly string[]).includes(action) ? (action as Attack["action"]) : "free";
  } else if (kind === "table") {
    const rows = cleanRows(x.table, damage);
    if ("error" in rows) return rows;
    out.table = rows;
  }

  // extras that work on any kind
  const trig = String(x.trigger_on ?? "");
  if (trig && resources.includes(trig) && trig !== out.resource) out.trigger_on = trig;
  if (x.many && (kind === "damage_only" || kind === "save" || kind === "heal")) out.many = true;
  const dcA = String(x.dc_ability ?? "");
  if ((ABIL as readonly string[]).includes(dcA) && (kind === "save" || kind === "table")) out.dc_ability = dcA as Ability;
  if (x.spend_rolled && out.resource && (kind === "roll" || kind === "damage_only" || kind === "heal")) out.spend_rolled = true;
  const then = cleanThen(x.then);
  if (then) out.then = then;
  return out;
}

function cleanThen(input: unknown): ThenEffect | undefined {
  const t = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: ThenEffect = {};
  if (t.temp_hp === "dealt" || t.temp_hp === "rolled") out.temp_hp = t.temp_hp;
  const x = Math.round(Number(t.self_damage_x ?? 0));
  if (x > 0) out.self_damage_x = Math.min(10, x);
  const type = String(t.self_damage_type ?? "").toLowerCase();
  if (out.self_damage_x && DAMAGE_TYPES.includes(type)) out.self_damage_type = type;
  return Object.keys(out).length ? out : undefined;
}

const ROW_KINDS = ["damage_only", "save", "heal", "roll"] as const;
/** A table's rows: each covers min–max on the die; together they must cover every number once. */
function cleanRows(input: unknown, die: string): TableRow[] | { error: string } {
  const sides = Number(die.match(/^1d(\d+)$/i)?.[1] ?? 0);
  if (!sides) return { error: "A table rolls one die, like 1d8 or 1d20." };
  const rows: TableRow[] = [];
  for (const raw of (Array.isArray(input) ? input : []).slice(0, 100)) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const min = Math.round(Number(r.min)), max = Math.round(Number(r.max ?? r.min));
    const name = String(r.name ?? "").trim().slice(0, 40);
    if (!name || !Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < min || max > sides) return { error: `Table rows need a name and numbers from 1 to ${sides}.` };
    const e = (r.effect ?? null) as Record<string, unknown> | null;
    let effect: TableRow["effect"] = null;
    if (e && (ROW_KINDS as readonly string[]).includes(String(e.kind))) {
      const dmg = String(e.damage ?? "").replace(/\s/g, "");
      if (dmg ? !isDice(dmg) : e.kind !== "save") return { error: `Row “${name}”: write its dice, like 2d8.` };
      const type = String(e.damage_type ?? "").toLowerCase();
      const sa = String(e.save_ability ?? "");
      effect = {
        kind: e.kind as (typeof ROW_KINDS)[number], ...(dmg ? { damage: dmg } : {}),
        ...(DAMAGE_TYPES.includes(type) ? { damage_type: type } : {}),
        ...(e.kind === "save" ? { save_ability: ((ABIL as readonly string[]).includes(sa) ? sa : "DEX") as Ability, half_on_save: !!e.half_on_save } : {}),
        ...(e.many ? { many: true } : {}),
        ...(cleanThen(e.then) ? { then: cleanThen(e.then) } : {}),
      };
    }
    rows.push({ min, max, name, ...(String(r.text ?? "").trim() ? { text: String(r.text).trim().slice(0, 300) } : {}), effect });
  }
  rows.sort((a, b) => a.min - b.min);
  for (let n = 1; n <= sides; n++) {
    const hits = rows.filter((r) => n >= r.min && n <= r.max).length;
    if (hits !== 1) return { error: hits ? `The number ${n} is on more than one row.` : `No row for a roll of ${n}.` };
  }
  return rows;
}
