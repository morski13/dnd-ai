import { describe, expect, it } from "vitest";
import { cleanCustomAction } from "../homebrew";
import { allOptions, optionButtonLabel, planRoll, rowKey, tableRow, type SheetCharacter } from "../rules";
import { wildSoulPreset, wildSurgeTable } from "./wild-soul";

const kazar = (attacks: SheetCharacter["attacks"] = []): SheetCharacter => ({
  ability_scores: { STR: 19, DEX: 15, CON: 20, INT: 9, WIS: 11, CHA: 12 },
  class_levels: [{ class: "Barbarian", subclass: "Path of the Wild Soul", level: 10 }, { class: "Fighter", subclass: "Champion", level: 3 }],
  proficiencies: {}, spells: { ability: "STR" }, attacks, rule_set: "2014",
});

describe("Path of the Wild Soul preset", () => {
  const p = wildSoulPreset(10, 5, false);
  const resources = ["Rage", ...p.uses.map((u) => u.name)];
  const clean = p.actions.map((a) => cleanCustomAction(a, resources));

  it("has what a level 10 Wild Soul gets, and passes the editor's checks", () => {
    expect(p.actions.map((a) => a.name)).toEqual(["Rage", "Wild Surge", "Lingering Magic", "Magic Reserves", "Arcane Rebuke"]);
    expect(p.uses).toEqual([{ name: "Lingering Magic", max: 5, recharge: "long rest" }, { name: "Magic Reserves", max: 10, recharge: "long rest" }]);
    for (const a of clean) expect(a).not.toHaveProperty("error");
    expect(wildSoulPreset(14, 5, true).actions.map((a) => a.name)).toContain("Chaotic Fury");
    expect(wildSoulPreset(14, 5, true).actions.find((a) => a.name === "Magic Reserves")!.damage).toBe("1d6");
    expect(wildSoulPreset(10, 5, true).actions.map((a) => a.name)).not.toContain("Rage");
  });

  it("Wild Surge: a d8 table rolled when Rage is spent, rows are hidden options with CON save DCs", () => {
    const c = kazar(clean as SheetCharacter["attacks"]);
    const all = allOptions(c, []);
    const surge = all.find((o) => o.key === "atk:Wild Surge")!;
    expect(surge.trigger_on).toBe("Rage");
    expect(planRoll(c, { kind: "use", key: surge.key })).toMatchObject({ rollType: "other", expression: "1d8" });
    for (let n = 1; n <= 8; n++) expect(tableRow(surge, n)).not.toBeNull();
    expect(tableRow(surge, 3)!.name).toBe("Spirit bombs");
    const bombs = all.find((o) => o.key === rowKey("Wild Surge", 3))!;
    expect(bombs.row_of).toBe("Wild Surge");
    // DC 8 + proficiency (+5 at level 13) + CON (+5)
    expect(planRoll(c, { kind: "use", key: bombs.key })).toMatchObject({ rollType: "save_dc", dc: 18, ability: "DEX", followUp: true });
    expect(optionButtonLabel(c, bombs)).toBe("DC 18");
    const burst = all.find((o) => o.key === rowKey("Wild Surge", 1))!;
    expect(burst).toMatchObject({ kind: "damage_only", many: true, then: { temp_hp: "dealt" } });
    // "Read their plans": a save with nothing to roll after it
    expect(planRoll(c, { kind: "use", key: rowKey("Wild Surge", 6) })).toMatchObject({ rollType: "save_dc", followUp: false });
  });

  it("Magic Reserves spends what it rolls and hurts you 5×", () => {
    const mr = clean.find((a) => "name" in a && a.name === "Magic Reserves")!;
    expect(mr).toMatchObject({ kind: "roll", damage: "1d4", spend_rolled: true, resource: "Magic Reserves", then: { self_damage_x: 5, self_damage_type: "force" } });
  });

  it("the editor refuses a table that misses or repeats a number", () => {
    const rows = wildSurgeTable();
    expect(cleanCustomAction({ name: "T", kind: "table", damage: "1d8", table: rows.slice(0, 7) }, [])).toEqual({ error: "No row for a roll of 8." });
    expect(cleanCustomAction({ name: "T", kind: "table", damage: "1d8", table: [...rows, { min: 8, max: 8, name: "Again" }] }, [])).toEqual({ error: "The number 8 is on more than one row." });
    expect(cleanCustomAction({ name: "T", kind: "damage_only", damage: "1d6", trigger_on: "Ki" }, ["Rage"])).not.toHaveProperty("trigger_on");
  });
});
