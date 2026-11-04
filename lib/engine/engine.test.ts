import { describe, expect, it } from "vitest";
import { attackMods, canAct, checkMods, combine, exhaustion, rollWith, saveMods, speedOf } from "./conditions";
import { conditionBlocked, defensesOf, factorFor, parseDamageList, typesIn } from "./damage";
import { afterSave, cleanEffects, describe as describeEffect, endConcentration, makeEffect, shownConditions, tick, withoutEffect } from "./effects";

const you = (conds: string[] = []) => ({ name: "Kazar", conds });
const ogre = (conds: string[] = []) => ({ name: "Ogre", conds });

describe("conditions", () => {
  it("prone: advantage next to it, disadvantage from afar", () => {
    expect(attackMods(you(), ogre(["Prone"]), { ranged: false, within5: true, rules: "2014" }).advantage).toEqual(["Ogre is Prone (you're next to it)"]);
    expect(attackMods(you(), ogre(["Prone"]), { ranged: true, within5: false, rules: "2014" }).disadvantage).toEqual(["Ogre is Prone (you're not next to it)"]);
  });
  it("advantage and disadvantage cancel out, however many", () => {
    const m = attackMods(you(["Poisoned", "Prone"]), ogre(["Restrained"]), { ranged: false, within5: true, rules: "2014" });
    expect(m.disadvantage).toHaveLength(2);
    expect(combine("normal", m)).toBe("normal");
    expect(combine("advantage", { advantage: [], disadvantage: [] })).toBe("advantage");
    expect(rollWith("normal", m).reasons).toContain("Advantage: Ogre is Restrained");
  });
  it("paralyzed: advantage and auto-crit within 5 ft, STR/DEX saves fail", () => {
    const m = attackMods(you(), ogre(["Paralyzed"]), { ranged: false, within5: true, rules: "2014" });
    expect(m.advantage).toContain("Ogre is Paralyzed");
    expect(m.autoCrit).toMatch(/critical/);
    expect(attackMods(you(), ogre(["Paralyzed"]), { ranged: true, within5: false, rules: "2014" }).autoCrit).toBeUndefined();
    expect(saveMods(ogre(["Paralyzed"]), "DEX", "2014").autoFail).toMatch(/fail/);
    expect(saveMods(ogre(["Paralyzed"]), "WIS", "2014").autoFail).toBeUndefined();
  });
  it("ranged attack with an enemy next to you", () => {
    expect(attackMods(you(), ogre(), { ranged: true, within5: true, rules: "2014" }).disadvantage[0]).toMatch(/ranged attack/);
  });
  it("exhaustion: 2014 levels, 2024 −2 per level", () => {
    expect(exhaustion(["Exhaustion"])).toBe(1);
    expect(exhaustion(["Exhaustion 3"])).toBe(3);
    expect(checkMods(you(["Exhaustion"]), "2014").disadvantage).toHaveLength(1);
    expect(attackMods(you(["Exhaustion 2"]), ogre(), { ranged: false, within5: true, rules: "2014" }).disadvantage).toHaveLength(0);
    expect(attackMods(you(["Exhaustion 3"]), ogre(), { ranged: false, within5: true, rules: "2014" }).disadvantage).toHaveLength(1);
    expect(saveMods(you(["Exhaustion 2"]), "CON", "2024").penalty).toBe(-4);
    expect(speedOf(30, ["Exhaustion 2"], "2014").speed).toBe(15);
    expect(speedOf(30, ["Exhaustion 2"], "2024").speed).toBe(20);
    expect(speedOf(30, ["Grappled"], "2024").speed).toBe(0);
    expect(canAct(["Exhaustion 6"], "2024").actions).toBe(false);
  });
  it("incapacitated: no actions, no reactions", () => {
    expect(canAct(["Stunned"], "2014")).toMatchObject({ actions: false, reactions: false });
    expect(canAct(["Prone"], "2014")).toMatchObject({ actions: true, reactions: true });
  });
});

describe("damage types", () => {
  const golem = defensesOf({
    resistances: "fire; bludgeoning, piercing, and slashing from nonmagical attacks",
    immunities: ["poison", "psychic"], vulnerabilities: "radiant", condition_immunities: "charmed, poisoned",
  });
  it("reads stat block text", () => {
    expect(parseDamageList("cold, fire").map((d) => d.type)).toEqual(["cold", "fire"]);
    expect(golem.resist.find((d) => d.type === "slashing")?.nonmagicalOnly).toBe(true);
    expect(golem.resist.find((d) => d.type === "fire")?.nonmagicalOnly).toBe(false);
    expect(golem.conditionImmune).toEqual(["Charmed", "Poisoned"]);
    expect(typesIn("Fire + Radiant")).toEqual(["fire", "radiant"]);
  });
  it("resist, immune, vulnerable, magical weapons", () => {
    expect(factorFor(["fire"], golem).factor).toBe("resist");
    expect(factorFor(["poison"], golem).factor).toBe("immune");
    expect(factorFor(["radiant"], golem).factor).toBe("double");
    expect(factorFor(["slashing"], golem, { magical: false }).factor).toBe("resist");
    expect(factorFor(["slashing"], golem, { magical: true }).factor).toBe("full");
    expect(factorFor(["fire", "radiant"], golem).factor).toBe("full"); // mixed: neither covers both
    expect(factorFor(["cold"], defensesOf({}), { magical: false, conds: ["Petrified"] }).factor).toBe("resist");
    expect(conditionBlocked("Poisoned", golem)).toMatch(/immune/);
    expect(conditionBlocked("Prone", golem)).toBeNull();
  });
});

describe("timed effects", () => {
  const hold = makeEffect({ id: "e1", name: "Hold Person", conditions: ["Paralyzed"], source: { combatantId: "orrin", name: "Orrin" },
    duration: "save_ends", rounds: 10, turnsOf: "orrin", target: "ogre", save: { ability: "WIS", dc: 15 }, concentration: true });
  it("save ends: a save comes due at the end of the target's turn", () => {
    const r = tick([hold], "ogre", { kind: "end", combatantId: "ogre" });
    expect(r.saves).toEqual([{ effectId: "e1", name: "Hold Person", ability: "WIS", dc: 15 }]);
    expect(tick([hold], "ogre", { kind: "end", combatantId: "orrin" }).saves).toEqual([]);
    expect(afterSave([hold], "e1", true).kept).toEqual([]);
    expect(afterSave([hold], "e1", false).kept).toHaveLength(1);
  });
  it("until the end of my next turn; 1 minute counts the caster's turns", () => {
    const dodge = makeEffect({ id: "e2", name: "Vicious Mockery", conditions: [], source: null, duration: "end_of_next_turn", turnsOf: "ogre", target: "ogre" });
    expect(tick([dodge], "ogre", { kind: "start", combatantId: "ogre" }).kept).toHaveLength(1);
    expect(tick([dodge], "ogre", { kind: "end", combatantId: "ogre" }).expired).toHaveLength(1);
    let left = [hold];
    for (let i = 0; i < 9; i++) left = tick(left, "ogre", { kind: "start", combatantId: "orrin" }).kept;
    expect(left).toHaveLength(1);
    expect(tick(left, "ogre", { kind: "start", combatantId: "orrin" }).expired).toHaveLength(1);
  });
  it("concentration and shown conditions", () => {
    expect(endConcentration([hold], "orrin").kept).toEqual([]);
    expect(shownConditions(["Prone"], [hold])).toEqual(["Prone", "Paralyzed"]);
    expect(withoutEffect(["Prone", "Paralyzed"], [hold], [])).toEqual(["Prone"]);
    expect(describeEffect(hold, (id) => (id === "orrin" ? "Orrin" : id))).toMatch(/WIS save DC 15/);
    expect(cleanEffects([hold, { id: "", name: "x" }, "junk"])).toHaveLength(1);
  });
});
