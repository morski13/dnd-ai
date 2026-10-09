import { describe, expect, it } from "vitest";
import fixture from "../test-fixtures/srd-fixture.json";
import monsters from "../test-fixtures/monsters-fixture.json";
import type { SpellInfo } from "../rules";
import { analyze, type FightEntry } from "./analyze";
import { characterUnit, monsterUnit, type MonsterStats } from "./build";
import { party } from "./calibrate.test";
import { compile, mulberry32, rollDice, simulate } from "./sim";

const library = fixture.spells as unknown as SpellInfo[];
const M = (name: string) => (monsters as unknown as MonsterStats[]).find((m) => m.name === name)!;
const entry = (name: string, count: number, side: "enemy" | "ally" = "enemy"): FightEntry => ({ id: name, stats: M(name), count, side });
const run = (entries: FightEntry[], fresh = true) => analyze({ characters: party(), library, entries, fresh })!;

describe("dice for the simulator", () => {
  it("compiles and averages", () => {
    expect(compile("2d8+4").avg).toBe(13);
    expect(compile("1d10+8+2d4").avg).toBe(18.5); // the stat block rounds each part down and prints 18
    expect(compile("15").avg).toBe(15);
  });
  it("crits double the dice, not the bonus", () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 200; i++) {
      const v = rollDice(compile("1d6+3"), rng, true);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(15);
    }
  });
});

describe("stat blocks become fighters", () => {
  it("Ogre: one Greatclub attack per turn", () => {
    const u = monsterUnit(M("Ogre"), "o");
    expect(u).toMatchObject({ ac: 11, maxHp: 68, init: -1 });
    expect(u.plans[0].strikes).toHaveLength(1);
    expect(u.plans[0].strikes[0]).toMatchObject({ kind: "attack", bonus: 6 });
  });
  it("Troll: Multiattack ×3 and regeneration", () => {
    const u = monsterUnit(M("Troll"), "t");
    expect(u.plans.find((p) => p.name.startsWith("Multiattack"))!.strikes).toHaveLength(3);
    expect(u.regeneration).toBe(15);
  });
  it("Young Red Dragon: breath weapon with recharge, catches several characters", () => {
    const u = monsterUnit(M("Young Red Dragon"), "d");
    const breath = u.plans.find((p) => p.name.startsWith("Fire Breath"))!;
    expect(breath.cost.recharge).toBe(5);
    expect(breath.strikes[0]).toMatchObject({ kind: "save", dc: 17, ability: "DEX", half: true });
    expect(breath.strikes[0].targets).toBeGreaterThanOrEqual(3);
  });
  it("characters fight with their Best moves, limited by resources", () => {
    const foes = [monsterUnit(M("Ogre"), "o")];
    const [brakka, lyra, , orrin] = party().map((p) => characterUnit(p, library, foes, true));
    expect(brakka.plans[0].name).toBe("Rage + Reckless Attack + Frenzy + Greataxe");
    expect(brakka.plans[0].cost).toMatchObject({ resource: "Rage", stance: true });
    expect(lyra.heals.map((h) => h.name)).toContain("Healing Word");
    expect(orrin.plans.at(-1)!.cost).toEqual({ slot: undefined, resource: undefined, stance: false }); // Fire Bolt: free fallback
    expect(orrin.slots).toEqual({ 1: 4, 2: 2 });
  });
});

describe("fight ratings for the Ashen Crown party (level 3)", () => {
  it("one Goblin Warrior is Easy", () => {
    expect(run([entry("Goblin Warrior", 1)]).tier).toBe("Easy");
  });
  it("session 3 (Ogre + 2 Goblins) is a real fight, but not Deadly", () => {
    const a = run([entry("Ogre", 1), entry("Goblin Warrior", 2)]);
    expect(["Medium", "Hard"]).toContain(a.tier);
    expect(a.summary.pWin).toBeGreaterThan(0.97);
    expect(a.threats[0].name).toBe("Ogre"); // the Ogre does most of the damage
  });
  it("three Ogres are Hard: one character may die, only a small chance of a wipe", () => {
    const a = run([entry("Ogre", 3)]);
    expect(a.tier).toBe("Hard");
    expect(a.summary.pDeath).toBeGreaterThan(0.01);   // someone can die…
    expect(a.summary.pLose).toBeLessThan(0.1);        // …but the party almost always makes it
  });
  it("four Ogres are Deadly: the party is often wiped out", () => {
    const a = run([entry("Ogre", 4)]);
    expect(a.tier).toBe("Deadly");
    expect(a.summary.pLose).toBeGreaterThanOrEqual(0.1);
  });
  it("a party of one: if that character dies, it's a wipe (Deadly)", () => {
    const solo = analyze({ characters: party().slice(0, 1), library, entries: [entry("Ogre", 2)], fresh: true })!;
    expect(solo.tier).toBe("Deadly");
  });
  it("a Young Red Dragon is Deadly (party almost never wins)", () => {
    const a = run([entry("Young Red Dragon", 1)]);
    expect(a.tier).toBe("Deadly");
    expect(a.summary.pWin).toBeLessThan(0.05);
  });
  it("more monsters never make it easier", () => {
    const order = ["Easy", "Medium", "Hard", "Deadly"];
    const tiers = [1, 2, 3, 4].map((n) => order.indexOf(run([entry("Ogre", n)]).tier));
    for (let i = 1; i < tiers.length; i++) expect(tiers[i]).toBeGreaterThanOrEqual(tiers[i - 1]);
  });
  it("an NPC ally makes the fight easier", () => {
    const alone = run([entry("Ogre", 2)]).summary;
    const helped = run([entry("Ogre", 2), entry("Bandit Captain", 1, "ally")]).summary;
    expect(helped.pAnyDown).toBeLessThan(alone.pAnyDown);
  });
  it("a hurt party (as they are now) has a harder time than a fresh one", () => {
    const hurt = party().map((p) => ({ ...p, hp_current: Math.ceil((p.hp_max ?? 10) / 3), spells: { ...p.spells, slots_used: { "1": 4, "2": 2 } } }));
    const fresh = analyze({ characters: party(), library, entries: [entry("Ogre", 2)], fresh: true })!.summary;
    const tired = analyze({ characters: hurt, library, entries: [entry("Ogre", 2)], fresh: false })!.summary;
    expect(tired.pAnyDown).toBeGreaterThan(fresh.pAnyDown);
  });
  it("suggests how much is too much", () => {
    const a = run([entry("Ogre", 1), entry("Goblin Warrior", 2)]);
    expect(a.suggestions.some((s) => s.startsWith("+1 Ogre →") || s.includes("before it turns Deadly"))).toBe(true);
  });
  it("same fight → same numbers (no jitter), and fast", () => {
    const a = run([entry("Ogre", 2)]);
    const b = run([entry("Ogre", 2)]);
    expect(a.summary.pWin).toBe(b.summary.pWin);
    expect(a.ms).toBeLessThan(5000);
  });
  it("2,000 fights run well under a second", () => {
    const foes = [monsterUnit(M("Ogre"), "o1"), monsterUnit(M("Ogre"), "o2"), monsterUnit(M("Goblin Boss"), "g")];
    const pcs = party().map((p) => characterUnit(p, library, foes, true));
    const t0 = performance.now();
    simulate([...pcs, ...foes], 2000, 1);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
