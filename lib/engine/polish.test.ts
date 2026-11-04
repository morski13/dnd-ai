import { describe, expect, test } from "vitest";
import { readActions, saveConditions } from "../books/monster-text";
import { featuresOf, legendaryList } from "./monster";
import { castDamageNow, spellRule, zoneRuleFor } from "./spells";
import { makeEffect, tick } from "./effects";

const ghoul = [
  "Multiattack. The ghoul makes two Bite attacks.",
  "Bite. Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Piercing damage plus 3 (1d6) Necrotic damage.",
  "Claw. Melee Attack Roll: +4, reach 5 ft. Hit: 4 (1d4 + 2) Slashing damage. If the target is a creature that isn’t an Undead or elf, it is subjected to the following effect. Constitution Saving Throw: DC 10. Failure: The target has the Paralyzed condition until the end of its next turn.",
];

describe("monster text", () => {
  test("hit riders: Ghoul Claw paralyzes on a failed CON save", () => {
    const claw = readActions(ghoul.join("\n")).actions.find((a) => a.name === "Claw")!;
    expect(claw.rider).toMatchObject({ conditions: ["Paralyzed"], lasts: "next_turn", save: { ability: "CON", dc: 10 } });
  });
  test("riders without a save: Wolf knocks prone", () => {
    const bite = readActions("Bite. Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Piercing damage. If the target is a Medium or smaller creature, it has the Prone condition.").actions[0];
    expect(bite.rider).toMatchObject({ conditions: ["Prone"], lasts: "removed" });
    expect(bite.rider?.save).toBeUndefined();
  });
  test("saves that only give a condition, and whose turn it lasts to", () => {
    const glare = readActions("Dreadful Glare. Wisdom Saving Throw: DC 11, one creature the mummy can see within 60 feet. Failure: The target has the Frightened condition until the end of the mummy’s next turn.").actions[0];
    expect(glare).toMatchObject({ kind: "save", dc: 11, save_ability: "WIS", conditions: ["Frightened"], lasts: "my_next_turn" });
    expect(glare.damage).toBeUndefined();
    expect(saveConditions("must succeed on a DC 15 Wisdom saving throw or be frightened for 1 minute. A creature can repeat the saving throw at the end of each of its turns")).toEqual({ conditions: ["Frightened"], lasts: "save_ends" });
    expect(saveConditions("taking 10 fire damage")).toBeNull();
  });
  test("old stat blocks get the riders from their text", () => {
    const f = featuresOf({ actions: [{ name: "Claw", kind: "attack", bonus: 4, damage: "1d4+2" }], sections: { Actions: ghoul } });
    expect(f.attacks[0].rider?.conditions).toEqual(["Paralyzed"]);
  });
  test("legendary actions from the text", () => {
    const list = legendaryList([
      "Legendary Action Uses: 3 (4 in Lair). Immediately after another creature’s turn, the dragon can expend a use.",
      "Commanding Presence. The dragon uses Spellcasting to cast Command (level 2 version).",
      "Pounce. The dragon moves up to half its Speed, and it makes one Rend attack.",
      "Wing Attack (Costs 2 Actions). The dragon beats its wings.",
    ], [{ name: "Rend", kind: "attack", bonus: 14, damage: "1d10+8" }]);
    expect(list.map((l) => [l.name, l.cost, l.attack])).toEqual([["Commanding Presence", 1, null], ["Pounce", 1, "Rend"], ["Wing Attack", 2, null]]);
  });
});

describe("2014 and 2024 spell areas", () => {
  test("Moonbeam: 2024 hurts on cast and at turn end; 2014 later, on enter and turn start", () => {
    const r = spellRule({ name: "Moonbeam", description: "", duration: "", roll: null } as Parameters<typeof spellRule>[0])!.zone!;
    expect(zoneRuleFor("Moonbeam", r, "2024").when).toEqual(["enter", "end"]);
    expect(zoneRuleFor("Moonbeam", r, "2014").when).toEqual(["enter", "start"]);
    expect(castDamageNow("Moonbeam", "2024")).toBe(true);
    expect(castDamageNow("Moonbeam", "2014")).toBe(false);
    expect(castDamageNow("Fireball", "2014")).toBe(true);
  });
});

describe("until the end of my next turn", () => {
  test("put on during my own turn: lasts through my next one (Guiding Bolt)", () => {
    const e = makeEffect({ id: "e", name: "Guiding Bolt", conditions: ["Outlined"], source: { combatantId: "me", name: "Cleric" }, duration: "end_of_next_turn", turnsOf: "me", target: "orc" });
    const afterThisTurn = tick([e], "orc", { kind: "end", combatantId: "me" });
    expect(afterThisTurn.kept.length).toBe(1);
    expect(tick(afterThisTurn.kept, "orc", { kind: "end", combatantId: "me" }).kept.length).toBe(0);
  });
  test("until the end of ITS next turn (Ghoul Claw): one turn of the target", () => {
    const e = makeEffect({ id: "e", name: "Claw", conditions: ["Paralyzed"], source: { combatantId: "ghoul", name: "Ghoul" }, duration: "end_of_next_turn", turnsOf: "ana", target: "ana" });
    expect(tick([e], "ana", { kind: "end", combatantId: "ana" }).kept.length).toBe(0);
  });
});
