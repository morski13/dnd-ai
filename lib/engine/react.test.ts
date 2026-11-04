import { describe, expect, it } from "vitest";
import { monsterReactions, whoCanReact, type Reactor } from "./react";
import { cleanEffects, effectAc } from "./effects";

const r = (id: string, side: "party" | "enemy", o: Partial<Reactor> = {}): Reactor => ({ combatantId: id, name: id, side, canReact: true, spells: [], features: [], melee: null, ...o });
const noMap = () => null;

describe("who can react", () => {
  const wizard = r("orrin", "party", { spells: [{ name: "Shield", key: "spell:Shield" }, { name: "Counterspell", key: "spell:Counterspell" }] });
  const bard = r("lyra", "party", { spells: [{ name: "Silvery Barbs", key: "spell:Silvery Barbs" }] });
  const rogue = r("vex", "party", { features: ["Uncanny Dodge"], melee: { key: "atk:Dagger", name: "Dagger" } });
  const ogre = r("ogre", "enemy", { melee: { key: "Greatclub", name: "Greatclub" } });
  const all = [wizard, bard, rogue, ogre];
  it("an attack hits the wizard: Shield (would miss), Silvery Barbs from a friend", () => {
    const e = whoCanReact({ kind: "attack", attackerId: "ogre", attackerName: "Ogre", targetId: "orrin", total: 15, hit: true, ac: 12, melee: true }, all, noMap);
    expect(e.find((x) => x.combatantId === "orrin")!.options[0]).toMatchObject({ id: "shield", effect: "shield" });
    expect(e.find((x) => x.combatantId === "orrin")!.options[0].why).toMatch(/would miss/);
    expect(e.find((x) => x.combatantId === "lyra")!.options[0].id).toBe("silvery-barbs");
    expect(e.find((x) => x.combatantId === "ogre")).toBeUndefined();
  });
  it("a miss: nobody; a used reaction: nobody", () => {
    expect(whoCanReact({ kind: "attack", attackerId: "ogre", attackerName: "Ogre", targetId: "orrin", total: 5, hit: false, ac: 12, melee: true }, all, noMap)).toEqual([]);
    expect(whoCanReact({ kind: "attack", attackerId: "ogre", attackerName: "Ogre", targetId: "vex", total: 15, hit: true, ac: 14, melee: true }, [{ ...rogue, canReact: false }], noMap)).toEqual([]);
  });
  it("Uncanny Dodge halves; Counterspell against an enemy spell within 60 ft", () => {
    expect(whoCanReact({ kind: "attack", attackerId: "ogre", attackerName: "Ogre", targetId: "vex", total: 18, hit: true, ac: 14, melee: true }, all, noMap)[0].options[0]).toMatchObject({ effect: "halve" });
    const far = (a: string, b: string) => (a === "orrin" && b === "ogre" ? 90 : 10);
    expect(whoCanReact({ kind: "spell", casterId: "ogre", casterName: "Ogre", spell: "Fireball" }, all, far)).toEqual([]);
    expect(whoCanReact({ kind: "spell", casterId: "ogre", casterName: "Ogre", spell: "Fireball" }, all, noMap)[0].options[0].id).toBe("counterspell");
  });
  it("leaving reach: Opportunity Attack with the melee weapon", () => {
    const e = whoCanReact({ kind: "leave", moverId: "vex", moverName: "Vex", threatIds: ["ogre"] }, all, noMap);
    expect(e[0]).toMatchObject({ combatantId: "ogre", options: [{ id: "oa:Greatclub", key: "Greatclub" }] });
  });
  it("monster reactions and effects", () => {
    expect(monsterReactions({ sections: { Reactions: ["Parry. The knight adds 2 to its AC against one melee attack."] } })).toEqual(["Parry"]);
    expect(effectAc(cleanEffects([{ id: "a", name: "Shield", conditions: [], ac: 5 }]))).toBe(5);
  });
});
