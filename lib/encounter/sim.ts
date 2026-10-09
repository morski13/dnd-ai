// Fight simulator: plays the same fight thousands of times with real dice
// and reports how often the party wins, drops, dies, and how much it hurts.
//
// Model (one simulated fight):
//  • Everyone rolls initiative (d20 + bonus) and acts in order, round after round (max 20 rounds).
//  • Characters use their best turn plan they can still afford (spell slots / Rage / Channel Divinity),
//    otherwise their best free plan. Healers pick up downed allies first (Healing Word etc.).
//  • Attacks roll d20 + bonus vs AC (natural 20 = crit, double dice; natural 1 = miss).
//    Saves roll d20 + save bonus vs DC (half damage on a success if the effect says so).
//  • Party focuses the weakest enemy; area effects hit several targets.
//  • Monsters attack random conscious characters; recharge abilities (Recharge 5–6) come back on a roll;
//    legendary actions add attacks each round; regeneration heals at the start of their turn.
//  • A character at 0 HP makes death saves (nat 20 = back up, nat 1 = two failures, 3 failures = dead).
import type { Ability } from "../rules";

// ---------------------------------------------------------------- fast dice
export type CompiledDice = { groups: { n: number; s: number }[]; k: number; avg: number };
const cache = new Map<string, CompiledDice>();

/** "2d8+4", "1d10+8+2d4", "15" → dice groups (no keep/advantage needed here). */
export function compile(expr: string): CompiledDice {
  const hit = cache.get(expr);
  if (hit) return hit;
  const groups: { n: number; s: number }[] = [];
  let k = 0;
  for (const m of expr.replace(/\s+/g, "").matchAll(/([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/g)) {
    if (m[3]) {
      const n = (m[2] ? Number(m[2]) : 1) * (m[1] === "-" ? -1 : 1);
      groups.push({ n, s: Number(m[3]) });
    } else if (m[5]) {
      k += Number(m[5]) * (m[4] === "-" ? -1 : 1);
    }
  }
  const avg = groups.reduce((a, g) => a + g.n * (g.s + 1) / 2, 0) + k;
  const c = { groups, k, avg };
  cache.set(expr, c);
  return c;
}

export type Rng = () => number; // 0 ≤ x < 1
/** Small fast seeded random generator (same seed → same results, so numbers don't jitter). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const d = (rng: Rng, sides: number) => 1 + Math.floor(rng() * sides);

export function rollDice(c: CompiledDice, rng: Rng, crit = false): number {
  let total = c.k;
  for (const g of c.groups) {
    const n = Math.abs(g.n) * (crit ? 2 : 1);
    let sum = 0;
    for (let i = 0; i < n; i++) sum += d(rng, g.s);
    total += g.n < 0 ? -sum : sum;
  }
  return Math.max(0, total);
}

// ---------------------------------------------------------------- units
export type Strike = {
  kind: "attack" | "save" | "auto";
  bonus?: number;             // attack bonus
  dc?: number; ability?: Ability; half?: boolean; // saving throw
  damage: CompiledDice;
  advantage?: boolean;
  targets: number;            // how many enemies it can hit (area effects)
  extraOnce?: CompiledDice;   // Sneak Attack / Frenzy: once per turn on the first hit
};
/** What a plan spends. stance: resource paid once, then active all fight (Rage). recharge: 5 = "Recharge 5–6". */
export type Cost = { slot?: number; resource?: string; stance?: boolean; perDay?: number; recharge?: number };
export type Plan = { name: string; strikes: Strike[]; cost: Cost; expected: number; usesBonus?: boolean };
export type HealPlan = { name: string; amount: CompiledDice; bonusAction: boolean; cost: Cost; expected: number };

export type Unit = {
  key: string;
  name: string;
  side: "party" | "enemy";
  isCharacter: boolean;       // makes death saves; monsters/NPCs just die
  maxHp: number;
  startHp: number;
  ac: number;
  init: number;
  saves: Record<Ability, number>;
  plans: Plan[];              // best first
  heals: HealPlan[];
  slots: Record<number, number>;      // spell slots left at the start
  resources: Record<string, number>;  // Rage 3, Channel Divinity 2…
  legendary?: { uses: number; strike: Strike };
  regeneration?: number;
};

// ---------------------------------------------------------------- one fight
type Live = {
  u: Unit; hp: number; down: boolean; dead: boolean; stable: boolean;
  successes: number; failures: number;
  slots: Record<number, number>; resources: Record<string, number>; stances: Set<string>;
  recharge: Record<string, boolean>; perDay: Record<string, number>;
  everDown: boolean; damageDealt: number; healingDone: number;
};

function canAfford(l: Live, c: Cost, name: string) {
  if (c.slot && !Object.entries(l.slots).some(([lvl, n]) => Number(lvl) >= c.slot! && n > 0)) return false;
  if (c.resource && !(c.stance && l.stances.has(c.resource)) && !((l.resources[c.resource] ?? 0) > 0)) return false;
  if (c.recharge && l.recharge[name] === false) return false;
  if (c.perDay && (l.perDay[name] ?? 0) <= 0) return false;
  return true;
}
function pay(l: Live, c: Cost, name: string) {
  if (c.slot) {
    const lvl = Object.keys(l.slots).map(Number).sort((a, b) => a - b).find((x) => x >= c.slot! && l.slots[x] > 0);
    if (lvl !== undefined) l.slots[lvl]--;
  }
  if (c.resource) {
    if (c.stance) { if (!l.stances.has(c.resource)) { l.resources[c.resource]--; l.stances.add(c.resource); } }
    else l.resources[c.resource]--;
  }
  if (c.recharge) l.recharge[name] = false;
  if (c.perDay) l.perDay[name]--;
}

const alive = (l: Live) => !l.dead && l.hp > 0;

function applyDamage(t: Live, dmg: number) {
  if (dmg <= 0 || t.dead) return;
  if (t.hp <= 0) {
    // Hit while down: one failed death save (monsters here don't target downed characters, but area effects can).
    if (t.u.isCharacter) { t.failures += 1; t.stable = false; if (t.failures >= 3) t.dead = true; }
    return;
  }
  const overflow = dmg - t.hp;
  t.hp = Math.max(0, t.hp - dmg);
  if (t.hp === 0) {
    if (!t.u.isCharacter || overflow >= t.u.maxHp) t.dead = true; // monsters die; massive damage kills
    else { t.down = true; t.everDown = true; t.successes = 0; t.failures = 0; t.stable = false; }
  }
}

function heal(t: Live, amount: number) {
  if (t.dead || amount <= 0) return 0;
  const before = t.hp;
  t.hp = Math.min(t.u.maxHp, t.hp + amount);
  if (t.hp > 0) { t.down = false; t.stable = false; t.successes = 0; t.failures = 0; }
  return t.hp - before;
}

function strike(attacker: Live, s: Strike, targets: Live[], rng: Rng, onceUsed: { v: boolean }) {
  let dealt = 0;
  for (const t of targets) {
    if (s.kind === "attack") {
      const r1 = d(rng, 20), r2 = s.advantage ? d(rng, 20) : 0;
      const nat = Math.max(r1, r2);
      const crit = nat === 20;
      if (nat === 1 || (!crit && nat + (s.bonus ?? 0) < t.u.ac)) continue;
      let dmg = rollDice(s.damage, rng, crit);
      if (s.extraOnce && !onceUsed.v) { dmg += rollDice(s.extraOnce, rng, crit); onceUsed.v = true; }
      const before = t.hp; applyDamage(t, dmg); dealt += Math.min(before, dmg);
    } else if (s.kind === "save") {
      const saved = d(rng, 20) + (t.u.saves[s.ability ?? "DEX"] ?? 0) >= (s.dc ?? 10);
      let dmg = rollDice(s.damage, rng);
      if (saved) dmg = s.half ? Math.floor(dmg / 2) : 0;
      const before = t.hp; applyDamage(t, dmg); dealt += Math.min(before, dmg);
    } else {
      const dmg = rollDice(s.damage, rng);
      const before = t.hp; applyDamage(t, dmg); dealt += Math.min(before, dmg);
    }
  }
  attacker.damageDealt += dealt;
}

function pickTargets(side: Live[], n: number, rng: Rng, focus: boolean): Live[] {
  const ok = side.filter(alive);
  if (!ok.length) return [];
  if (focus) return [...ok].sort((a, b) => a.hp - b.hp).slice(0, n); // finish off the weakest first
  const out: Live[] = [];
  const pool = [...ok];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

function takeTurn(me: Live, friends: Live[], foes: Live[], rng: Rng) {
  const u = me.u;
  // Start of turn
  if (u.regeneration && me.hp > 0) heal(me, u.regeneration);
  for (const k of Object.keys(me.recharge)) {
    if (!me.recharge[k]) {
      const plan = u.plans.find((p) => p.name === k);
      if (plan && d(rng, 6) >= (plan.cost.recharge ?? 7)) me.recharge[k] = true;
    }
  }
  if (me.hp <= 0) {
    if (!u.isCharacter || me.dead || me.stable) return;
    const r = d(rng, 20);
    if (r === 20) { heal(me, 1); }
    else if (r === 1) me.failures += 2;
    else if (r >= 10) me.successes += 1;
    else me.failures += 1;
    if (me.failures >= 3) me.dead = true;
    else if (me.successes >= 3) me.stable = true;
    if (me.hp <= 0) return;
  }

  // Heal a downed (or badly hurt) ally?
  let usedBonus = false;
  let usedAction = false;
  let slotSpellUsed = false;
  const hurt = friends
    .filter((f) => !f.dead && f.u.isCharacter && (f.hp <= 0 || f.hp < f.u.maxHp * 0.25))
    .sort((a, b) => a.hp - b.hp)[0];
  if (hurt) {
    const h = u.heals.find((x) => canAfford(me, x.cost, x.name));
    if (h) {
      pay(me, h.cost, h.name);
      me.healingDone += heal(hurt, rollDice(h.amount, rng));
      if (h.bonusAction) usedBonus = true; else usedAction = true;
      if (h.cost.slot) slotSpellUsed = true;
    }
  }

  // Attack with the best plan we can still afford.
  if (!usedAction) {
    const plan = u.plans.find((p) => canAfford(me, p.cost, p.name) && !(slotSpellUsed && p.cost.slot) && !(usedBonus && p.usesBonus));
    if (plan) {
      pay(me, plan.cost, plan.name);
      const once = { v: false };
      for (const s of plan.strikes) {
        const t = pickTargets(foes, s.targets, rng, u.side === "party");
        if (!t.length) break;
        strike(me, s, t, rng, once);
      }
    }
  }
}

export type FightResult = {
  win: boolean; rounds: number; anyDown: boolean; deaths: number; hpLostFrac: number;
  dealt: Record<string, number>; downs: Record<string, number>; deathsBy: Record<string, number>;
};

export function simulateOnce(units: Unit[], rng: Rng): FightResult {
  const live: Live[] = units.map((u) => ({
    u, hp: u.startHp, down: u.startHp <= 0, dead: false, stable: u.startHp <= 0,
    successes: 0, failures: 0, slots: { ...u.slots }, resources: { ...u.resources }, stances: new Set(),
    recharge: Object.fromEntries(u.plans.filter((p) => p.cost.recharge).map((p) => [p.name, true])),
    perDay: Object.fromEntries(u.plans.filter((p) => p.cost.perDay).map((p) => [p.name, p.cost.perDay!])),
    everDown: false, damageDealt: 0, healingDone: 0,
  }));
  const party = live.filter((l) => l.u.side === "party");
  const enemies = live.filter((l) => l.u.side === "enemy");
  const order = live
    .map((l) => ({ l, init: d(rng, 20) + l.u.init + rng() * 0.01 }))
    .sort((a, b) => b.init - a.init)
    .map((x) => x.l);

  let round = 0;
  const partyUp = () => party.some((p) => !p.dead && p.hp > 0);
  const enemiesUp = () => enemies.some(alive);
  while (round < 20 && partyUp() && enemiesUp()) {
    round++;
    const legendary = new Map(enemies.filter((e) => e.u.legendary).map((e) => [e, e.u.legendary!.uses]));
    for (const me of order) {
      if (!partyUp() || !enemiesUp()) break;
      const friends = me.u.side === "party" ? party : enemies;
      const foes = me.u.side === "party" ? enemies : party;
      takeTurn(me, friends, foes, rng);
      // Legendary actions: after a party member's turn, a legendary monster may attack.
      if (me.u.side === "party") {
        for (const [boss, left] of legendary) {
          if (left > 0 && alive(boss) && partyUp()) {
            const t = pickTargets(party, 1, rng, false);
            if (t.length) strike(boss, boss.u.legendary!.strike, t, rng, { v: true });
            legendary.set(boss, left - 1);
          }
        }
      }
    }
  }

  const maxHp = party.reduce((a, p) => a + p.u.maxHp, 0) || 1;
  const endHp = party.reduce((a, p) => a + Math.max(0, p.dead ? 0 : p.hp), 0);
  const startHp = party.reduce((a, p) => a + p.u.startHp, 0);
  return {
    win: !enemiesUp() && partyUp(),
    rounds: round,
    anyDown: party.some((p) => p.everDown || p.dead),
    deaths: party.filter((p) => p.dead && p.u.isCharacter).length,
    hpLostFrac: Math.max(0, (startHp - endHp) / maxHp),
    dealt: Object.fromEntries(live.map((l) => [l.u.key, l.damageDealt])),
    downs: Object.fromEntries(party.map((p) => [p.u.key, p.everDown || p.dead ? 1 : 0])),
    deathsBy: Object.fromEntries(party.map((p) => [p.u.key, p.dead ? 1 : 0])),
  };
}

export type SimSummary = {
  runs: number;
  pWin: number; pAnyDown: number; pDeath: number;
  pLose: number;        // the party is wiped out (everyone down or dead) or can't win
  pHalfDead: number;    // half the party or more dies (for a party of 1: that character dies)
  avgRounds: number; avgHpLost: number; p90HpLost: number; avgDeaths: number;
  damageShare: Record<string, number>;   // enemy key → share of all damage the enemies dealt
  downRate: Record<string, number>;      // character key → how often they drop
  deathRate: Record<string, number>;
};

export function simulate(units: Unit[], runs = 2000, seed = 12345): SimSummary {
  const rng = mulberry32(seed);
  let wins = 0, downs = 0, deathsAny = 0, halfDead = 0, rounds = 0, hpLost = 0, deaths = 0;
  const partySize = units.filter((u) => u.side === "party" && u.isCharacter).length;
  const half = Math.max(1, Math.ceil(partySize / 2));
  const losses: number[] = [];
  const dealt: Record<string, number> = {};
  const downRate: Record<string, number> = {};
  const deathRate: Record<string, number> = {};
  for (let i = 0; i < runs; i++) {
    const r = simulateOnce(units, rng);
    if (r.win) wins++;
    if (r.anyDown) downs++;
    if (r.deaths > 0) deathsAny++;
    if (partySize > 0 && r.deaths >= half) halfDead++;
    deaths += r.deaths;
    rounds += r.rounds;
    hpLost += r.hpLostFrac;
    losses.push(r.hpLostFrac);
    for (const [k, v] of Object.entries(r.dealt)) dealt[k] = (dealt[k] ?? 0) + v;
    for (const [k, v] of Object.entries(r.downs)) downRate[k] = (downRate[k] ?? 0) + v / runs;
    for (const [k, v] of Object.entries(r.deathsBy)) deathRate[k] = (deathRate[k] ?? 0) + v / runs;
  }
  losses.sort((a, b) => a - b);
  const enemyKeys = units.filter((u) => u.side === "enemy").map((u) => u.key);
  const enemyTotal = enemyKeys.reduce((a, k) => a + (dealt[k] ?? 0), 0) || 1;
  return {
    runs,
    pWin: wins / runs, pAnyDown: downs / runs, pDeath: deathsAny / runs,
    pLose: 1 - wins / runs, pHalfDead: halfDead / runs,
    avgRounds: rounds / runs, avgHpLost: hpLost / runs, p90HpLost: losses[Math.floor(runs * 0.9)] ?? 0,
    avgDeaths: deaths / runs,
    damageShare: Object.fromEntries(enemyKeys.map((k) => [k, (dealt[k] ?? 0) / enemyTotal])),
    downRate, deathRate,
  };
}
