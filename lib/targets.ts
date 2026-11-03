// Who a spell or trick can be aimed at from the character sheet.
// Healing always asks; buff spells that pick creatures ("you touch a creature", "up to three creatures") ask too.
// While a fight is running, attacks, damage and enemy spells ask too, with the monsters in the fight.
import type { Health } from "./moderator/hp";
import type { Option } from "./rules";

/** How many creatures you pick: one, or up to `max` (null = any number). `foe` = aimed at enemies. */
export type Aim = { many: boolean; max: number | null; heal: boolean; foe: boolean };

/** One creature the sheet can aim at. key = "c:<character id>" or "m:<monster id>". */
export type AimChoice = {
  key: string; name: string; side: "party" | "enemy"; me?: boolean; inFight?: boolean;
  hp: number | null; max: number | null; temp: number; health: Health;
};

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

/** An area save spell (Fireball: "each creature in a 20-foot-radius Sphere") hits any number in the area. */
const areaWords = (text: string) => /each creature (?:in|within)|creatures? in (?:a|the) \d+-foot|-foot-radius|-foot (?:cone|cube|line|sphere|emanation)/i.test(text);

/**
 * Can this option be aimed at someone from the sheet? `slot` is the slot level it's cast with.
 * Outside a fight only heals and buffs ask (there's nobody to attack); in a fight attacks and enemy spells ask too.
 */
export function aimOf(o: Option | null | undefined, slot?: number, inFight = false): Aim | null {
  if (!o || o.row_of) return null;
  const s = o.fromSpell;
  const text = s?.description ?? "";
  const more = `${text} ${s?.higher_levels ?? ""}`;
  const self = /^self\b/i.test(o.range ?? s?.range ?? "") && !/^self \(/i.test(o.range ?? s?.range ?? "");
  let count: { many: boolean; max: number | null } | null = null;
  let foe = false;
  if (o.kind === "heal") {
    if (self) return null; // Second Wind and the like heal only you
    count = (s ? creatureCount(text) : null) ?? { many: !!o.many, max: o.many ? null : 1 };
  } else if (o.kind === "boost" && s && !self && !hostile(text) && friendly(text)) {
    count = creatureCount(text);
    if (!count) return null;
  } else if (!inFight) {
    return null;
  } else if (o.kind === "weapon" || o.kind === "spell_attack" || o.kind === "damage_only") {
    foe = true;
    count = o.many ? { many: true, max: null } : (s && o.kind === "spell_attack" ? creatureCount(text) : null) ?? { many: false, max: 1 };
  } else if (o.kind === "save" || (o.kind === "boost" && s && !self && hostile(text))) {
    foe = true;
    count = (s ? creatureCount(text) : null) ?? (o.many || areaWords(text) ? { many: true, max: null } : { many: false, max: 1 });
    if (areaWords(text) && count.max === 1) count = { many: true, max: null };
  } else {
    return null;
  }
  let max = count.max;
  if (s && max != null && slot && slot > s.level && extraPerLevel(more)) max += slot - s.level;
  return { many: count.many || (max != null && max > 1), max, heal: o.kind === "heal", foe };
}

/** Who is ticked when the picker opens. */
export function firstPick(aim: Aim, choices: AimChoice[], last: string[] | undefined): string[] {
  const alive = (k: string) => choices.some((c) => c.key === k && (c.side === "enemy" ? c.health !== "down" : true));
  const kept = (last ?? []).filter(alive);
  if (aim.foe) {
    const want = kept.filter((k) => choices.find((c) => c.key === k)?.side === "enemy");
    if (want.length) return aim.many ? want.slice(0, aim.max ?? undefined) : want.slice(0, 1);
    const first = choices.find((c) => c.side === "enemy" && c.health !== "down");
    return first ? [first.key] : [];
  }
  const friends = choices.filter((c) => c.side === "party");
  if (aim.heal) {
    const me = friends.find((c) => c.me)?.key ?? friends[0]?.key;
    const hurt = mostHurt(friends.map((c) => ({ id: c.key, name: c.name, hp: c.hp, max: c.max, temp: c.temp })), me ?? "");
    return hurt ? [hurt] : [];
  }
  const want = kept.filter((k) => friends.some((c) => c.key === k));
  if (want.length) return want.slice(0, aim.max ?? undefined);
  const me = friends.find((c) => c.me);
  return me ? [me.key] : [];
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

/**
 * Which characters a viewer may see in the "Who gets …?" list: the DM sees everyone; a player sees only
 * characters that players made or imported (owned by a player member, or by themselves). The DM's own
 * characters, NPCs and unclaimed characters stay private.
 */
export function visibleParty<T extends { owner_user_id: string | null }>(
  chars: T[], roles: Record<string, string>, viewerId: string, viewerIsDm: boolean,
): T[] {
  if (viewerIsDm) return chars;
  return chars.filter((c) => !!c.owner_user_id && (c.owner_user_id === viewerId || roles[c.owner_user_id] === "player"));
}
