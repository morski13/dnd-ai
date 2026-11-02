import { describe, expect, it } from "vitest";
import { builderData } from "../builder/data";
import { rulesData } from "../levelup/data";
import { rulesReport } from "./rules-report";
import { emptySheet, type ImportedSheet } from "./types";

const kazar = (): ImportedSheet => ({
  ...emptySheet("form"), name: "Kazar", species: "Leonin", background: "Outlander",
  classes: [{ class: "Barbarian", subclass: "Path of the Wild Soul", level: 9 }, { class: "Fighter", subclass: "", level: 1 }],
  unknownClasses: ["Blood Hunter 2"],
  scores: { STR: 19, DEX: 15, CON: 20, INT: 9, WIS: 11, CHA: 12 },
  features: [{ name: "Rage", description: "" }, { name: "Brutal Critical (1 die)", description: "" }],
});
const report = (s: ImportedSheet, rules: "2014" | "2024" = "2024", unknownSpells: string[] = [], unknownItems: string[] = []) =>
  rulesReport(s, { rules, data: rulesData(rules), other: rulesData(rules === "2024" ? "2014" : "2024"), builder: builderData(rules), unknownSpells, unknownItems });

describe("not in the rules", () => {
  it("Kazar in a 2024 game: class, subclass, species, background and a 2014 feature", () => {
    const r = report(kazar(), "2024", ["Hex Blade"], ["Bag of Claws"]);
    const by = Object.fromEntries(r.map((x) => [x.kind, x]));
    expect(by.class.title).toBe("Blood Hunter 2 (class)");
    expect(by.subclass.title).toBe("Path of the Wild Soul (Barbarian subclass)");
    expect(by.subclass.what).toMatch(/Wild Soul preset/);
    expect(by.species.title).toBe("Leonin (species)");
    expect(by.background.what).toMatch(/Acolyte, Criminal, Sage, Soldier/);
    expect(by.spells.title).toBe("1 spell: Hex Blade");
    expect(by.items.title).toBe("1 item: Bag of Claws");
    expect(by.edition.title).toBe("Brutal Critical (2014 rules)");
    expect(by.multiclass).toBeUndefined(); // STR 19 for Barbarian and Fighter
  });

  it("known things aren't reported; multiclass needs are", () => {
    const s: ImportedSheet = {
      ...emptySheet("form"), species: "Hill Dwarf", background: "Acolyte",
      classes: [{ class: "Barbarian", subclass: "Path of the Berserker", level: 3 }, { class: "Wizard", subclass: "", level: 1 }],
      scores: { STR: 15, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 8 },
      features: [{ name: "Rage", description: "" }],
    };
    const r = report(s, "2014");
    expect(r.map((x) => x.kind)).toEqual(["multiclass"]);
    expect(r[0].what).toMatch(/Wizard needs INT 13; your sheet has INT 10/);
  });
});
