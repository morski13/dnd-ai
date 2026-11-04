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
  moved: number;          // feet moved this turn
  dashes: number;         // Dash taken this turn (each adds your speed)
  actionSpell: "cantrip" | "leveled" | null; // a spell cast with the action this turn
  bonusSpell: boolean;    // a spell cast with the bonus action this turn
};

export const NEW_FIGHT: Turn = {
  round: 1, actions: 1, actionsUsed: 0, attacksLeft: 0, bonusUsed: false, reactionUsed: false, thisTurn: [], ongoing: [], over: false,
  moved: 0, dashes: 0, actionSpell: null, bonusSpell: false,
};

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

/**
 * What using this option costs this turn. Options that cost nothing (checks, damage rolls) change nothing.
 * `as: "reaction"`: used as a reaction off your turn (an Opportunity Attack with your weapon).
 */
export function spend(t: Turn, o: Option | null | undefined, perAction: number, as?: "reaction"): Spent {
  if (!o) return { turn: t, warning: null };
  const next: Turn = { ...t, thisTurn: [...t.thisTurn], ongoing: [...t.ongoing] };
  let warning: string | null = null;
  const kind = as ?? actionOf(o);
  // one turn, two spells: after a bonus-action spell, the action can only cast a cantrip (and the other way round)
  if (o.fromSpell && kind !== "reaction") {
    const leveled = (o.level ?? 0) > 0;
    if (kind === "bonus" && t.actionSpell === "leveled") warning = "You already cast a levelled spell with your action: a bonus-action spell isn't allowed this turn.";
    if (kind === "action" && t.bonusSpell && leveled) warning = "You cast a bonus-action spell this turn: your action can only cast a cantrip.";
    if (kind === "bonus") next.bonusSpell = true;
    if (kind === "action") next.actionSpell = leveled || t.actionSpell === "leveled" ? "leveled" : "cantrip";
  }
  if (kind === "reaction") {
    if (next.reactionUsed) warning = "You already used your reaction this round.";
    next.reactionUsed = true;
    if (as) return { turn: next, warning };
  } else if (t.over) {
    warning = "Your turn is over. Start your next turn first, or use a reaction.";
  } else if (kind === "bonus") {
    if (next.bonusUsed) warning = "You already used your bonus action this turn.";
    next.bonusUsed = true;
  } else if (kind === "action") {
    if (o.kind === "weapon" && next.attacksLeft > 0) next.attacksLeft -= 1;   // the next attack of the Attack action
    else {
      if (actionsLeft(next) === 0) warning ??= "You have no action left this turn.";
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

/** The next turn: action, bonus action, reaction and movement come back; Rage and the like keep going. */
export const nextTurn = (t: Turn): Turn => ({ ...NEW_FIGHT, round: t.round + 1, ongoing: t.ongoing });

/** Your turn comes up in a shared fight (round from the fight itself). */
export const startTurn = (t: Turn, round: number): Turn => ({ ...NEW_FIGHT, round, ongoing: t.ongoing });

// ---------------------------------------------------------------- the actions everyone has

export type StandardAction = { name: string; what: string; bonusWith?: string };

/** The actions anyone can take in combat (PHB). Each one is your Action; some classes can do a few as a bonus action. */
export const STANDARD_ACTIONS: StandardAction[] = [
  { name: "Dash", what: "Move again: your speed is added to this turn's movement.", bonusWith: "Cunning Action" },
  { name: "Disengage", what: "Your movement doesn't provoke opportunity attacks this turn.", bonusWith: "Cunning Action" },
  { name: "Dodge", what: "Until your next turn, attacks against you have disadvantage and your DEX saves have advantage." },
  { name: "Help", what: "An ally gets advantage on their next check, or on their next attack against a creature near you." },
  { name: "Hide", what: "Make a Stealth check to hide.", bonusWith: "Cunning Action" },
  { name: "Ready", what: "Pick a trigger and an action; when it happens, you use your reaction to do it." },
  { name: "Search", what: "Look for something: a Perception or Investigation check." },
  { name: "Use an Object", what: "Drink a potion, pull a lever, use an item that needs an action." },
];

/** Which standard actions this character can also take as a bonus action (Rogue's Cunning Action at level 2). */
export function bonusStandardActions(classes: { class: string; level: number }[], features: (string | { name: string })[] = []): Set<string> {
  const names = features.map((f) => (typeof f === "string" ? f : f.name).toLowerCase());
  const cunning = classes.some((c) => c.class.toLowerCase() === "rogue" && c.level >= 2) || names.includes("cunning action");
  return new Set(cunning ? STANDARD_ACTIONS.filter((a) => a.bonusWith === "Cunning Action").map((a) => a.name) : []);
}

/** Take a standard action (Dash, Dodge…) with your Action, or with your bonus action when you can. */
export function takeAction(t: Turn, name: string, asBonus = false): Spent {
  const next: Turn = { ...t, thisTurn: [...t.thisTurn] };
  let warning: string | null = null;
  if (t.over) warning = "Your turn is over. Start your next turn first, or use a reaction.";
  else if (asBonus) {
    if (t.bonusUsed) warning = "You already used your bonus action this turn.";
    next.bonusUsed = true;
  } else {
    if (actionsLeft(t) === 0) warning = t.attacksLeft > 0 ? "Your action went on the Attack action this turn." : "You have no action left this turn.";
    next.actionsUsed += 1;
    next.attacksLeft = 0;
  }
  if (name === "Dash") next.dashes += 1;
  if ((name === "Dodge" || name === "Disengage") && !next.thisTurn.includes(name)) next.thisTurn.push(name);
  return { turn: next, warning };
}

/** How far you can move this turn: your speed, plus your speed again for every Dash. */
export const moveBudget = (t: Turn, speed: number) => Math.max(0, speed) * (1 + t.dashes);

/** Move (or take back) some feet. Never below 0; going past what you have only warns. */
export function move(t: Turn, feet: number, speed: number): Spent {
  const moved = Math.max(0, t.moved + feet);
  const over = moved > moveBudget(t, speed);
  return { turn: { ...t, moved }, warning: over ? `That's ${moved} ft: more than your ${moveBudget(t, speed)} ft this turn. Dash to move further.` : null };
}

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
