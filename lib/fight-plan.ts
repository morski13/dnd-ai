// A fight the DM builds on the spot in Session mode (pure, tested): who joins, and which creatures.
// SRD monsters and homebrew monsters are copied into the fight ("Goblin 1", "Goblin 2"), so the template
// stays fresh for the next fight. The DM's NPCs and monsters already in the campaign join as themselves.

export type Side = "enemy" | "ally";
export type PlanPick = { source: "srd" | "campaign"; ref: string; name: string; count: number; side: Side };
export type FightPlan = { players: string[]; dmCharacters: string[]; picks: PlanPick[] };

export const MAX_PER_PICK = 20;
export const MAX_CREATURES = 40;

/** Keep the plan sane: counts 1–20, at most 40 creatures, no duplicate people. */
export function cleanPlan(p: FightPlan): FightPlan {
  const ids = (xs: unknown) => [...new Set((Array.isArray(xs) ? xs : []).filter((x): x is string => typeof x === "string" && x.length > 0 && x.length < 80))];
  let left = MAX_CREATURES;
  const picks: PlanPick[] = [];
  for (const k of Array.isArray(p.picks) ? p.picks : []) {
    if (!k || (k.source !== "srd" && k.source !== "campaign") || typeof k.ref !== "string" || !k.ref) continue;
    const count = Math.max(1, Math.min(MAX_PER_PICK, Math.floor(Number(k.count) || 1), left));
    if (left <= 0) break;
    left -= count;
    picks.push({ source: k.source, ref: k.ref.slice(0, 120), name: String(k.name ?? k.ref).slice(0, 80), count, side: k.side === "ally" ? "ally" : "enemy" });
  }
  return { players: ids(p.players), dmCharacters: ids(p.dmCharacters).filter((x) => !ids(p.players).includes(x)), picks };
}

/**
 * Names for copies of a monster: "Ogre" for one, "Goblin 1", "Goblin 2"… for several, carrying on after the
 * ones already in the fight ("Goblin 3" when 1 and 2 are there).
 */
export function copyNames(base: string, count: number, taken: string[]): string[] {
  const esc = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nums = taken.map((t) => t.match(new RegExp(`^${esc}(?: (\\d+))?$`))).filter(Boolean).map((m) => Number(m![1] ?? 1));
  const already = nums.length;
  if (count === 1 && already === 0) return [base];
  let n = Math.max(0, ...nums);
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(`${base} ${++n}`);
  return out;
}

/** How many enemies and allies the plan brings, for the Start button. */
export function planCount(p: FightPlan) {
  const enemies = p.picks.filter((k) => k.side === "enemy").reduce((a, k) => a + k.count, 0);
  const allies = p.picks.filter((k) => k.side === "ally").reduce((a, k) => a + k.count, 0) + p.dmCharacters.length;
  return { enemies, allies, players: p.players.length };
}
