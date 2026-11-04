// Battle engine, part 8: reactions (pure, tested). When something happens in a fight, who can react,
// with what, and why: the reaction pop-up only goes to them.
//  - an attack hits: the target's Shield, Uncanny Dodge, Defensive Duelist, Parry; Silvery Barbs from a friend
//    within 60 ft of the attacker; Interception from a friend next to the target; Sentinel next to the attacker
//  - a spell is cast: Counterspell within 60 ft of the caster
//  - someone leaves reach: Opportunity Attack (War Caster: a spell instead)
//  - damage is taken: Hellish Rebuke, Absorb Elements (acid, cold, fire, lightning, thunder)

export type ReactOption = {
  id: string;            // "shield", "oa:atk:Morningstar", "f:Uncanny Dodge"
  name: string;
  why: string;
  key: string | null;    // the sheet option to roll or cast (null = nothing to roll)
  effect?: "shield" | "halve";  // what the app does by itself when it's used
};

export type Reactor = {
  combatantId: string; name: string; side: "party" | "enemy";
  canReact: boolean;                      // reaction not used yet, not incapacitated
  spells: { name: string; key: string }[]; // reaction spells it can cast now (slots left)
  features: string[];                     // feature names (Uncanny Dodge, Sentinel…)
  monsterReactions?: string[];            // a monster's own reactions from its stat block ("Parry")
  melee: { key: string; name: string } | null; // its melee weapon (Opportunity Attack)
};

export type Trigger =
  | { kind: "attack"; attackerId: string; attackerName: string; targetId: string; total: number | null; hit: boolean | null; ac: number | null; melee: boolean }
  | { kind: "spell"; casterId: string; casterName: string; spell: string }
  | { kind: "leave"; moverId: string; moverName: string; threatIds: string[] }
  | { kind: "damage"; sourceId: string | null; sourceName: string; targetId: string; types: string[] };

export type Eligible = { combatantId: string; name: string; options: ReactOption[] };

const ELEMENTAL = ["acid", "cold", "fire", "lightning", "thunder"];

/** `dist(a, b)`: feet between two combatants on the map, or null without a map (then only the obvious ones react). */
export function whoCanReact(t: Trigger, all: Reactor[], dist: (a: string, b: string) => number | null): Eligible[] {
  const out: Eligible[] = [];
  const add = (r: Reactor, o: ReactOption) => {
    const e = out.find((x) => x.combatantId === r.combatantId) ?? (out.push({ combatantId: r.combatantId, name: r.name, options: [] }), out[out.length - 1]);
    if (!e.options.some((x) => x.id === o.id)) e.options.push(o);
  };
  const within = (a: string, b: string, ft: number, noMap: boolean) => { const d = dist(a, b); return d == null ? noMap : d <= ft; };
  const spell = (r: Reactor, name: string) => r.spells.find((s) => s.name === name) ?? null;
  const has = (r: Reactor, name: string) => r.features.includes(name);
  const ready = all.filter((r) => r.canReact);
  const sideOf = (id: string) => all.find((r) => r.combatantId === id)?.side ?? null;

  if (t.kind === "attack" && t.hit !== false) {
    const target = ready.find((r) => r.combatantId === t.targetId);
    if (target) {
      const sh = spell(target, "Shield");
      if (sh) {
        const saves = t.total != null && t.ac != null && t.total < t.ac + 5;
        add(target, { id: "shield", name: "Shield", key: sh.key, effect: "shield", why: saves ? `+5 AC: ${t.total} would miss you (AC ${t.ac! + 5}).` : "+5 AC until your next turn, against this attack and later ones." });
      }
      if (has(target, "Uncanny Dodge")) add(target, { id: "f:Uncanny Dodge", name: "Uncanny Dodge", key: null, effect: "halve", why: `Halve the damage of ${t.attackerName}'s hit.` });
      if (t.melee && has(target, "Defensive Duelist")) add(target, { id: "f:Defensive Duelist", name: "Defensive Duelist", key: null, why: "Add your proficiency bonus to your AC against this melee attack (finesse weapon in hand)." });
      if (t.melee && has(target, "Parry")) add(target, { id: "f:Parry", name: "Parry", key: null, why: "Reduce the damage with a Superiority Die." });
      for (const m of target.monsterReactions ?? []) add(target, { id: `m:${m}`, name: m, key: null, why: "Its reaction (stat block)." });
    }
    for (const r of ready) {
      if (r.combatantId === t.targetId || r.combatantId === t.attackerId) continue;
      const friend = sideOf(t.targetId) === r.side;
      const sb = spell(r, "Silvery Barbs");
      if (friend && sb && within(r.combatantId, t.attackerId, 60, true)) add(r, { id: "silvery-barbs", name: "Silvery Barbs", key: sb.key, why: `${t.attackerName} hit: make them reroll and take the lower roll.` });
      if (friend && has(r, "Interception") && within(r.combatantId, t.targetId, 5, false)) add(r, { id: "f:Interception", name: "Interception", key: null, why: "Reduce the damage to your friend by 1d10 + your proficiency bonus." });
      if (friend && has(r, "Sentinel") && r.melee && within(r.combatantId, t.attackerId, 5, false)) add(r, { id: `sentinel:${r.melee.key}`, name: `Sentinel · ${r.melee.name}`, key: r.melee.key, why: `${t.attackerName} attacked someone else next to you: attack it.` });
    }
  }

  if (t.kind === "spell") {
    for (const r of ready) {
      if (r.combatantId === t.casterId || r.side === sideOf(t.casterId)) continue;
      const cs = spell(r, "Counterspell");
      if (cs && within(r.combatantId, t.casterId, 60, true)) add(r, { id: "counterspell", name: "Counterspell", key: cs.key, why: `Stop ${t.casterName}'s ${t.spell}.` });
    }
  }

  if (t.kind === "leave") {
    for (const r of ready) {
      if (!t.threatIds.includes(r.combatantId)) continue;
      if (r.melee) add(r, { id: `oa:${r.melee.key}`, name: `Opportunity Attack · ${r.melee.name}`, key: r.melee.key, why: `${t.moverName} is leaving your reach.` });
      else add(r, { id: "oa", name: "Opportunity Attack", key: null, why: `${t.moverName} is leaving its reach.` });
      if (has(r, "War Caster")) add(r, { id: "f:War Caster", name: "War Caster", key: null, why: "Cast a spell at them instead of the attack (one action, one target)." });
    }
  }

  if (t.kind === "damage") {
    const target = ready.find((r) => r.combatantId === t.targetId);
    if (target) {
      const hr = spell(target, "Hellish Rebuke");
      if (hr && t.sourceId && within(target.combatantId, t.sourceId, 60, true)) add(target, { id: "hellish-rebuke", name: "Hellish Rebuke", key: hr.key, why: `${t.sourceName} hurt you: 2d10 fire back (DEX save for half).` });
      const ae = spell(target, "Absorb Elements");
      const el = t.types.find((x) => ELEMENTAL.includes(x));
      if (ae && el) add(target, { id: "absorb-elements", name: "Absorb Elements", key: ae.key, why: `Resist the ${el} damage; your next melee hit does +1d6 ${el}.` });
    }
  }
  return out.filter((e) => e.options.length);
}

/** A monster's reactions from its stat block (the "Reactions" section: "Parry. The knight adds 2 to its AC…"). */
export function monsterReactions(statBlock: unknown): string[] {
  const s = (statBlock && typeof statBlock === "object" ? statBlock : {}) as { sections?: Record<string, unknown> };
  const list = s.sections?.Reactions;
  if (!Array.isArray(list)) return [];
  return list.map((x) => String(x).split(/[.:(]/)[0].trim()).filter((x) => x && x.length < 40).slice(0, 6);
}

/** How long the pop-up stays open. */
export const WINDOW_SECONDS = 5;
