// One call that does everything the fight planner shows.
import type { SpellInfo } from "../rules";
import { characterUnit, monsterUnit, type CharacterForSim, type MonsterStats } from "./build";
import { rate, TIERS, xpBudget, type Tier } from "./rate";
import { simulate, type SimSummary, type Unit } from "./sim";

export type FightEntry = {
  id: string;                    // stable id inside the saved fight
  stats: MonsterStats;
  count: number;
  side: "enemy" | "ally";        // allies (NPCs) fight with the party
};

export type FightInput = {
  characters: CharacterForSim[]; // the party members taking part
  library: SpellInfo[];          // spells those characters know
  entries: FightEntry[];
  fresh: boolean;                // true = full HP/slots (planning ahead), false = as they are now
};

export type Analysis = {
  summary: SimSummary;
  tier: Tier;
  reasons: string[];
  xp: ReturnType<typeof xpBudget>;
  threats: { name: string; share: number }[];         // who deals the damage
  atRisk: { name: string; down: number; death: number }[];
  suggestions: string[];
  ms: number;
};

function units(input: FightInput, override?: { id: string; count: number }): Unit[] {
  const foes: Unit[] = [];
  const allies: Unit[] = [];
  for (const e of input.entries) {
    const count = override?.id === e.id ? override.count : e.count;
    for (let i = 0; i < count; i++) {
      const u = monsterUnit(e.stats, `${e.id}#${i}`, e.side === "ally" ? "party" : "enemy", count > 1 ? `${e.stats.name} ${i + 1}` : e.stats.name);
      (e.side === "ally" ? allies : foes).push(u);
    }
  }
  const pcs = input.characters.map((ch) => characterUnit(ch, input.library, foes, input.fresh));
  return [...pcs, ...allies, ...foes];
}

export function analyze(input: FightInput, runs = 2000): Analysis | null {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const all = units(input);
  if (!all.some((u) => u.side === "enemy") || !all.some((u) => u.side === "party")) return null;

  const summary = simulate(all, runs, 20261009);
  const { tier, reasons } = rate(summary);

  const levels = input.characters.map((c) => c.class_levels.reduce((a, x) => a + x.level, 0) || 1);
  const enemyXp = input.entries.filter((e) => e.side === "enemy").reduce((a, e) => a + (e.stats.xp ?? 0) * e.count, 0);

  const threats = input.entries
    .filter((e) => e.side === "enemy")
    .map((e) => ({
      name: e.count > 1 ? `${e.stats.name} ×${e.count}` : e.stats.name,
      share: Object.entries(summary.damageShare).filter(([k]) => k.startsWith(`${e.id}#`)).reduce((a, [, v]) => a + v, 0),
    }))
    .sort((a, b) => b.share - a.share);

  const atRisk = input.characters
    .map((c) => ({ name: c.name, down: summary.downRate[`c:${c.id}`] ?? 0, death: summary.deathRate[`c:${c.id}`] ?? 0 }))
    .sort((a, b) => b.down - a.down);

  // "How much is too much": try one more / one fewer of each enemy (smaller runs, so it stays fast).
  const suggestions: string[] = [];
  const quick = (id: string, count: number) => rate(simulate(units(input, { id, count }), 600, 99)).tier;
  for (const e of input.entries.filter((x) => x.side === "enemy")) {
    const up = quick(e.id, e.count + 1);
    if (up !== tier) suggestions.push(`+1 ${e.stats.name} → ${up}`);
    if (e.count > 1 || input.entries.filter((x) => x.side === "enemy").length > 1) {
      const down = quick(e.id, e.count - 1);
      if (down !== tier) suggestions.push(`−1 ${e.stats.name} → ${down}`);
    }
    if (tier !== "Deadly") {
      // How many of this monster before it turns Deadly?
      for (let n = e.count + 1; n <= e.count + 6; n++) {
        if (quick(e.id, n) === "Deadly") {
          suggestions.push(`${e.stats.name}: ${n - 1} is the most before it turns Deadly`);
          break;
        }
      }
    }
  }

  const ms = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
  return { summary, tier, reasons, xp: xpBudget(levels, enemyXp), threats, atRisk, suggestions: [...new Set(suggestions)], ms };
}

export const TIER_ORDER = TIERS;
