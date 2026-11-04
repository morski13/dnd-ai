// Session recap: what happened in one session, worked out from its rolls and HP changes.
// Pure (tested). Uses the same rules as the statistics (lib/stats/compute.ts), plus a timeline of the
// moments worth retelling: fights, crits, natural 1s, the biggest hit, knock-outs and big heals.
// `facts()` turns it into short lines for the AI that writes the story; the AI gets nothing else.
import { awards, baseName, computeStats, knockouts, type ActorStats, type Award, type StatActor, type StatEffect, type StatRoll } from "./compute";

export type Moment = {
  at: string;
  kind: "fight" | "crit" | "fumble" | "big-hit" | "down" | "pc-down" | "heal";
  text: string;
  who: string | null; // the character it's about (key), for colours
};

export type Hero = {
  key: string; name: string;
  damage: number; healing: number; kills: number; attacks: number; hits: number;
  biggest: { amount: number; source: string } | null;
  nat20: number; nat1: number; spells: number; dropped: number; taken: number;
  topAttack: string | null; topSpell: string | null;
};

export type Recap = {
  start: string | null; end: string | null; minutes: number;
  party: { damage: number; healing: number; kills: number; dropped: number; rolls: number; nat20: number; nat1: number; fights: number };
  heroes: Hero[];
  fights: { id: string; name: string; rounds: number; enemiesDown: number; pcsDropped: number }[];
  moments: Moment[];
  awards: Award[];
  mvp: string | null;
  /** Character keys: who drew the party's first blood, and who landed the last knock-out on an enemy. */
  firsts: { firstBlood: string | null; lastWord: string | null };
};

const keyOf = (c: string | null, m: string | null) => (c ? `c:${c}` : m ? `m:${m}` : null);

export function buildRecap(
  rolls: StatRoll[], effects: StatEffect[], actors: StatActor[],
  combats: { id: string; name: string | null; round: number }[], spellNames: Set<string> = new Set(),
): Recap {
  const ordered = [...rolls].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const byKey = new Map(actors.map((a) => [a.key, a]));
  const name = (k: string | null) => (k ? byKey.get(k)?.name ?? "Someone" : "Someone");
  const isChar = (k: string | null) => !!k && k.startsWith("c:");
  const all = computeStats(ordered, effects, actors, spellNames);
  const chars = actors.filter((a) => a.kind === "character").map((a) => all.get(a.key)).filter((s): s is ActorStats => !!s && s.rolls > 0);

  // what actually landed (linked HP change), like the statistics
  const linked = new Map<string, number>();
  for (const e of effects) if (e.roll_event_id && (e.kind === "damage" || e.kind === "heal")) linked.set(e.roll_event_id, (linked.get(e.roll_event_id) ?? 0) + (e.amount ?? 0));
  const landed = (r: StatRoll) => linked.get(r.id) ?? r.total ?? 0;
  const childOf = new Map<string, StatRoll>();
  for (const r of ordered) if (r.parent_roll_id && r.roll_type === "damage" && !childOf.has(r.parent_roll_id)) childOf.set(r.parent_roll_id, r);

  const moments: Moment[] = [];
  // fights: when the first roll of each fight happened
  const seenFight = new Set<string>();
  const fightName = new Map(combats.map((c) => [c.id, c.name || "A fight"]));
  for (const r of ordered) {
    if (!r.combat_id || seenFight.has(r.combat_id)) continue;
    seenFight.add(r.combat_id);
    const c = combats.find((x) => x.id === r.combat_id);
    moments.push({ at: r.created_at, kind: "fight", who: null, text: `${fightName.get(r.combat_id) ?? "A fight"} begins${c?.round ? ` (${c.round} round${c.round === 1 ? "" : "s"})` : ""}.` });
  }
  // natural 20s on attacks, with the damage that followed
  const crits = ordered.filter((r) => r.roll_type === "attack" && r.is_crit);
  for (const r of crits.filter((x) => isChar(keyOf(x.character_id, x.monster_id))).slice(0, 6)) {
    const who = keyOf(r.character_id, r.monster_id);
    const target = keyOf(r.target_character_id, r.target_monster_id);
    const dmg = childOf.get(r.id);
    moments.push({
      at: r.created_at, kind: "crit", who,
      text: `${name(who)} rolled a natural 20 with ${baseName(r.source)}${target ? ` against ${name(target)}` : ""}${dmg ? ` for ${landed(dmg)} damage` : ""}.`,
    });
  }
  for (const r of crits.filter((x) => !isChar(keyOf(x.character_id, x.monster_id))).slice(0, 2)) {
    const who = keyOf(r.character_id, r.monster_id), target = keyOf(r.target_character_id, r.target_monster_id);
    moments.push({ at: r.created_at, kind: "crit", who: target && isChar(target) ? target : null, text: `${name(who)} landed a critical hit${target ? ` on ${name(target)}` : ""}.` });
  }
  // natural 1s by the party
  const fumbles = ordered.filter((r) => r.is_fumble && isChar(keyOf(r.character_id, null)) && ["attack", "save", "check", "ability"].includes(r.roll_type));
  for (const r of fumbles.slice(0, 3)) {
    const who = keyOf(r.character_id, null);
    moments.push({ at: r.created_at, kind: "fumble", who, text: `${name(who)} rolled a natural 1 on ${r.roll_type === "attack" ? `an attack with ${baseName(r.source)}` : baseName(r.source)}.` });
  }
  // the biggest hit by the party
  let big: StatRoll | null = null;
  for (const r of ordered) if (r.roll_type === "damage" && isChar(keyOf(r.character_id, null)) && r.target_character_id !== r.character_id && (!big || landed(r) > landed(big))) big = r;
  if (big && landed(big) > 0 && !crits.some((c) => childOf.get(c.id)?.id === big!.id)) {
    const who = keyOf(big.character_id, null), target = keyOf(big.target_character_id, big.target_monster_id);
    moments.push({ at: big.created_at, kind: "big-hit", who, text: `The biggest hit: ${name(who)}'s ${baseName(big.source)} for ${landed(big)} damage${target ? ` on ${name(target)}` : ""}.` });
  }
  // knock-outs
  const kos = knockouts(ordered, effects, actors, (r) => landed(r));
  const when = (victim: string) => {
    const e = effects.find((x) => x.dropped_to_zero && keyOf(x.target_character_id, x.target_monster_id) === victim);
    if (e) return e.created_at;
    let at: string | null = null;
    for (const r of ordered) if (r.roll_type === "damage" && keyOf(r.target_character_id, r.target_monster_id) === victim) at = r.created_at;
    return at ?? ordered[ordered.length - 1]?.created_at ?? "";
  };
  for (const k of kos) {
    const pc = isChar(k.victim);
    moments.push({
      at: when(k.victim), kind: pc ? "pc-down" : "down", who: pc ? k.victim : k.killer,
      text: pc ? `${name(k.victim)} dropped to 0 HP${k.killer ? `, struck down by ${name(k.killer)}` : ""}.` : `${name(k.killer)} took down ${name(k.victim)}.`,
    });
  }
  // the biggest heal
  let heal: StatEffect | null = null;
  for (const e of effects) if (e.kind === "heal" && (e.amount ?? 0) > (heal?.amount ?? 0)) heal = e;
  if (heal && (heal.amount ?? 0) >= 5) {
    const who = keyOf(heal.actor_character_id, heal.actor_monster_id), target = keyOf(heal.target_character_id, heal.target_monster_id);
    moments.push({ at: heal.created_at, kind: "heal", who, text: `${name(who)} healed ${who === target ? "themselves" : name(target)} for ${heal.amount} HP.` });
  }
  moments.sort((a, b) => a.at.localeCompare(b.at));

  const heroes: Hero[] = chars.map((s) => ({
    key: s.key, name: s.name, damage: s.damageDealt, healing: s.healingDone, kills: s.kills, attacks: s.attacks, hits: s.hits,
    biggest: s.biggestHit, nat20: s.nat20, nat1: s.nat1, spells: s.spellsCast, dropped: s.timesDropped, taken: s.damageTaken,
    topAttack: s.mostUsedAttack, topSpell: s.mostUsedSpell,
  })).sort((a, b) => b.damage + b.healing - (a.damage + a.healing));

  const sum = (f: (h: Hero) => number) => heroes.reduce((n, h) => n + f(h), 0);
  const fights = combats.filter((c) => seenFight.has(c.id)).map((c) => {
    const mine = kos.filter((k) => k.combatId === c.id);
    return {
      id: c.id, name: c.name || "Fight", rounds: Math.max(c.round ?? 0, ...ordered.filter((r) => r.combat_id === c.id).map((r) => r.round ?? 0)),
      enemiesDown: mine.filter((k) => !isChar(k.victim) && !byKey.get(k.victim)?.ally).length, pcsDropped: mine.filter((k) => isChar(k.victim)).length,
    };
  });
  const firstHit = ordered.find((r) => r.roll_type === "damage" && isChar(keyOf(r.character_id, null)) && landed(r) > 0);
  const enemyKos = kos.filter((k) => !isChar(k.victim) && k.killer && isChar(k.killer) && !byKey.get(k.victim)?.ally);
  const lastKo = enemyKos.length ? enemyKos.reduce((a, b) => (when(b.victim) >= when(a.victim) ? b : a)) : null;
  const start = ordered[0]?.created_at ?? null, end = ordered[ordered.length - 1]?.created_at ?? null;
  return {
    start, end, minutes: start && end ? Math.round((Date.parse(end) - Date.parse(start)) / 60000) : 0,
    party: {
      damage: sum((h) => h.damage), healing: sum((h) => h.healing), kills: sum((h) => h.kills), dropped: sum((h) => h.dropped),
      rolls: chars.reduce((n, s) => n + s.rolls, 0), nat20: sum((h) => h.nat20), nat1: sum((h) => h.nat1), fights: fights.length,
    },
    heroes, fights, moments, awards: awards(chars),
    mvp: heroes[0] && heroes[0].damage + heroes[0].healing > 0 ? heroes[0].name : null,
    firsts: { firstBlood: firstHit ? keyOf(firstHit.character_id, null) : null, lastWord: lastKo?.killer ?? null },
  };
}

/** Short plain lines for the AI that writes the story. Only what's in the recap; no secrets, no guessing. */
export function facts(r: Recap, ctx: { campaign?: string | null; session: number; title?: string | null; party: { name: string; line: string }[] }): string {
  const lines: string[] = [];
  lines.push(`Campaign: ${ctx.campaign ?? "unnamed"} · session ${ctx.session}${ctx.title ? ` (${ctx.title})` : ""}${r.minutes ? ` · about ${Math.max(1, Math.round(r.minutes / 15) * 15)} minutes of play` : ""}.`);
  if (ctx.party.length) lines.push(`The party: ${ctx.party.map((p) => `${p.name} (${p.line})`).join("; ")}.`);
  lines.push(`Totals: ${r.party.damage} damage dealt, ${r.party.healing} HP healed, ${r.party.kills} foes down, party members dropped ${r.party.dropped} time(s), ${r.party.nat20} natural 20s, ${r.party.nat1} natural 1s, ${r.party.fights} fight(s).`);
  for (const f of r.fights) lines.push(`Fight "${f.name}": ${f.rounds} round(s), ${f.enemiesDown} enemies down, ${f.pcsDropped} party members dropped.`);
  lines.push("What happened, in order:");
  for (const m of r.moments) lines.push(`- ${m.text}`);
  lines.push("Each hero:");
  for (const h of r.heroes) {
    lines.push(`- ${h.name}: ${h.damage} damage${h.attacks ? `, hit ${h.hits} of ${h.attacks} attacks` : ""}${h.healing ? `, healed ${h.healing}` : ""}${h.kills ? `, ${h.kills} kill(s)` : ""}${h.biggest ? `, biggest hit ${h.biggest.amount} (${baseName(h.biggest.source)})` : ""}${h.topAttack ? `, mostly ${h.topAttack}` : ""}${h.topSpell ? `, favourite spell ${h.topSpell}` : ""}${h.dropped ? `, dropped to 0 HP ${h.dropped} time(s)` : ""}.`);
  }
  if (r.awards.length) lines.push(`Awards: ${r.awards.map((a) => `${a.title} (${a.winners.join(", ")}, ${a.value})`).join("; ")}.`);
  return lines.join("\n");
}
