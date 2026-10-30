// Reads monster attacks out of stat block text, both the 2014 and the 2024 way of writing them:
//   2014: "Bite. Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 10 (2d6 + 3) piercing damage."
//   2024: "Bite. Melee Attack Roll: +5, reach 5 ft. Hit: 10 (2d6 + 3) Piercing damage."
//   saves: "Fire Breath (Recharge 5–6). … DC 13 Dexterity saving throw, taking 22 (4d10) fire damage … half as much damage …"
//   2024 saves: "Dexterity Saving Throw: DC 13, each creature in a 15-foot Cone. Failure: 22 (4d10) Fire damage. Success: Half damage."
import type { MonsterAction } from "../encounter/build";
import type { Ability } from "../rules";

const ABIL: Record<string, Ability> = { strength: "STR", dexterity: "DEX", constitution: "CON", intelligence: "INT", wisdom: "WIS", charisma: "CHA" };
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, once: 1, twice: 2, thrice: 3 };

/** "2d6 + 3" → "2d6+3"; "1d4 − 1" → "1d4-1" */
export const cleanDice = (s: string) => s.replace(/[−–]/g, "-").replace(/\s+/g, "");
const avgOf = (dice: string) => {
  let t = 0;
  for (const m of cleanDice(dice).matchAll(/([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/g)) {
    if (m[3]) t += (m[1] === "-" ? -1 : 1) * (Number(m[2] || 1) * (Number(m[3]) + 1)) / 2;
    else if (m[5]) t += (m[4] === "-" ? -1 : 1) * Number(m[5]);
  }
  return Math.floor(t);
};

/** Splits a text cell into entries: one per paragraph that starts with "Name." */
export function entries(text: string): string[] {
  const lines = text.replace(/\r/g, "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out: string[] = [];
  for (const l of lines) {
    // a new entry starts with a short name ending in a period ("Bite.", "Fire Breath (Recharge 5–6).")
    if (/^[A-Z][^.]{0,60}\.\s/.test(l) || !out.length) out.push(l);
    else out[out.length - 1] += " " + l; // continuation (a list, a second paragraph)
  }
  return out;
}

const nameOf = (entry: string) => entry.match(/^([^.]{1,60})\./)?.[1].trim() ?? "";
const baseName = (n: string) => n.replace(/\s*\((?:recharge|\d+\/day)[^)]*\)\s*/i, "").trim();

export type ParsedActions = { actions: MonsterAction[]; multiattack?: { count: number; uses: string[] }; unread: string[] };

export function readActions(text: string): ParsedActions {
  const actions: MonsterAction[] = [];
  const unread: string[] = [];
  let multi: { count: number; uses: string[]; text: string } | undefined;
  for (const e of entries(text)) {
    const full = nameOf(e);
    const name = full.replace(/[–—]/g, "-"); // "Fire Breath (Recharge 5-6)", like the SRD rows
    const recharge = full.match(/recharge\s*(\d)/i) ? Number(full.match(/recharge\s*(\d)/i)![1]) : undefined;
    const perDay = full.match(/(\d+)\/day/i) ? Number(full.match(/(\d+)\/day/i)![1]) : undefined;
    const extra = { ...(recharge ? { recharge } : {}), ...(perDay ? { per_day: perDay } : {}) };

    if (/^multiattack$/i.test(baseName(name))) {
      multi = { count: 0, uses: [], text: e };
      continue;
    }
    const atk = e.match(/(Melee or Ranged|Melee|Ranged)\s+(?:Weapon\s+|Spell\s+)?Attack(?: Roll)?:\s*\+?(-?\d+)/i);
    const hit = e.match(/Hit:\s*(\d+)\s*\(([^)]+)\)\s*([A-Za-z]+)\s+damage/i) ?? e.match(/Hit:\s*(\d+)\s+([A-Za-z]+)\s+damage/i);
    if (atk) {
      let dice = hit && hit[2] && /^\d*d\d+/.test(hit[2]) ? cleanDice(hit[2]) : hit ? hit[1] : "";
      // "plus 7 (2d6) Fire damage" counts too, unless it only happens sometimes ("… if the attack roll had Advantage")
      const after = e.slice(e.search(/Hit:/i));
      for (const p of after.matchAll(/plus\s+\d+\s*\((\d+d\d+(?:\s*[+−–-]\s*\d+)?)\)\s*[A-Za-z]+\s+damage(?!\s+(?:if|when|while|against))/gi)) if (dice) dice += "+" + cleanDice(p[1]);
      const type = hit ? (hit[3] ?? hit[2]).toLowerCase() : "";
      if (!dice) { unread.push(full); continue; }
      actions.push({
        name, kind: "attack", bonus: Number(atk[2]), damage: dice, avg: hit ? Number(hit[1]) : avgOf(dice),
        damage_type: type, ranged: /^ranged/i.test(atk[1]), ...extra,
      });
      continue;
    }
    // saving throws: 2014 "DC 13 Dexterity saving throw", 2024 "Dexterity Saving Throw: DC 13"
    const save = e.match(/DC\s*(\d+)\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw/i)
      ?? e.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+Saving Throw:\s*DC\s*(\d+)/i);
    if (save) {
      const dc = Number(/^\d/.test(save[1]) ? save[1] : save[2]);
      const ab = ABIL[(/^\d/.test(save[1]) ? save[2] : save[1]).toLowerCase()];
      const dmg = e.match(/(\d+)\s*\((\d+d\d+(?:\s*[+−–-]\s*\d+)?)\)\s*([A-Za-z]+)\s+damage/i);
      if (!dmg) continue; // a save with no damage (a condition): the simulator skips those anyway
      const area = /cone|line|sphere|cube|cylinder|emanation|radius|each creature/i.test(e);
      actions.push({
        name, kind: "save", save_ability: ab, dc, damage: cleanDice(dmg[2]), avg: Number(dmg[1]), damage_type: dmg[3].toLowerCase(),
        half: /half as much|half damage|success:\s*half/i.test(e), targets: area ? 2 : 1, ...extra,
      });
      continue;
    }
    if (/\bdamage\b/i.test(e) && /\d+d\d+/.test(e)) unread.push(full); // looks like an attack we couldn't read
  }

  let multiattack: ParsedActions["multiattack"];
  if (multi) {
    // the first sentence, and only its first option ("… or it makes two Hurl Flame attacks")
    const t = multi.text.replace(/^[^.]*\.\s*/, "").split(/\.\s/)[0].split(/,\s+or\s+|\s+or\s+(?:it|the|they)\b/)[0].toLowerCase();
    const attackNames = actions.filter((a) => a.kind === "attack").map((a) => a.name);
    const uses = attackNames.filter((n) => t.includes(n.toLowerCase().replace(/s$/, "")));
    // "makes three attacks", "makes two Claw attacks", "one with its Bite and two with its Claws"
    const counts = [...t.matchAll(/\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b(?=[^.]*?(?:attack|with))/g)].map((m) => WORDS[m[1]] ?? Number(m[1]));
    const total = /makes (one|two|three|four|five|six|\d+) attacks/.test(t)
      ? WORDS[t.match(/makes (one|two|three|four|five|six|\d+) attacks/)![1]] ?? Number(t.match(/makes (\d+) attacks/)?.[1])
      : counts.reduce((s, n) => s + n, 0);
    if (total > 0) multiattack = { count: total, uses: uses.length ? uses : attackNames };
    else unread.push("Multiattack");
    actions.unshift({ name: "Multiattack", kind: "multiattack", count: total || 1 });
  }
  return { actions, multiattack, unread };
}
