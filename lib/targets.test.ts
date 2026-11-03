import { describe, expect, it } from "vitest";
import spells from "./test-fixtures/aim-spells.json";
import type { Option, SpellInfo } from "./rules";
import { aimOf, creatureCount, mostHurt } from "./targets";

const lib = spells as unknown as SpellInfo[];
const spell = (name: string, kind: Option["kind"]): Option => {
  const s = lib.find((x) => x.name === name)!;
  return { key: `spell:${name}`, name, kind, fromSpell: s, level: s.level, range: s.range, ability: "spell" } as Option;
};

describe("aimOf", () => {
  it("one creature for Healing Word, Cure Wounds and Heal", () => {
    for (const n of ["Healing Word", "Cure Wounds", "Heal"]) expect(aimOf(spell(n, "heal"))).toEqual({ many: false, max: 1, heal: true });
  });
  it("several for the mass heals", () => {
    expect(aimOf(spell("Mass Healing Word", "heal"))).toEqual({ many: true, max: 6, heal: true });
    expect(aimOf(spell("Prayer of Healing", "heal"))).toEqual({ many: true, max: 5, heal: true });
    expect(aimOf(spell("Mass Cure Wounds", "heal"))?.max).toBe(6);
    expect(aimOf(spell("Mass Heal", "boost"))?.max).toBeNull();
  });
  it("buffs that pick creatures, growing with the slot", () => {
    expect(aimOf(spell("Bless", "boost"))).toEqual({ many: true, max: 3, heal: false });
    expect(aimOf(spell("Bless", "boost"), 3)?.max).toBe(5);
    expect(aimOf(spell("Aid", "boost"))?.max).toBe(3);
    expect(aimOf(spell("Haste", "boost"))).toEqual({ many: false, max: 1, heal: false });
    expect(aimOf(spell("Shield of Faith", "boost"))?.max).toBe(1);
    expect(aimOf(spell("Beacon of Hope", "boost"))).toEqual({ many: true, max: null, heal: false });
    expect(aimOf(spell("Invisibility", "boost"), 4)?.max).toBe(3);
    expect(aimOf(spell("Sanctuary", "boost"))?.max).toBe(1);
    expect(aimOf(spell("Death Ward", "boost"))?.max).toBe(1);
  });
  it("not for enemy spells, self spells or attacks", () => {
    for (const n of ["Bane", "Hideous Laughter", "Slow", "Counterspell"]) expect(aimOf(spell(n, "boost")), n).toBeNull();
    expect(aimOf(spell("Bestow Curse", "save"))).toBeNull();
    expect(aimOf(spell("Shield", "boost"))).toBeNull();
    expect(aimOf(spell("Fireball", "save"))).toBeNull();
    expect(aimOf({ key: "atk:Morningstar", name: "Morningstar", kind: "weapon" } as Option)).toBeNull();
  });
  it("own heals (Lay on Hands) ask; a self heal doesn't", () => {
    expect(aimOf({ key: "atk:Lay on Hands", name: "Lay on Hands", kind: "heal", custom: true } as Option)?.max).toBe(1);
    expect(aimOf({ key: "atk:Second Wind", name: "Second Wind", kind: "heal", range: "Self" } as Option)).toBeNull();
  });
});

describe("creatureCount", () => {
  it("reads numbers in words", () => {
    expect(creatureCount("You bless up to three creatures of your choice")).toEqual({ many: true, max: 3 });
    expect(creatureCount("twelve or fewer creatures you can see")).toEqual({ many: true, max: 12 });
    expect(creatureCount("You touch a willing creature.")).toEqual({ many: false, max: 1 });
    expect(creatureCount("You touch a closed door.")).toBeNull();
  });
});

describe("mostHurt", () => {
  const party = [
    { id: "me", name: "Lyra", hp: 20, max: 20, temp: 0 },
    { id: "o", name: "Orrin", hp: 5, max: 30, temp: 0 },
    { id: "b", name: "Brakka", hp: 30, max: 40, temp: 0 },
  ];
  it("picks the biggest share of HP lost", () => expect(mostHurt(party, "me")).toBe("o"));
  it("picks you when nobody is hurt", () => expect(mostHurt(party.map((p) => ({ ...p, hp: p.max })), "me")).toBe("me"));
});
