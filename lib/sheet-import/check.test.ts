import { describe, expect, it } from "vitest";
import { appAc, appHp, appSpeed, checkNumbers, type CheckInput } from "./check";

const base = (patch: Partial<CheckInput> = {}): CheckInput => ({
  rules: "2024", species: "Human",
  classes: [{ class: "Fighter", level: 1 }],
  scores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
  equipment: [], features: [],
  sheet: { hp: null, ac: null, speed: null, prof: null },
  ...patch,
});

describe("check your numbers", () => {
  it("HP: average hit dice + CON, Tough, Dwarf", () => {
    expect(appHp(base()).value).toBe(12);
    expect(appHp(base({ classes: [{ class: "Fighter", level: 3 }] })).value).toBe(12 + 2 * 8);
    expect(appHp(base({ classes: [{ class: "Fighter", level: 3 }], features: ["Tough"] })).value).toBe(28 + 6);
    expect(appHp(base({ species: "Dwarf", classes: [{ class: "Fighter", level: 2 }] })).value).toBe(20 + 2);
  });

  it("AC: best of armor, unarmored defense, shield; half plate isn't plate", () => {
    expect(appAc(base()).value).toBe(12);
    expect(appAc(base({ equipment: ["Chain Mail", "Shield"] })).value).toBe(18);
    expect(appAc(base({ equipment: ["Half Plate"] }))).toMatchObject({ value: 17, how: "Half plate + DEX" });
    expect(appAc(base({ equipment: ["Leather pouch", "Studded Leather Armor +1"] })).value).toBe(12 + 2 + 1);
    // Barbarian 9 / Fighter 1, DEX 15 CON 20: Unarmored Defense 10 + 2 + 5 = 17
    const kazar = base({ classes: [{ class: "Barbarian", level: 9 }, { class: "Fighter", level: 1 }], scores: { STR: 19, DEX: 15, CON: 20, INT: 9, WIS: 11, CHA: 12 } });
    expect(appAc(kazar)).toMatchObject({ value: 17, how: "Unarmored Defense (10 + DEX + CON)" });
    expect(appAc({ ...kazar, equipment: ["Shield +1"] }).value).toBe(20);
    // a shield doesn't add to a Monk's Unarmored Defense (16 without it beats 10 + DEX + shield = 15)
    expect(appAc(base({ classes: [{ class: "Monk", level: 1 }], scores: { STR: 10, DEX: 16, CON: 12, INT: 10, WIS: 16, CHA: 8 }, equipment: ["Shield"] })).value).toBe(16);
  });

  it("Speed: species, Fast Movement, Unarmored Movement; unknown species not checked", () => {
    expect(appSpeed(base({ rules: "2014", species: "Hill Dwarf" }))!.value).toBe(25);
    expect(appSpeed(base({ species: "Elf (Wood Elf)" }))!.value).toBe(35);
    expect(appSpeed(base({ species: "Human", classes: [{ class: "Barbarian", level: 5 }] }))!.value).toBe(40);
    expect(appSpeed(base({ species: "Human", classes: [{ class: "Barbarian", level: 5 }], equipment: ["Plate Armor"] }))!.value).toBe(30);
    expect(appSpeed(base({ classes: [{ class: "Monk", level: 6 }] }))!.value).toBe(45);
    expect(appSpeed(base({ species: "Leonin" }))).toBeNull();
  });

  it("rows say which numbers differ", () => {
    const rows = checkNumbers(base({ sheet: { hp: 12, ac: 15, speed: 30, prof: 3 } }));
    expect(rows.map((r) => [r.key, r.differs])).toEqual([["hp", false], ["ac", true], ["speed", false], ["prof", true]]);
    expect(rows.find((r) => r.key === "ac")!.hint).toMatch(/magic armor/i);
    expect(checkNumbers(base({ species: "Leonin", sheet: { hp: null, ac: null, speed: 35, prof: null } })).find((r) => r.key === "speed")).toMatchObject({ app: null, differs: false });
  });
});
