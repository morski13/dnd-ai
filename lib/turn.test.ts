import { describe, expect, it } from "vitest";
import { bestMoves, findCombos } from "./combos";
import { allOptions, type SheetCharacter } from "./rules";
import { actionSurge, attacksPerAction, bonusStandardActions, move, moveBudget, NEW_FIGHT, nextTurn, spend, startTurn, takeAction, turnFinished, turnLeft } from "./turn";

// Kazar: Barbarian 9 / Fighter 1 with a morningstar, Rage and Reckless Attack
const kazar: SheetCharacter = {
  ability_scores: { STR: 19, DEX: 15, CON: 20, INT: 9, WIS: 11, CHA: 12 },
  class_levels: [{ class: "Barbarian", level: 9 }, { class: "Fighter", level: 1 }],
  proficiencies: { saves: ["STR", "CON"] }, spells: {},
  attacks: [
    { name: "Morningstar", kind: "weapon", ability: "STR", damage: "1d8", damage_type: "piercing", add_mod: true },
    { name: "Rage", kind: "boost", action: "bonus", resource: "Rage", applies: "str_weapon", damage_bonus: 3 },
    { name: "Reckless Attack", kind: "boost", action: "free", applies: "str_weapon", gives_advantage: true, drawback: "Attacks against you have advantage" },
  ],
};
const options = allOptions(kazar, []);
const opt = (name: string) => options.find((o) => o.name === name)!;
const target = { ac: 15, saveBonus: 2, allyAdjacent: false };

describe("fight mode: the turn", () => {
  it("attacks per Attack action", () => {
    expect(attacksPerAction(kazar.class_levels)).toBe(2);
    expect(attacksPerAction([{ class: "Fighter", level: 11 }])).toBe(3);
    expect(attacksPerAction([{ class: "Wizard", level: 9 }])).toBe(1);
    expect(attacksPerAction([{ class: "Bard", level: 6 }], [{ name: "Extra Attack" }])).toBe(2);
  });

  it("Rage, then two attacks: the turn ends by itself; Rage keeps going next turn", () => {
    let t = spend(NEW_FIGHT, opt("Rage"), 2).turn;
    expect(t).toMatchObject({ bonusUsed: true, ongoing: ["Rage"], actionsUsed: 0 });
    t = spend(t, opt("Reckless Attack"), 2).turn;
    expect(t.thisTurn).toEqual(["Reckless Attack"]);
    t = spend(t, opt("Morningstar"), 2).turn;
    expect(t).toMatchObject({ actionsUsed: 1, attacksLeft: 1 });
    expect(turnFinished(t, true)).toBe(false);
    t = spend(t, opt("Morningstar"), 2).turn;
    expect(t).toMatchObject({ actionsUsed: 1, attacksLeft: 0 });
    expect(turnFinished(t, true)).toBe(true);
    const n = nextTurn(t);
    expect(n).toMatchObject({ round: 2, actionsUsed: 0, bonusUsed: false, reactionUsed: false, ongoing: ["Rage"], thisTurn: [] });
  });

  it("warnings, never blocks; Action Surge gives another action", () => {
    let t = spend(NEW_FIGHT, opt("Morningstar"), 1).turn;
    const again = spend(t, opt("Morningstar"), 1);
    expect(again.warning).toMatch(/no action left/);
    t = actionSurge(t);
    expect(spend(t, opt("Morningstar"), 1).warning).toBeNull();
    expect(spend({ ...t, over: true }, opt("Rage"), 1).warning).toMatch(/turn is over/);
    // damage rolls, checks: no option, nothing spent
    expect(spend(t, null, 1).turn).toBe(t);
  });

  it("Best moves re-plans: Rage already on isn't suggested again, the second attack comes next", () => {
    const fresh = bestMoves(kazar, options, target).bestDamage!;
    expect(fresh.title).toBe("Rage + Reckless Attack + Morningstar");

    let t = spend(NEW_FIGHT, opt("Rage"), 2).turn;
    const afterRage = bestMoves(kazar, options, target, turnLeft(t)).bestDamage!;
    expect(afterRage.title).toBe("Reckless Attack + Morningstar");
    expect(afterRage.costs).toEqual([]);
    expect(afterRage.steps[0]).toMatchObject({ name: "Rage", action: "Already on" });
    expect(afterRage.damage).toBeCloseTo(fresh.damage, 5); // same attack, Rage still counts

    t = spend(spend(t, opt("Reckless Attack"), 2).turn, opt("Morningstar"), 2).turn;
    const second = bestMoves(kazar, options, target, turnLeft(t)).bestDamage!;
    expect(second.title).toBe("Morningstar"); // Reckless already on this turn
    expect(second.steps.map((s) => s.action)).toEqual(["Already on", "Already on", "Attack (same action)"]);

    t = spend(t, opt("Morningstar"), 2).turn;
    expect(findCombos(kazar, options, target, turnLeft(t))).toEqual([]); // nothing left
  });
});

describe("combat mode: actions everyone has, movement, spells", () => {
  it("Dash after casting a spell: the action is gone (Cuca's bug)", () => {
    const wizard: SheetCharacter = { ...kazar, class_levels: [{ class: "Wizard", level: 5 }], attacks: [] };
    const bolt = { ...opt("Morningstar"), name: "Fire Bolt", kind: "spell_attack" as const, fromSpell: { name: "Fire Bolt" } as never, level: 0 };
    let t = spend(NEW_FIGHT, bolt, attacksPerAction(wizard.class_levels)).turn;
    expect(t.actionsUsed).toBe(1);
    const dash = takeAction(t, "Dash");
    expect(dash.warning).toMatch(/no action left/);
    t = dash.turn;
    expect(t.dashes).toBe(1);
  });

  it("Cunning Action: Dash as a bonus action keeps the action", () => {
    const rogue = [{ class: "Rogue", level: 3 }];
    expect(bonusStandardActions(rogue).has("Dash")).toBe(true);
    expect(bonusStandardActions([{ class: "Rogue", level: 1 }]).size).toBe(0);
    const r = takeAction(NEW_FIGHT, "Dash", true);
    expect(r.warning).toBeNull();
    expect(r.turn).toMatchObject({ bonusUsed: true, actionsUsed: 0, dashes: 1 });
  });

  it("movement: speed, plus speed again per Dash; resets next turn", () => {
    let t = move(NEW_FIGHT, 25, 30).turn;
    expect(moveBudget(t, 30)).toBe(30);
    const far = move(t, 10, 30);
    expect(far.warning).toMatch(/more than your 30 ft/);
    t = takeAction(t, "Dash").turn;
    expect(moveBudget(t, 30)).toBe(60);
    expect(move(t, 10, 30).warning).toBeNull();
    expect(move(t, -100, 30).turn.moved).toBe(0);
    expect(nextTurn(t)).toMatchObject({ moved: 0, dashes: 0 });
  });

  it("Opportunity Attack spends the reaction, not the action", () => {
    const over = { ...NEW_FIGHT, over: true, actionsUsed: 1 };
    const r = spend(over, opt("Morningstar"), 2, "reaction");
    expect(r.warning).toBeNull();
    expect(r.turn).toMatchObject({ reactionUsed: true, actionsUsed: 1, attacksLeft: 0 });
    expect(spend(r.turn, opt("Morningstar"), 2, "reaction").warning).toMatch(/reaction/);
  });

  it("bonus-action spell, then only a cantrip with the action", () => {
    const spell = (name: string, action: "action" | "bonus", level: number) =>
      ({ name, key: `spell:${name}`, kind: "heal", action, level, fromSpell: { name } }) as never;
    let t = spend(NEW_FIGHT, spell("Healing Word", "bonus", 1), 1).turn;
    expect(spend(t, spell("Cure Wounds", "action", 1), 1).warning).toMatch(/only cast a cantrip/);
    expect(spend(t, spell("Sacred Flame", "action", 0), 1).warning).toBeNull();
    t = spend(NEW_FIGHT, spell("Fireball", "action", 3), 1).turn;
    expect(spend(t, spell("Healing Word", "bonus", 1), 1).warning).toMatch(/bonus-action spell isn't allowed/);
  });

  it("your turn comes up in a shared fight: fresh turn at the fight's round, Rage still on", () => {
    const t = { ...NEW_FIGHT, round: 1, ongoing: ["Rage"], actionsUsed: 1, reactionUsed: true, over: true };
    expect(startTurn(t, 3)).toMatchObject({ round: 3, actionsUsed: 0, reactionUsed: false, over: false, ongoing: ["Rage"] });
  });
});
