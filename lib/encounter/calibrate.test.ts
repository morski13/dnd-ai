// Prints how the Ashen Crown party does against a range of fights (run: npx vitest run calibrate).
import { it } from "vitest";
import fixture from "../test-fixtures/srd-fixture.json";
import monsters from "../test-fixtures/monsters-fixture.json";
import type { SpellInfo } from "../rules";
import { characterUnit, monsterUnit, type CharacterForSim, type MonsterStats } from "./build";
import { rate } from "./rate";
import { simulate } from "./sim";

const library = fixture.spells as unknown as SpellInfo[];
const stats = {
  "Brakka Stonehew": [{ STR: 17, DEX: 14, CON: 16, INT: 8, WIS: 12, CHA: 10 }, "Barbarian", 35, 15],
  "Lyra Venn": [{ STR: 14, DEX: 10, CON: 14, INT: 10, WIS: 16, CHA: 12 }, "Cleric", 24, 18],
  Vex: [{ STR: 8, DEX: 17, CON: 12, INT: 12, WIS: 13, CHA: 14 }, "Rogue", 21, 14],
  "Orrin Ashby": [{ STR: 8, DEX: 14, CON: 12, INT: 17, WIS: 12, CHA: 10 }, "Wizard", 17, 12],
} as const;
export const party = (level = 3): CharacterForSim[] => Object.entries(stats).map(([name, [scores, cls, hp, ac]]) => ({
  ...(structuredClone((fixture.party as Record<string, object>)[name]) as object),
  id: name, name, ability_scores: scores, class_levels: [{ class: cls, level }], hp_max: hp, hp_current: hp, ac,
} as unknown as CharacterForSim));
export const M = (name: string) => (monsters as unknown as MonsterStats[]).find((m) => m.name === name)!;

export function fight(enemies: [string, number][]) {
  const foes = enemies.flatMap(([n, k]) => Array.from({ length: k }, (_, i) => monsterUnit(M(n), `${n}#${i}`)));
  const pcs = party().map((p) => characterUnit(p, library, foes, true));
  const t0 = performance.now();
  const s = simulate([...pcs, ...foes], 2000, 7);
  return { s, r: rate(s), ms: performance.now() - t0, pcs };
}

it("calibration table", () => {
  const cases: [string, [string, number][]][] = [
    ["1 Goblin Warrior", [["Goblin Warrior", 1]]],
    ["4 Goblin Warriors", [["Goblin Warrior", 4]]],
    ["Session 3: Ogre + 2 Goblins", [["Ogre", 1], ["Goblin Warrior", 2]]],
    ["Owlbear", [["Owlbear", 1]]],
    ["2 Ogres", [["Ogre", 2]]],
    ["Bandit Captain + 4 Bandits", [["Bandit Captain", 1], ["Bandit", 4]]],
    ["3 Ogres", [["Ogre", 3]]],
    ["4 Ogres", [["Ogre", 4]]],
    ["Troll", [["Troll", 1]]],
    ["2 Trolls", [["Troll", 2]]],
    ["Young Red Dragon", [["Young Red Dragon", 1]]],
  ];
  for (const [label, e] of cases) {
    const { s, r, ms } = fight(e);
    console.log(
      `${label.padEnd(28)} ${r.tier.padEnd(7)} win ${(s.pWin * 100).toFixed(0).padStart(3)}%  down ${(s.pAnyDown * 100).toFixed(0).padStart(3)}%  death ${(s.pDeath * 100).toFixed(1).padStart(5)}%  halfDead ${(s.pHalfDead * 100).toFixed(1).padStart(5)}%  hpLost ${(s.avgHpLost * 100).toFixed(0).padStart(3)}%  rounds ${s.avgRounds.toFixed(1)}  ${ms.toFixed(0)}ms`
    );
  }
  const { pcs } = fight([["Ogre", 1]]);
  for (const p of pcs) console.log(p.name, "plans:", p.plans.map((x) => `${x.name} [${JSON.stringify(x.cost)}] ~${x.expected.toFixed(1)}`).join(" | "), "heals:", p.heals.map((h) => h.name).join(", "));
});
