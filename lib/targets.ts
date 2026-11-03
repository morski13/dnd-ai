// Who a spell or trick can be aimed at from the character sheet (outside the Session tab's turn card).
// Healing always asks; buff spells that pick creatures ("you touch a creature", "up to three creatures") ask too.
// Attacks, damage and save spells are aimed in Session mode, where the monsters are.
import type { Option } from "./rules";

/** How many creatures you pick: one, or up to `max` (null = any number). */
export type Aim = { many: boolean; max: number | null; heal: boolean };

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const num = (w: string) => WORDS[w.toLowerCase()] ?? (Number(w) || 0);

/** The spell's own count of creatures, read from its text. */
export function creatureCount(text: string): { many: boolean; max: number | null } | null {
  const t = text.replace(/\s+/g, " ");
  const upTo = t.match(/up to (\w+) (?:willing )?creatures/i) ?? t.match(/(\w+) or fewer creatures/i);
  if (upTo && num(upTo[1]) > 1) return { many: true, max: num(upTo[1]) };
  if (/any number of creatures/i.test(t)) return { many: true, max: null };
  if (/\b(?:a|one) (?:willing )?creature\b|creature you touch/i.test(t)) return { many: false, max: 1 };
  return null;
}

/** "You can target one additional creature for each spell slot level above 1." */
function extraPerLevel(text: string) {
  return /(?:target|affect|choose) one additional creature for each (?:spell )?slot level above/i.test(text.replace(/\s+/g, " "));
}

const ABILITY = "(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)";
/** A spell that makes its targets save, or attacks them, is aimed at enemies, so the sheet doesn't offer the party for it.
 *  (Sanctuary makes the creatures attacking your friend save, so it stays a spell for friends.) */
function hostile(text: string) {
  const t = text.replace(/\s+/g, " ");
  if (/any creature who targets the warded creature/i.test(t)) return false;
  return new RegExp(`must (?:each )?(?:make|succeed on) an? ${ABILITY} saving throw|makes? an? ${ABILITY} saving throw|spell attack`, "i").test(t);
}

/** Words a spell for your friends uses (Bless, Aid, Haste, Shield of Faith, Death Ward, Sanctuary…). */
const friendly = (text: string) =>
  /willing|of your choice|you touch|creature you touch|regains?\b|\bheal(?:s|ed|ing)?\b|\ball(?:y|ies)\b|you bless|choose (?:up to|any number)|you ward a creature/i.test(text);

/** Can this option be aimed at someone from the sheet? `slot` is the slot level it's cast with. */
export function aimOf(o: Option | null | undefined, slot?: number): Aim | null {
  if (!o || o.row_of) return null;
  const s = o.fromSpell;
  const text = s?.description ?? "";
  const more = `${text} ${s?.higher_levels ?? ""}`;
  const self = /^self\b/i.test(o.range ?? s?.range ?? "") && !/^self \(/i.test(o.range ?? s?.range ?? "");
  let count: { many: boolean; max: number | null } | null = null;
  if (o.kind === "heal") {
    if (self) return null; // Second Wind and the like heal only you
    count = (s ? creatureCount(text) : null) ?? { many: !!o.many, max: o.many ? null : 1 };
  } else if (o.kind === "boost" && s) {
    if (self || hostile(text) || !friendly(text)) return null;
    count = creatureCount(text);
    if (!count) return null;
  } else {
    return null;
  }
  let max = count.max;
  if (s && max != null && slot && slot > s.level && extraPerLevel(more)) max += slot - s.level;
  return { many: count.many || (max != null && max > 1), max, heal: o.kind === "heal" };
}

export type PartyMember = { id: string; name: string; hp: number | null; max: number | null; temp: number };

/** Who to pick first for a heal: the most hurt (by share of HP lost), you included; nobody hurt → you. */
export function mostHurt(party: PartyMember[], meId: string): string {
  let best: PartyMember | null = null;
  let bestLost = 0;
  for (const p of party) {
    if (p.hp == null || !p.max) continue;
    const lost = (p.max - p.hp) / p.max;
    if (lost > bestLost || (lost === bestLost && best && p.id === meId)) { best = p; bestLost = lost; }
  }
  return best && bestLost > 0 ? best.id : meId;
}
