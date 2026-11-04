// Battle engine, part 2: damage types against a creature's defenses. Pure, tested.
// Stat blocks write them as text: "fire; bludgeoning, piercing, and slashing from nonmagical attacks".
import type { Factor } from "../moderator/hp";

export const DAMAGE_TYPES = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];
const PHYSICAL = new Set(["bludgeoning", "piercing", "slashing"]);

/** One defense: a damage type, maybe only against nonmagical attacks (or ones not made with silvered / adamantine weapons). */
export type Defense = { type: DamageType; nonmagicalOnly: boolean };
export type Defenses = { resist: Defense[]; immune: Defense[]; vulnerable: Defense[]; conditionImmune: string[] };
export const NO_DEFENSES: Defenses = { resist: [], immune: [], vulnerable: [], conditionImmune: [] };

/** Reads a stat block's text (or a list) into damage types. */
export function parseDamageList(input: unknown): Defense[] {
  const parts = Array.isArray(input) ? input.map(String) : typeof input === "string" ? [input] : [];
  const out: Defense[] = [];
  for (const raw of parts) {
    // "fire; bludgeoning, piercing, and slashing from nonmagical attacks": each ';' part on its own
    for (const chunk of raw.toLowerCase().split(/;/)) {
      const nonmagical = /nonmagical|not made with|that aren't (?:magical|silvered|adamantine)|non-magical/.test(chunk);
      for (const t of DAMAGE_TYPES) {
        if (new RegExp(`\\b${t}\\b`).test(chunk)) {
          if (!out.some((d) => d.type === t && d.nonmagicalOnly === (nonmagical && PHYSICAL.has(t)))) out.push({ type: t, nonmagicalOnly: nonmagical && PHYSICAL.has(t) });
        }
      }
    }
  }
  return out;
}

const CONDITION_NAMES = ["blinded", "charmed", "deafened", "exhaustion", "frightened", "grappled", "incapacitated", "invisible", "paralyzed", "petrified", "poisoned", "prone", "restrained", "stunned", "unconscious"];

/** Defenses from a monster's stat block (several spellings: resistances / damage_resistances, arrays or text). */
export function defensesOf(statBlock: unknown): Defenses {
  const s = (statBlock && typeof statBlock === "object" ? statBlock : {}) as Record<string, unknown>;
  const pick = (...keys: string[]) => keys.map((k) => s[k]).find((v) => v != null);
  const condRaw = pick("condition_immunities", "conditionImmunities");
  const condText = (Array.isArray(condRaw) ? condRaw.map((x) => (typeof x === "object" && x ? (x as { name?: string }).name ?? "" : String(x))) : [String(condRaw ?? "")]).join(", ").toLowerCase();
  return {
    resist: parseDamageList(pick("resistances", "damage_resistances", "damageResistances")),
    immune: parseDamageList(pick("immunities", "damage_immunities", "damageImmunities")),
    vulnerable: parseDamageList(pick("vulnerabilities", "damage_vulnerabilities", "damageVulnerabilities")),
    conditionImmune: CONDITION_NAMES.filter((c) => condText.includes(c)).map((c) => c[0].toUpperCase() + c.slice(1)),
  };
}

/** The damage types in a roll's type text ("fire + radiant", "Slashing"). */
export function typesIn(text: string | null | undefined): DamageType[] {
  const t = (text ?? "").toLowerCase();
  return DAMAGE_TYPES.filter((x) => new RegExp(`\\b${x}\\b`).test(t));
}

/**
 * How damage of these types lands on these defenses. Several types in one roll: the strongest defense that
 * covers every type wins (a fire + radiant spell on a fire-resistant creature isn't halved: the app has one total).
 * `magical`: the attack counts as magical (spells always do; weapons only when the sheet says so).
 * Conditions: Petrified gives resistance to all damage.
 */
export function factorFor(types: DamageType[], d: Defenses, o: { magical: boolean; conds?: readonly string[] } = { magical: false }): { factor: Factor; why: string | null } {
  if (!types.length) return { factor: "full", why: null };
  const covers = (list: Defense[]) => types.every((t) => list.some((x) => x.type === t && (!x.nonmagicalOnly || !o.magical)));
  const names = types.join(" + ");
  if (covers(d.immune)) return { factor: "immune", why: `immune to ${names}` };
  const petrified = (o.conds ?? []).includes("Petrified");
  const resist = covers(d.resist) || petrified;
  const vuln = covers(d.vulnerable);
  if (resist && vuln) return { factor: "full", why: `resistant and vulnerable to ${names}: they cancel out` };
  if (resist) return { factor: "resist", why: petrified && !covers(d.resist) ? "Petrified: resistant to all damage" : `resistant to ${names}` };
  if (vuln) return { factor: "double", why: `vulnerable to ${names}` };
  return { factor: "full", why: null };
}

/** Can this condition be put on the creature? */
export function conditionBlocked(condition: string, d: Defenses): string | null {
  const base = condition.replace(/\s+\d$/, "");
  return d.conditionImmune.includes(base) ? `immune to being ${base}` : null;
}
