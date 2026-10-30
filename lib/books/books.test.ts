// Book template: the checker, the SQL, merging into the builder / level-up data, and the Excel round trip.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXAMPLE } from "../../tools/books/example";
import { readWorkbook, writeTemplate } from "../../tools/books/xlsx";
import { builderData } from "../builder/data";
import { givesFor, needsFor } from "../builder/special";
import { rulesData } from "../levelup/data";
import { checkBook, report, type Workbook } from "./check";
import { mergeBuilder, mergeRules } from "./merge";
import { readActions } from "./monster-text";
import { bookSql } from "./sql";
import { loadSrdIndex } from "./srd-index";

const srd = loadSrdIndex();
const errors = (wb: Workbook) => checkBook(wb, srd).issues.filter((i) => i.level === "error").map((i) => `${i.tab}:${i.row ?? ""} ${i.msg}`);
/** The example with one tab's first row changed. */
const withRow = (tab: string, cells: Record<string, string>): Workbook => ({
  ...EXAMPLE, tabs: { ...EXAMPLE.tabs, [tab]: [{ row: 3, cells: { ...EXAMPLE.tabs[tab][0].cells, ...cells } }, ...EXAMPLE.tabs[tab].slice(1)] },
});

describe("checking a book", () => {
  it("the example book has no errors and reads every tab", () => {
    const r = checkBook(EXAMPLE, srd);
    expect(errors(EXAMPLE)).toEqual([]);
    expect(r.spells.map((s) => s.name)).toEqual(["Ember Lance", "Tidal Crash", "Mending Light", "Gull's Warning"]);
    expect(r.items).toHaveLength(5); // the dagger is for both rule sets
    expect(r.monsters.map((m) => m.name)).toEqual(["Bog Lurker", "Reef Drake", "Gloom Sprite"]);
    expect(r.content.map((c) => `${c.kind}:${c.rules}:${c.name}`).sort()).toEqual([
      "background:2024:Dockhand", "feat:2024:Harbor Born", "feat:2024:Tidecaller", "species:2024:Elf (subspecies)", "species:2024:Mirefolk",
      "subclass:2014:Lantern Domain", "subclass:2024:Tide Warden",
    ]);
    expect(report(r)).toContain("Nema grešaka");
  });

  it("guesses spell rolls from the text and says so", () => {
    const r = checkBook(EXAMPLE, srd);
    const lance = r.spells.find((s) => s.name === "Ember Lance")!;
    expect(lance.roll).toEqual({ kind: "spell_attack", damage: "3d8", damage_type: "fire", per_level: "1d8" });
    expect(lance.action).toBe("action");
    const crash = r.spells.find((s) => s.name === "Tidal Crash")!;
    expect(crash.roll).toMatchObject({ kind: "save", damage: "6d6", save_ability: "STR", half_on_save: true });
    expect(r.spells.find((s) => s.name === "Mending Light")!.roll).toEqual({ kind: "heal", damage: "1d8", per_level: "1d8", add_mod: true });
    expect(r.spells.find((s) => s.name === "Gull's Warning")!).toMatchObject({ roll: null, concentration: true });
    expect(r.issues.filter((i) => i.level === "guess").map((i) => i.name)).toContain("Ember Lance");
  });

  it("monsters: attacks from 2014 and 2024 text, the attack tab, XP and saves", () => {
    const r = checkBook(EXAMPLE, srd);
    const lurker = r.monsters.find((m) => m.name === "Bog Lurker")!;
    expect(lurker).toMatchObject({ cr: "2", xp: 450, ac: 13, hp: 45, init: 2 });
    const d = lurker.data as { actions: { name: string; damage?: string }[]; multiattack: unknown; abilities: Record<string, { mod: number; save: number }> };
    expect(d.actions.map((a) => `${a.name} ${a.damage ?? ""}`.trim())).toEqual(["Multiattack", "Bite 2d6+3", "Claw 1d8+3+1d6"]);
    expect(d.multiattack).toEqual({ count: 2, uses: ["Bite", "Claw"] });
    expect(d.abilities.DEX).toEqual({ mod: 2, save: 4 });
    const drake = r.monsters.find((m) => m.name === "Reef Drake")!.data as { actions: Record<string, unknown>[] };
    expect(drake.actions.find((a) => a.kind === "save")).toMatchObject({ name: "Brine Breath (Recharge 5-6)", save_ability: "CON", dc: 14, damage: "7d8", half: true, recharge: 5 });
    const sprite = r.monsters.find((m) => m.name === "Gloom Sprite")!;
    expect(sprite.xp).toBe(50);
    expect((sprite.data as { actions: unknown[] }).actions).toEqual([{ name: "Shadow Dart", kind: "attack", bonus: 6, damage: "1d4+4", damage_type: "necrotic", ranged: true }]);
  });

  it("reads the multiattack forms books use", () => {
    expect(readActions("Multiattack. The beast makes two Javelin or Morningstar attacks.\nJavelin. Melee or Ranged Attack Roll: +5, reach 5 ft. Hit: 10 (3d6) Piercing damage.").multiattack).toEqual({ count: 2, uses: ["Javelin"] });
    expect(readActions("Multiattack. It makes one Claws attack and one Tail attack, or it makes two Hurl Flame attacks.\nClaws. Melee Attack Roll: +6, reach 5 ft. Hit: 10 (2d6 + 3) Piercing damage.\nTail. Melee Attack Roll: +6, reach 10 ft. Hit: 14 (2d10 + 3) Piercing damage.").multiattack?.count).toBe(2);
    const r = readActions("Sting. Melee Weapon Attack: +2 to hit, reach 5 ft. Hit: 1 piercing damage, and the target takes 3 (1d6) poison damage.");
    expect(r.actions[0]).toMatchObject({ bonus: 2, damage: "1" });
  });

  it("catches mistakes, row by row", () => {
    expect(errors(withRow("Spells", { level: "third" }))).toEqual(['Spells:3 "Level" mora biti ceo broj od 0 do 9 (sada: "third").']);
    expect(errors(withRow("Spells", { name: "Fireball" }))[0]).toMatch(/Fireball" već postoji u SRD-u/);
    expect(errors(withRow("Monsters", { cr: "33" }))[0]).toMatch(/CR/);
    expect(errors(withRow("Items", { damage: "2x6" }))[0]).toMatch(/nije ispravno bacanje/);
    expect(errors(withRow("Subclass Features", { subclass: "Tide Keeper" }))[0]).toMatch(/"Tide Keeper" \(Fighter, 2024\) ne postoji na tabu Subclasses/);
    expect(errors(withRow("Subclasses", { subclass: "Champion" }))[0]).toMatch(/već ima subklasu "Champion"/);
    expect(errors(withRow("Backgrounds", { feat: "Lucky Charm" }))[0]).toMatch(/Origin feat "Lucky Charm" ne postoji/);
    expect(errors(withRow("Species", { name: "Dwarf" }))[0]).toMatch(/Rasa "Dwarf" već postoji/);
    expect(errors(withRow("Spells", { school: "Pyromancy" }))[0]).toMatch(/"School": "Pyromancy" nije dozvoljeno/);
    expect(errors({ ...EXAMPLE, book: { book: "", code: "x", rules: "2025" } })).toHaveLength(3);
  });

  it("writes SQL that replaces only this book", () => {
    const sql = bookSql(checkBook(EXAMPLE, srd), "2026-10-30");
    expect(sql).toContain("delete from public.srd_spells   where book = 'Tiny Hut Homebrew';");
    expect(sql).toContain("$book$[{");
    expect(sql).toMatch(/^begin;$/m);
    expect(sql).toMatch(/^commit;$/m);
    expect(sql).toContain("Run supabase/26-books.sql first");
  });
});

describe("merging books into the app's data", () => {
  const r = checkBook(EXAMPLE, srd);
  it("level-up: the subclass with its features and choices, and the feats", () => {
    const d = mergeRules(rulesData("2024"), r.content);
    const tide = d.classes.Fighter.subclasses.find((s) => s.name === "Tide Warden")!;
    expect(Object.keys(tide.levels)).toEqual(["3", "7"]);
    expect(tide.choices["3"][0]).toMatchObject({ kind: "pick", title: "Tide Techniques", choose: 2 });
    expect(d.feats.map((f) => f.name)).toContain("Tidecaller");
    expect(rulesData("2024").classes.Fighter.subclasses.some((s) => s.name === "Tide Warden")).toBe(false); // the original isn't changed
    expect(mergeRules(rulesData("2014"), r.content).classes.Cleric.subclasses.map((s) => s.name)).toContain("Lantern Domain");
  });
  it("2014 spell lists get the book's spells", () => {
    const d = mergeRules(rulesData("2014"), [], [{ name: "Ember Lance", classes: ["Wizard"] }]);
    expect(d.spells?.["Ember Lance"]).toEqual(["Wizard"]);
  });
  it("builder: a new species, a new lineage for Elf, a background", () => {
    const b = mergeBuilder(builderData("2024"), r.content);
    const mire = b.species.find((s) => s.name === "Mirefolk")!;
    expect(mire.subs.map((s) => s.name)).toEqual(["Reedborn", "Deepborn"]);
    expect(b.species.find((s) => s.name === "Elf")!.subs.map((s) => s.name)).toContain("Sea Elf");
    expect(builderData("2024").species.find((s) => s.name === "Elf")!.subs.map((s) => s.name)).not.toContain("Sea Elf");
    expect(b.backgrounds.find((x) => x.name === "Dockhand")).toMatchObject({ abilities: ["STR", "CON", "WIS"], feat: { name: "Harbor Born" } });
    const reed = mire.subs[0];
    expect(givesFor("2024", mire, reed)).toMatchObject({ skills: ["Survival"], cantrips: ["Gull's Warning"], speed: 35 });
    expect(needsFor("2024", mire, reed).sub).toBe("Subrace");
    const kit = b.backgrounds.find((x) => x.name === "Dockhand")!.equipment[0].options[0];
    expect(kit.gp).toBe(12);
    expect(kit.items.find((i) => i.name === "Dagger")).toMatchObject({ qty: 2, ref: "srd:2024:dagger", w: { damage: "1d4" } });
  });
});

describe("the Excel file", () => {
  it("writing the example and reading it back gives the same book", async () => {
    const dir = mkdtempSync(join(tmpdir(), "book-"));
    await writeTemplate(join(dir, "ex.xlsx"), EXAMPLE);
    const back = await readWorkbook(join(dir, "ex.xlsx"));
    expect(back.problems).toEqual([]);
    expect(back.book).toEqual(EXAMPLE.book);
    const a = checkBook(EXAMPLE, srd), b = checkBook(back, srd);
    expect(JSON.stringify([b.spells, b.items, b.monsters, b.content])).toBe(JSON.stringify([a.spells, a.items, a.monsters, a.content]));
    await writeTemplate(join(dir, "empty.xlsx"));
    const empty = await readWorkbook(join(dir, "empty.xlsx"));
    expect(checkBook(empty, srd).issues.filter((i) => i.level === "error").length).toBeGreaterThan(0); // no book name yet
  });
});
