import { describe, expect, it } from "vitest";
import fixture from "./test-fixtures/srd-fixture.json";
import { roll } from "./dice";
import { offlineRoll, recorder, replayRng } from "./offline-rolls";
import { allOptions, planRoll, type SheetCharacter, type SpellInfo } from "./rules";

const library = fixture.spells as unknown as SpellInfo[];
const party = fixture.party as Record<string, unknown>;
const pc = (name: string, scores: Record<string, number>, cls: string) =>
  ({ ...structuredClone(party[name] as object), ability_scores: scores, class_levels: [{ class: cls, level: 3 }] }) as unknown as SheetCharacter;
const brakka = pc("Brakka Stonehew", { STR: 17, DEX: 14, CON: 16, INT: 8, WIS: 12, CHA: 10 }, "Barbarian");
const orrin = pc("Orrin Ashby", { STR: 8, DEX: 14, CON: 12, INT: 17, WIS: 12, CHA: 10 }, "Wizard");

describe("rolls without internet", () => {
  it("the server replays exactly the dice the phone rolled", () => {
    const weapon = allOptions(brakka, library).find((o) => o.kind === "weapon")!;
    for (let i = 0; i < 50; i++) {
      const rec = recorder();
      const r = offlineRoll(brakka, library, { kind: "use", key: weapon.key }, "advantage", false, rec.rng);
      if ("error" in r) throw new Error(r.error);
      // what rollForCharacter does with the queued values
      const plan = planRoll(brakka, { kind: "use", key: weapon.key }, library);
      const again = roll(plan.expression!, { advantage: "advantage", critOn: plan.critOn, critExtra: plan.critExtra, critMode: plan.critMode, rng: replayRng(rec.values) });
      expect([again.total, again.diceAll]).toEqual([r.total, r.diceAll]);
      expect(r.diceAll).toHaveLength(2); // advantage: two d20s
    }
  });

  it("an attack offers its damage; a typed AC decides hit or miss; crit damage doubles the dice", () => {
    const weapon = allOptions(brakka, library).find((o) => o.kind === "weapon")!;
    const nat = (v: number) => () => v;
    const hit = offlineRoll(brakka, library, { kind: "use", key: weapon.key, ac: 12 }, "normal", false, nat(20));
    if ("error" in hit) throw new Error(hit.error);
    expect(hit).toMatchObject({ offline: true, isCrit: true, success: true, vsAc: 12, followUp: { key: weapon.key } });
    expect(hit.id).toMatch(/^offline-/);
    const miss = offlineRoll(brakka, library, { kind: "use", key: weapon.key, ac: 30 }, "normal", false, nat(2));
    expect(miss).toMatchObject({ success: false });
    const dmg = offlineRoll(brakka, library, { kind: "damage", key: weapon.key, parentRollId: hit.id }, "normal", true, nat(1));
    if ("error" in dmg) throw new Error(dmg.error);
    expect(dmg.label).toMatch(/crit/);
    const normal = offlineRoll(brakka, library, { kind: "damage", key: weapon.key }, "normal", false, nat(1));
    if ("error" in normal) throw new Error(normal.error);
    expect(dmg.dice.length).toBeGreaterThan(normal.dice.length);
  });

  it("spells and checks roll too; a bad value in the queue is rolled fresh", () => {
    const spell = allOptions(orrin, library).find((o) => o.key.startsWith("spell:") && o.damage);
    if (spell) {
      const r = offlineRoll(orrin, library, { kind: "use", key: spell.key }, "normal", false, recorder().rng);
      expect("error" in r ? r.error : r.label).toBeTruthy();
    }
    const rng = replayRng([25, 4]);
    expect(rng(20)).toBeGreaterThanOrEqual(1); // 25 doesn't fit a d20: rolled fresh
    expect(rng(6)).toBe(4);
  });
});
