import { describe, expect, it } from "vitest";
import fixture from "../test-fixtures/srd-fixture.json";
import monsters from "../test-fixtures/monsters-fixture.json";
import type { SpellInfo } from "../rules";
import type { MonsterStats } from "./build";
import { party } from "./calibrate.test";
import { fairer, odds, type LiveFoe } from "./live";

const library = fixture.spells as unknown as SpellInfo[];
const M = (name: string) => (monsters as unknown as MonsterStats[]).find((m) => m.name === name)!;
const foe = (name: string, i: number, hp?: number): LiveFoe => ({ key: `${name}#${i}`, monsterId: `${name}${i}`, name, stats: M(name), hp: hp ?? M(name).hp });

describe("live fight odds", () => {
  it("hurt monsters make it easier; a hard fight offers changes that help", () => {
    const pcs = party();
    const input = { characters: pcs, library, foes: [foe("Ogre", 0), foe("Ogre", 1), foe("Ogre", 2)], extra: [] };
    const now = odds(input)!;
    const hurt = odds({ ...input, foes: input.foes.map((f) => ({ ...f, hp: 5 })) })!;
    expect(hurt.pWin).toBeGreaterThan(now.pWin);
    const t0 = performance.now();
    const options = fairer(input, now);
    expect(performance.now() - t0).toBeLessThan(3000);
    if (now.pWin < 0.7) {
      expect(options.length).toBeGreaterThan(0);
      expect(options[0].odds.pWin).toBeGreaterThanOrEqual(now.pWin);
    }
  });
  it("an easy fight offers adding a monster from the saved fight", () => {
    const input = { characters: party(), library, foes: [foe("Ogre", 0, 3)], extra: [{ name: "Ogre", stats: M("Ogre") }] };
    const now = odds(input)!;
    expect(now.pWin).toBeGreaterThan(0.8);
    expect(fairer(input, now)[0]).toMatchObject({ change: { kind: "add", name: "Ogre" } });
  });
});
