import { describe, expect, it } from "vitest";
import { mergeRules } from "./books/merge";
import { rulesData } from "./levelup/data";
import { planLevelUp } from "./levelup/engine";
import { checkFeat, checkSpell, checkSubclass, safeMonster, toBookRows, toSpellInfo, type HomebrewRow, type SpellForm } from "./campaign-homebrew";
import { allOptions, planRoll, type SheetCharacter } from "./rules";

const spell: SpellForm = { name: "Frost Lance", level: 2, school: "Evocation", classes: ["Wizard"], casting_time: "Action", range: "90 feet", duration: "Instantaneous", components: "V, S",
  concentration: false, ritual: false, description: "A lance of ice.", higher_levels: "", roll: { kind: "spell_attack", damage: "4d8", damage_type: "Cold", save_ability: "", half_on_save: false, per_level: "1d8" } };

describe("homebrew in the app", () => {
  it("a homebrew spell rolls on the sheet like any other", () => {
    const ok = checkSpell(spell);
    if ("error" in ok) throw new Error(ok.error);
    const info = toSpellInfo(ok.data);
    const c = { ability_scores: { INT: 16 }, class_levels: [{ class: "Wizard", level: 5 }], proficiencies: {}, spells: { ability: "INT", known: ["Frost Lance"], slots: { 2: 3 } }, attacks: [], resources: [], features: [] } as unknown as SheetCharacter;
    const o = allOptions(c, [info]).find((x) => x.name === "Frost Lance")!;
    expect(o).toBeTruthy();
    expect(planRoll(c, { kind: "use", key: o.key }, [info]).expression).toMatch(/^1d20/);
    expect(checkSpell({ ...spell, roll: { ...spell.roll, damage: "lots" } })).toEqual({ error: "Dice like 3d6 or 2d8+4." });
  });
  it("an approved subclass and feat show up in the level-up", () => {
    const sub = checkSubclass({ cls: "Fighter", name: "Storm Knight", flavor: "", text: "", features: [{ level: 3, name: "Thunder Strike", text: "Add 1d6 thunder." }] }, ["Fighter"]);
    const feat = checkFeat({ name: "Iron Will", category: "General", prereq: "", text: "Advantage on WIS saves." });
    if ("error" in sub || "error" in feat) throw new Error("bad");
    const rows: HomebrewRow[] = [
      { id: "1", kind: "subclass", rules: "2024", parent: "Fighter", name: "Storm Knight", data: sub.data, status: "approved", requested_by: "u", dm_note: null },
      { id: "2", kind: "feat", rules: "2024", parent: "", name: "Iron Will", data: feat.data, status: "approved", requested_by: "u", dm_note: null },
      { id: "3", kind: "feat", rules: "2024", parent: "", name: "Pending One", data: { ...feat.data, name: "Pending One" }, status: "pending", requested_by: "u", dm_note: null },
    ];
    const data = mergeRules(rulesData("2024"), toBookRows(rows));
    const c = { class_levels: [{ class: "Fighter", level: 2 }], ability_scores: { STR: 16 }, proficiencies: {}, features: [], spells: {}, resources: [], hp_max: 20, hp_current: 20 };
    const plan = planLevelUp(c, "Fighter", data, []);
    expect(plan.choices.find((x) => x.kind === "subclass")!.options.map((o) => o.name)).toContain("Storm Knight");
    expect(data.feats.some((f) => f.name === "Iron Will")).toBe(true);
    expect(data.feats.some((f) => f.name === "Pending One")).toBe(false);
  });
  it("a monster's stat block is checked", () => {
    const m = safeMonster({ name: "Mud Golem", ac: 14, hp: 60, init: -1, cr: "4", size_type: "Large construct", multiattack: 2,
      actions: [{ name: "Slam", kind: "attack", bonus: 6, dc: 0, ability: "STR", damage: "2d8+4", damage_type: "Bludgeoning" }] });
    expect(m).toMatchObject({ stats: { name: "Mud Golem", hp: 60, multiattack: { count: 2, uses: ["Slam"] } } });
    expect(safeMonster({ name: "X", ac: 10, hp: 5, init: 0, cr: "", size_type: "", multiattack: 1, actions: [{ name: "Bite", kind: "attack", bonus: 2, dc: 0, ability: "STR", damage: "oops", damage_type: "" }] })).toEqual({ error: "Bite: damage like 2d6+3." });
  });
});
