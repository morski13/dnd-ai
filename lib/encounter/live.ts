// Live fight odds for the DM (pure, tested; runs on the DM's phone): the fight as it is right now (HP, slots,
// resources, monsters left) played 500 times, and what would make it fairer. Nothing changes until the DM picks.
import { characterUnit, monsterUnit, type CharacterForSim, type MonsterStats } from "./build";
import { luckFrom, withLuck, type RollHistory } from "./luck";
import { simulate, type Unit } from "./sim";
import type { SpellInfo } from "../rules";

export type LiveFoe = { key: string; monsterId: string; name: string; stats: MonsterStats; hp: number; ally?: boolean };
export type OddsInput = {
  characters: CharacterForSim[]; library: SpellInfo[]; foes: LiveFoe[];
  extra: { name: string; stats: MonsterStats }[]; // monsters from the saved fight that could join
  history?: Record<string, RollHistory>;
};
export type Odds = { pWin: number; pDown: number; pDeath: number };
export type Fairer = { id: string; label: string; odds: Odds; change: { kind: "remove"; monsterId: string } | { kind: "hp"; monsterId: string; minus: number } | { kind: "add"; name: string } };

function units(input: OddsInput, foes: LiveFoe[]): Unit[] {
  const mons = foes.filter((f) => f.hp > 0).map((f) => {
    const u = monsterUnit(f.stats, f.key, f.ally ? "party" : "enemy", f.name);
    return { ...u, startHp: Math.max(1, Math.min(u.maxHp, f.hp)) };
  });
  const enemies = mons.filter((u) => u.side === "enemy");
  const pcs = input.characters.map((ch) => {
    const u = characterUnit(ch, input.library, enemies, false);
    return input.history ? withLuck(u, luckFrom(input.history[ch.id])) : u;
  });
  return [...pcs, ...mons];
}

export function odds(input: OddsInput, foes = input.foes, runs = 500): Odds | null {
  const all = units(input, foes);
  if (!all.some((u) => u.side === "enemy") || !all.some((u) => u.side === "party")) return null;
  const s = simulate(all, runs, 20261102);
  return { pWin: s.pWin, pDown: s.pAnyDown, pDeath: s.pDeath };
}

/**
 * Changes that would make the fight fairer, with the odds after each: when it's too hard, take a monster out or
 * take HP off the toughest; when it's too easy, add one from the saved fight. Best for "fair" (≈70–85% to win) first.
 */
export function fairer(input: OddsInput, now: Odds, runs = 500): Fairer[] {
  const foes = input.foes.filter((f) => f.hp > 0 && !f.ally);
  const out: Fairer[] = [];
  const hard = now.pWin < 0.7 || now.pDeath > 0.1;
  if (hard) {
    for (const f of foes) {
      const o = odds(input, input.foes.filter((x) => x.key !== f.key), runs);
      if (o) out.push({ id: `rm:${f.key}`, label: `Remove ${f.name}`, odds: o, change: { kind: "remove", monsterId: f.monsterId } });
    }
    const tough = [...foes].sort((a, b) => b.hp - a.hp)[0];
    if (tough) {
      const minus = Math.max(1, Math.round(tough.hp * 0.3));
      const o = odds(input, input.foes.map((x) => (x.key === tough.key ? { ...x, hp: x.hp - minus } : x)), runs);
      if (o) out.push({ id: `hp:${tough.key}`, label: `${tough.name} −${minus} HP`, odds: o, change: { kind: "hp", monsterId: tough.monsterId, minus } });
    }
  } else {
    for (const e of input.extra.slice(0, 4)) {
      const o = odds(input, [...input.foes, { key: `add:${e.name}`, monsterId: "", name: e.name, stats: e.stats, hp: e.stats.hp }], runs);
      if (o) out.push({ id: `add:${e.name}`, label: `Add ${e.name}`, odds: o, change: { kind: "add", name: e.name } });
    }
  }
  const fairness = (o: Odds) => Math.abs(o.pWin - 0.78) + Math.max(0, o.pDeath - 0.05);
  return out.sort((a, b) => fairness(a.odds) - fairness(b.odds)).slice(0, 4);
}
