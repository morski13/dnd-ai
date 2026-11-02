// Fight mode on the character sheet: the app counts your Action, Bonus Action and Reaction for the turn.
// Pure (tested). The Attack action holds several attacks (Extra Attack); Action Surge adds an action.
// Nothing is ever blocked: rolling past what's left only shows a warning, the DM has the final word.
import { actionOf, type Option } from "./rules";

export type Turn = {
  round: number;
  actions: number;        // actions this turn (1, or 2 after Action Surge)
  actionsUsed: number;
  attacksLeft: number;    // attacks left in an Attack action already started
  bonusUsed: boolean;
  reactionUsed: boolean;
  thisTurn: string[];     // boosts used this turn (Reckless Attack, Sneak Attack once per turn)
  ongoing: string[];      // boosts that last (Rage) until switched off or the fight ends
  over: boolean;          // the turn is finished (ended by hand, or everything used)
};

export const NEW_FIGHT: Turn = { round: 1, actions: 1, actionsUsed: 0, attacksLeft: 0, bonusUsed: false, reactionUsed: false, thisTurn: [], ongoing: [], over: false };

/** How many attacks one Attack action gives (Extra Attack and the Fighter's later ones). */
export function attacksPerAction(classes: { class: string; level: number }[], features: (string | { name: string })[] = []): number {
  let n = 1;
  for (const c of classes) {
    const cls = c.class.toLowerCase();
    if (cls === "fighter") n = Math.max(n, c.level >= 20 ? 4 : c.level >= 11 ? 3 : c.level >= 5 ? 2 : 1);
    else if (["barbarian", "monk", "paladin", "ranger"].includes(cls) && c.level >= 5) n = Math.max(n, 2);
  }
  const names = features.map((f) => (typeof f === "string" ? f : f.name).toLowerCase());
  if (names.some((x) => x.includes("three extra attacks"))) n = Math.max(n, 4);
  else if (names.some((x) => x.includes("two extra attacks"))) n = Math.max(n, 3);
  else if (names.some((x) => /^extra attack\b/.test(x))) n = Math.max(n, 2);
  return n;
}

export const actionsLeft = (t: Turn) => Math.max(0, t.actions - t.actionsUsed);

/** A boost that lasts past this turn: one that costs a bonus action and a use (Rage). */
export const lasts = (o: Option) => o.kind === "boost" && actionOf(o) === "bonus" && !!o.resource;

export type Spent = { turn: Turn; warning: string | null };

/** What using this option costs this turn. Options that cost nothing (checks, damage rolls) change nothing. */
export function spend(t: Turn, o: Option | null | undefined, perAction: number): Spent {
  if (!o) return { turn: t, warning: null };
  const next: Turn = { ...t, thisTurn: [...t.thisTurn], ongoing: [...t.ongoing] };
  let warning: string | null = null;
  const kind = actionOf(o);
  if (kind === "reaction") {
    if (next.reactionUsed) warning = "You already used your reaction this round.";
    next.reactionUsed = true;
  } else if (t.over) {
    warning = "Your turn is over. Start your next turn first, or use a reaction.";
  } else if (kind === "bonus") {
    if (next.bonusUsed) warning = "You already used your bonus action this turn.";
    next.bonusUsed = true;
  } else if (kind === "action") {
    if (o.kind === "weapon" && next.attacksLeft > 0) next.attacksLeft -= 1;   // the next attack of the Attack action
    else {
      if (actionsLeft(next) === 0) warning = "You have no action left this turn.";
      next.actionsUsed += 1;
      next.attacksLeft = o.kind === "weapon" ? Math.max(0, perAction - 1) : 0;
    }
  }
  if (o.kind === "boost") {
    if (lasts(o)) { if (!next.ongoing.includes(o.name)) next.ongoing.push(o.name); }
    else if (!next.thisTurn.includes(o.name)) next.thisTurn.push(o.name);
  } else if (o.once_per_turn && !next.thisTurn.includes(o.name)) next.thisTurn.push(o.name);
  return { turn: next, warning };
}

/** Everything that matters is used: no action, no attacks left, and no bonus action left (or none to use). */
export const turnFinished = (t: Turn, hasBonusThings: boolean) =>
  actionsLeft(t) === 0 && t.attacksLeft === 0 && (t.bonusUsed || !hasBonusThings);

/** The next turn: action, bonus action and reaction come back; Rage and the like keep going. */
export const nextTurn = (t: Turn): Turn => ({ ...NEW_FIGHT, round: t.round + 1, ongoing: t.ongoing });

export const actionSurge = (t: Turn): Turn => ({ ...t, actions: t.actions + 1, over: false });

/** For "Best moves": what's still possible this turn. */
export const turnLeft = (t: Turn) => ({
  actionLeft: !t.over && actionsLeft(t) > 0,
  attacksLeft: t.over ? 0 : t.attacksLeft,
  bonusLeft: !t.over && !t.bonusUsed,
  active: [...t.ongoing, ...t.thisTurn],
});

const LINES = [
  "The initiative passes on.",
  "Catch your breath. The fight isn't over.",
  "Steel rests, but the battle rages on.",
  "Your foes take their measure of you.",
  "The dice cool. Watch the others' turns.",
  "Hold the line until your next turn.",
];
/** A D&D-style line for the end of the turn (the same one for the whole turn). */
export const endLine = (round: number) => LINES[Math.abs(round * 7 + 3) % LINES.length];
