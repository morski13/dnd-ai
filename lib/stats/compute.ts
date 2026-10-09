// Turns the roll log (+ HP changes) into statistics. Pure functions: no database here.
//
// Rules, in plain words:
// - Only rolls made in a session count (the caller filters that).
// - "Damage dealt" = what actually landed: if an HP change is linked to the roll we use its
//   amount (half on a save, resistance...), otherwise the number rolled.
// - "Damage taken" by a character = HP lost on their HP card in that session. If they never used
//   the HP card that session, we fall back to the enemy damage rolls aimed at them.
// - A kill goes to whoever's hit takes a monster to 0 HP (from its HP max when nobody marked it).

export type StatRoll = {
  id: string;
  session_id: string | null;
  combat_id: string | null;
  round: number | null;
  character_id: string | null;
  monster_id: string | null;
  roll_type: string;
  source: string | null;
  expression: string;
  dice: number[];
  total: number | null;
  is_crit: boolean;
  is_fumble: boolean;
  success: boolean | null;
  spell_slot: number | null;
  parent_roll_id: string | null;
  target_character_id: string | null;
  target_monster_id: string | null;
  created_at: string;
};

export type StatEffect = {
  id: string;
  session_id: string | null;
  combat_id: string | null;
  roll_event_id: string | null;
  actor_character_id: string | null;
  actor_monster_id: string | null;
  target_character_id: string | null;
  target_monster_id: string | null;
  kind: string;
  amount: number | null;
  rolled_amount: number | null;
  dropped_to_zero: boolean;
  created_at: string;
};

export type StatActor = { key: string; id: string; kind: "character" | "monster"; name: string; hpMax: number | null; ally?: boolean };

export type ActorStats = {
  key: string;
  name: string;
  kind: "character" | "monster";
  rolls: number;
  d20Count: number;
  d20Sum: number;
  d20Avg: number | null;
  nat20: number;
  nat1: number;
  attacks: number;
  hits: number;
  misses: number;
  hitRate: number | null;
  crits: number;
  attackD20Avg: number | null;
  damageDealt: number;
  biggestHit: { amount: number; source: string } | null;
  damageTaken: number;
  resisted: number;
  healingDone: number;
  healingReceived: number;
  kills: number; // monsters taken to 0 (for a monster: characters it dropped)
  timesDropped: number;
  savesMade: number;
  savesFailed: number;
  checksMade: number;
  checksFailed: number;
  failedChecks: string[];
  slotsUsed: number;
  spellsCast: number;
  spells: Record<string, number>;
  attacksUsed: Record<string, number>;
  mostUsedAttack: string | null;
  mostUsedSpell: string | null;
};

const D20_TYPES = new Set(["attack", "save", "check", "initiative", "death_save", "ability"]);
const CAST_TYPES = new Set(["attack", "save_dc", "heal", "damage", "other"]);

/** "Shortbow + Sneak Attack" → "Shortbow", "Greataxe (crit) + Rage" → "Greataxe", "DEX save vs X" stays. */
export function baseName(source: string | null): string {
  return (source ?? "Roll").split(" + ")[0].replace(/\s*\(.*\)\s*$/, "").trim() || "Roll";
}

/** "Goblin Warrior 2" / "Goblin Warrior B" → "Goblin Warrior". */
export function monsterType(name: string): string {
  return name.replace(/\s+(\d+|[A-Z])$/, "").trim();
}

const keyOf = (characterId: string | null, monsterId: string | null) =>
  characterId ? `c:${characterId}` : monsterId ? `m:${monsterId}` : null;

function blank(a: StatActor): ActorStats {
  return {
    key: a.key, name: a.name, kind: a.kind, rolls: 0, d20Count: 0, d20Sum: 0, d20Avg: null, nat20: 0, nat1: 0,
    attacks: 0, hits: 0, misses: 0, hitRate: null, crits: 0, attackD20Avg: null, damageDealt: 0, biggestHit: null,
    damageTaken: 0, resisted: 0, healingDone: 0, healingReceived: 0, kills: 0, timesDropped: 0,
    savesMade: 0, savesFailed: 0, checksMade: 0, checksFailed: 0, failedChecks: [], slotsUsed: 0, spellsCast: 0,
    spells: {}, attacksUsed: {}, mostUsedAttack: null, mostUsedSpell: null,
  };
}

const top = (m: Record<string, number>) => {
  let best: string | null = null;
  for (const [k, v] of Object.entries(m)) if (best === null || v > m[best]) best = k;
  return best;
};

/** Is this a d20 roll? Returns the die that counted, or null. */
function d20Of(r: StatRoll): number | null {
  if (!D20_TYPES.has(r.roll_type) || !r.dice?.length) return null;
  if (!/^\s*[12]d20/.test(r.expression)) return null;
  return r.dice[0];
}

export function computeStats(
  rolls: StatRoll[],
  effects: StatEffect[],
  actors: StatActor[],
  spellNames: Set<string>
): Map<string, ActorStats> {
  const out = new Map<string, ActorStats>();
  const actorByKey = new Map(actors.map((a) => [a.key, a]));
  const get = (key: string | null): ActorStats | null => {
    if (!key) return null;
    let s = out.get(key);
    if (!s) {
      const a = actorByKey.get(key);
      if (!a) return null;
      s = blank(a);
      out.set(key, s);
    }
    return s;
  };

  const ordered = [...rolls].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const linked = new Map<string, StatEffect[]>();
  for (const e of effects) if (e.roll_event_id) linked.set(e.roll_event_id, [...(linked.get(e.roll_event_id) ?? []), e]);
  const landed = (r: StatRoll, kind: "damage" | "heal") => {
    const l = (linked.get(r.id) ?? []).filter((e) => e.kind === kind);
    return l.length ? l.reduce((n, e) => n + (e.amount ?? 0), 0) : (r.total ?? 0);
  };

  // Which characters used their HP card in which session (then the HP card is the truth).
  const hpCard = new Set<string>();
  for (const e of effects) if (e.target_character_id && (e.kind === "damage" || e.kind === "heal")) hpCard.add(`${e.kind}|${e.session_id}|${e.target_character_id}`);

  const attackD20: Record<string, number[]> = {};

  for (const r of ordered) {
    const me = get(keyOf(r.character_id, r.monster_id));
    if (!me) continue;
    me.rolls++;
    const d = d20Of(r);
    if (d !== null) {
      me.d20Count++;
      me.d20Sum += d;
      if (d === 20) me.nat20++;
      if (d === 1) me.nat1++;
    }
    const name = baseName(r.source);

    switch (r.roll_type) {
      case "attack":
        me.attacks++;
        me.attacksUsed[name] = (me.attacksUsed[name] ?? 0) + 1;
        if (r.success === true || (r.success === null && r.is_crit)) me.hits++;
        else if (r.success === false) me.misses++;
        if (r.is_crit) me.crits++;
        if (d !== null) (attackD20[me.key] ??= []).push(d);
        break;
      case "damage": {
        const amt = landed(r, "damage");
        me.damageDealt += amt;
        if (!me.biggestHit || amt > me.biggestHit.amount) me.biggestHit = { amount: amt, source: name };
        break;
      }
      case "heal":
        me.healingDone += landed(r, "heal");
        break;
      case "save":
        if (r.success === true) me.savesMade++;
        else if (r.success === false) me.savesFailed++;
        break;
      case "check":
        if (r.success === true) me.checksMade++;
        else if (r.success === false) { me.checksFailed++; me.failedChecks.push(name); }
        break;
    }

    // A spell being cast: the first roll of it (follow-up damage has a parent and isn't counted again).
    if (!r.parent_roll_id && CAST_TYPES.has(r.roll_type) && spellNames.has(name)) {
      me.spellsCast++;
      me.spells[name] = (me.spells[name] ?? 0) + 1;
      if (r.spell_slot) me.slotsUsed++;
    }

    // Damage / healing received
    const tgt = get(keyOf(r.target_character_id, r.target_monster_id));
    if (tgt && (r.roll_type === "damage" || r.roll_type === "heal")) {
      const kind = r.roll_type as "damage" | "heal";
      const usesCard = r.target_character_id && hpCard.has(`${kind}|${r.session_id}|${r.target_character_id}`);
      if (!usesCard) {
        const amt = landed(r, kind);
        if (kind === "damage") tgt.damageTaken += amt;
        else tgt.healingReceived += amt;
      }
    }
  }

  // HP changes: the HP card, plus damage that wasn't rolled through the app.
  const rollIds = new Set(rolls.map((r) => r.id));
  for (const e of effects) {
    if (e.kind !== "damage" && e.kind !== "heal") continue;
    const tgt = get(keyOf(e.target_character_id, e.target_monster_id));
    const isLinked = !!e.roll_event_id && rollIds.has(e.roll_event_id);
    if (tgt) {
      // Characters: every HP change counts (the rolls aimed at them were skipped above).
      // Monsters: linked changes were already counted together with their roll.
      if (tgt.kind === "character" || !isLinked) {
        if (e.kind === "damage") tgt.damageTaken += e.amount ?? 0;
        else tgt.healingReceived += e.amount ?? 0;
      }
      if (e.kind === "damage" && isLinked && e.rolled_amount != null && e.amount != null && e.rolled_amount > e.amount) {
        tgt.resisted += e.rolled_amount - e.amount;
      }
    }
    if (!isLinked) {
      const actor = get(keyOf(e.actor_character_id, e.actor_monster_id));
      if (actor && e.kind === "damage") actor.damageDealt += e.amount ?? 0;
      if (actor && e.kind === "heal") actor.healingDone += e.amount ?? 0;
    }
  }

  // Kills and knockouts
  for (const { killer, victim } of knockouts(ordered, effects, actors, landed)) {
    const k = get(killer);
    const v = get(victim);
    if (k) k.kills++;
    if (v) v.timesDropped++;
  }

  for (const s of out.values()) {
    s.d20Avg = s.d20Count ? s.d20Sum / s.d20Count : null;
    s.hitRate = s.hits + s.misses ? s.hits / (s.hits + s.misses) : null;
    const a = attackD20[s.key];
    s.attackD20Avg = a?.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    s.mostUsedAttack = top(s.attacksUsed);
    s.mostUsedSpell = top(s.spells);
  }
  return out;
}

/** Who dropped whom. Marked knockouts first; monsters nobody marked are worked out from their HP max. */
export function knockouts(
  ordered: StatRoll[],
  effects: StatEffect[],
  actors: StatActor[],
  landed: (r: StatRoll, kind: "damage" | "heal") => number
): { killer: string | null; victim: string; combatId: string | null }[] {
  const res: { killer: string | null; victim: string; combatId: string | null }[] = [];
  const marked = new Set<string>();
  const lastHitOn = (victim: string, before: string) => {
    let hit: StatRoll | null = null;
    for (const r of ordered) {
      if (r.created_at > before) break;
      if (r.roll_type === "damage" && keyOf(r.target_character_id, r.target_monster_id) === victim) hit = r;
    }
    return hit;
  };
  for (const e of effects) {
    if (e.kind !== "damage" || !e.dropped_to_zero) continue;
    const victim = keyOf(e.target_character_id, e.target_monster_id);
    if (!victim) continue;
    marked.add(victim);
    let killer = keyOf(e.actor_character_id, e.actor_monster_id);
    let combatId = e.combat_id;
    if (!killer) {
      const r = (e.roll_event_id && ordered.find((x) => x.id === e.roll_event_id)) || lastHitOn(victim, e.created_at);
      if (r) { killer = keyOf(r.character_id, r.monster_id); combatId ??= r.combat_id; }
    }
    res.push({ killer, victim, combatId });
  }
  // Monsters: running damage total reaches its HP max → the hit that did it gets the kill.
  for (const a of actors) {
    if (a.kind !== "monster" || !a.hpMax || marked.has(a.key)) continue;
    let sum = 0;
    for (const r of ordered) {
      if (r.roll_type !== "damage" || r.target_monster_id !== a.id) continue;
      sum += landed(r, "damage");
      if (sum >= a.hpMax) {
        res.push({ killer: keyOf(r.character_id, r.monster_id), victim: a.key, combatId: r.combat_id });
        break;
      }
    }
  }
  return res;
}

// ---------------------------------------------------------------------------
// Awards: fun titles for the table

export type Award = { id: string; title: string; emoji: string; blurb: string; winners: string[]; value: string };

type AwardDef = {
  id: string; title: string; emoji: string; blurb: string;
  score: (s: ActorStats) => number | null; // null = not eligible
  fmt: (n: number) => string; low?: boolean;
};

const AWARDS: AwardDef[] = [
  { id: "mvp", title: "Wrecking Ball", emoji: "🪓", blurb: "Most damage dealt", score: (s) => s.damageDealt || null, fmt: (n) => `${n} damage` },
  { id: "healer", title: "Patron Saint of Bandages", emoji: "🩹", blurb: "Most healing done", score: (s) => s.healingDone || null, fmt: (n) => `${n} HP healed` },
  { id: "reaper", title: "Grim Reaper", emoji: "💀", blurb: "Most kills", score: (s) => s.kills || null, fmt: (n) => `${n} kill${n === 1 ? "" : "s"}` },
  { id: "onepunch", title: "One-Punch", emoji: "💥", blurb: "Biggest single hit", score: (s) => s.biggestHit?.amount || null, fmt: (n) => `${n} in one hit` },
  { id: "crit", title: "Crit Happens", emoji: "🎯", blurb: "Most natural 20s", score: (s) => s.nat20 || null, fmt: (n) => `${n} × nat 20` },
  { id: "eagle", title: "Eagle Eye", emoji: "🏹", blurb: "Best hit rate (2+ attacks)", score: (s) => (s.hits + s.misses >= 2 ? s.hitRate : null), fmt: (n) => `${Math.round(n * 100)}% hits` },
  { id: "blessed", title: "Blessed by the Dice", emoji: "✨", blurb: "Highest average d20 (3+ rolls)", score: (s) => (s.d20Count >= 3 ? s.d20Avg : null), fmt: (n) => `avg ${n.toFixed(1)}` },
  { id: "cursed", title: "Cursed Dice", emoji: "🌧️", blurb: "Lowest average d20 (3+ rolls)", score: (s) => (s.d20Count >= 3 ? s.d20Avg : null), fmt: (n) => `avg ${n.toFixed(1)}`, low: true },
  { id: "goblin", title: "Dice Goblin", emoji: "👺", blurb: "Most natural 1s", score: (s) => s.nat1 || null, fmt: (n) => `${n} × nat 1` },
  { id: "bag", title: "Punching Bag", emoji: "🥊", blurb: "Most damage taken", score: (s) => s.damageTaken || null, fmt: (n) => `${n} HP lost` },
  { id: "floor", title: "Floor Inspector", emoji: "🛌", blurb: "Dropped to 0 HP the most", score: (s) => s.timesDropped || null, fmt: (n) => `${n} time${n === 1 ? "" : "s"}` },
  { id: "slinger", title: "Spell Slinger", emoji: "🔮", blurb: "Most spells cast", score: (s) => s.spellsCast || null, fmt: (n) => `${n} spell${n === 1 ? "" : "s"}` },
];

export function awards(chars: ActorStats[]): Award[] {
  const list: Award[] = [];
  for (const d of AWARDS) {
    const scored = chars.map((s) => ({ s, v: d.score(s) })).filter((x): x is { s: ActorStats; v: number } => x.v !== null);
    if (!scored.length) continue;
    // "Cursed" and "Blessed" only make sense if there's someone to compare against
    if ((d.id === "cursed" || d.id === "blessed") && scored.length < 2) continue;
    const best = d.low ? Math.min(...scored.map((x) => x.v)) : Math.max(...scored.map((x) => x.v));
    const winners = scored.filter((x) => Math.abs(x.v - best) < 1e-9).map((x) => x.s.name);
    if (d.id === "cursed" && winners.length === scored.length) continue;
    if (d.id === "blessed" && winners.length === scored.length) continue;
    list.push({ id: d.id, title: d.title, emoji: d.emoji, blurb: d.blurb, winners, value: d.fmt(best) });
  }
  return list;
}

// ---------------------------------------------------------------------------
// Fights (DM view)

export type FightSummary = {
  combatId: string; name: string; rounds: number; partyDamage: number; enemyDamage: number;
  pcsDropped: number; enemiesDown: number; plannedTier: string | null;
};

export function fightSummaries(
  combats: { id: string; name: string | null; round: number }[],
  rolls: StatRoll[],
  effects: StatEffect[],
  actors: StatActor[],
  plannedTiers: Map<string, string>
): FightSummary[] {
  const actorByKey = new Map(actors.map((a) => [a.key, a]));
  const ordered = [...rolls].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const linked = new Map<string, number>();
  for (const e of effects) if (e.roll_event_id && e.kind === "damage") linked.set(e.roll_event_id, (linked.get(e.roll_event_id) ?? 0) + (e.amount ?? 0));
  const landed = (r: StatRoll) => linked.get(r.id) ?? r.total ?? 0;
  const kos = knockouts(ordered, effects, actors, (r) => landed(r));
  return combats.map((c) => {
    const rs = ordered.filter((r) => r.combat_id === c.id);
    const isParty = (r: StatRoll) => !!r.character_id || (!!r.monster_id && !!actorByKey.get(`m:${r.monster_id}`)?.ally);
    let partyDamage = 0, enemyDamage = 0;
    for (const r of rs) {
      if (r.roll_type !== "damage") continue;
      if (isParty(r)) partyDamage += landed(r);
      else enemyDamage += landed(r);
    }
    const mine = kos.filter((k) => k.combatId === c.id);
    return {
      combatId: c.id,
      name: c.name ?? "Fight",
      rounds: Math.max(c.round ?? 0, ...rs.map((r) => r.round ?? 0)),
      partyDamage, enemyDamage,
      pcsDropped: mine.filter((k) => k.victim.startsWith("c:")).length,
      enemiesDown: mine.filter((k) => k.victim.startsWith("m:") && !actorByKey.get(k.victim)?.ally).length,
      plannedTier: c.name ? plannedTiers.get(c.name) ?? null : null,
    };
  });
}
