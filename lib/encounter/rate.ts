// Turns simulation results into Easy / Medium / Hard / Deadly, plus the official XP budget for comparison.
import type { SimSummary } from "./sim";

export type Tier = "Easy" | "Medium" | "Hard" | "Deadly";
export const TIERS: Tier[] = ["Easy", "Medium", "Hard", "Deadly"];

/**
 * Easy   – no or little trouble: someone drops in < 8% of fights, < 15% of HP lost.
 * Medium – low to medium trouble: someone drops in 8–30% of fights, or 15–35% of HP lost.
 * Hard   – medium to hard, what most players want: someone often drops (30%+), 35%+ HP lost,
 *          ONE character may die, and there can be a small (< 10%) chance of a wipe.
 * Deadly – the party may not make it: wiped out in 10%+ of fights,
 *          or 10%+ chance that half the party (or more) dies.
 */
export function rate(s: SimSummary): { tier: Tier; reasons: string[] } {
  const pct = (x: number) => (x > 0 && x < 0.01 ? "<1%" : `${Math.round(x * 100)}%`);
  if (s.pLose >= 0.1 || s.pHalfDead >= 0.1) {
    return { tier: "Deadly", reasons: [
      s.pLose >= 0.1 ? `The party is wiped out in ${pct(s.pLose)} of fights` : "",
      s.pHalfDead >= 0.1 ? `${pct(s.pHalfDead)} chance that half the party or more dies` : "",
    ].filter(Boolean) };
  }
  if (s.pDeath >= 0.01 || s.pAnyDown >= 0.3 || s.avgHpLost >= 0.35 || s.pLose >= 0.01) {
    return { tier: "Hard", reasons: [
      s.pAnyDown >= 0.3 ? `Someone drops to 0 HP in ${pct(s.pAnyDown)} of fights` : "",
      s.avgHpLost >= 0.35 ? `The party loses ${pct(s.avgHpLost)} of its HP on average` : "",
      s.pDeath >= 0.01 ? `${pct(s.pDeath)} chance a character dies` : "",
      s.pLose >= 0.01 ? `Small chance (${pct(s.pLose)}) the party is wiped out` : "",
    ].filter(Boolean) };
  }
  if (s.pAnyDown >= 0.08 || s.avgHpLost >= 0.15) {
    return { tier: "Medium", reasons: [
      s.pAnyDown >= 0.08 ? `Someone drops in ${pct(s.pAnyDown)} of fights` : "",
      s.avgHpLost >= 0.15 ? `The party loses about ${pct(s.avgHpLost)} of its HP` : "",
    ].filter(Boolean) };
  }
  return { tier: "Easy", reasons: [`Party wins ${pct(s.pWin)} of fights, losing about ${pct(s.avgHpLost)} of its HP`] };
}

// 2024 rules (SRD 5.2): XP budget per character, by level: [Low, Moderate, High]
const BUDGET: Record<number, [number, number, number]> = {
  1: [50, 75, 100], 2: [100, 150, 200], 3: [150, 225, 400], 4: [250, 375, 500], 5: [500, 750, 1100],
  6: [600, 1000, 1400], 7: [750, 1300, 1700], 8: [1000, 1700, 2100], 9: [1300, 2000, 2600], 10: [1600, 2300, 3100],
  11: [1900, 2900, 4100], 12: [2200, 3700, 4700], 13: [2600, 4200, 5400], 14: [2900, 4900, 6200], 15: [3300, 5400, 7800],
  16: [3800, 6100, 9800], 17: [4500, 7200, 11700], 18: [5000, 8700, 14200], 19: [5500, 10700, 17200], 20: [6400, 13200, 22000],
};

export function xpBudget(levels: number[], enemyXp: number) {
  const sum = (i: 0 | 1 | 2) => levels.reduce((a, l) => a + (BUDGET[Math.min(20, Math.max(1, l))]?.[i] ?? 0), 0);
  const low = sum(0), moderate = sum(1), high = sum(2);
  const label = enemyXp <= low ? "Low" : enemyXp <= moderate ? "Moderate" : enemyXp <= high ? "High" : "Over High";
  return { low, moderate, high, enemyXp, label };
}
