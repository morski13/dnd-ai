import { describe, expect, it } from "vitest";
import { bestMoves, findCombos } from "./combos";
import { allOptions, type SheetCharacter } from "./rules";
import { actionSurge, attacksPerAction, NEW_FIGHT, nextTurn, spend, turnFinished, turnLeft } from "./turn";

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
