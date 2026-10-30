// Content from other books (book_content table) added on top of the SRD rules data.
// Pure functions: the server loads the rows (lib/books/server.ts) and the builder / level-up get the merged data.
import type { BackgroundData, BuilderData, SpeciesData, SpeciesSub } from "../builder/types";
import type { DataChoice, RulesData, SubclassData } from "../levelup/types";

export type BookKind = "subclass" | "species" | "background" | "feat";
export type BookRow = { kind: BookKind; rules: "2014" | "2024"; parent: string; name: string; book: string; data: unknown };
/** A book spell's class lists (2014 rules keep their own spell → classes map). */
export type BookSpell = { name: string; classes: string[] };

/** Species rows: a whole new species, or only new subspecies for a species that's already there (data.subsOnly). */
export type BookSpecies = SpeciesData & { subsOnly?: boolean; book?: string };
export type BookFeat = { name: string; category: string | null; prereq: string | null; text: string };

const byRules = (rows: BookRow[], rules: string, kind: BookKind) => rows.filter((r) => r.rules === rules && r.kind === kind);
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Level-up data plus the books' subclasses and feats (and 2014 spell lists). Doesn't change `base`. */
export function mergeRules(base: RulesData, rows: BookRow[], spells: BookSpell[] = []): RulesData {
  const subs = byRules(rows, base.rules, "subclass");
  const feats = byRules(rows, base.rules, "feat");
  if (!subs.length && !feats.length && !(base.rules === "2014" && spells.length)) return base;

  const classes = { ...base.classes };
  for (const r of subs) {
    const cls = Object.keys(classes).find((k) => same(k, r.parent));
    if (!cls) continue; // the checker only lets known classes through; skip anything odd
    const s = r.data as SubclassData;
    if (classes[cls].subclasses.some((x) => same(x.name, s.name))) continue; // the SRD (or an earlier book) wins
    classes[cls] = { ...classes[cls], subclasses: [...classes[cls].subclasses, { ...s, levels: s.levels ?? {}, choices: s.choices ?? {} }] };
  }
  const known = new Set(base.feats.map((f) => f.name.toLowerCase()));
  const extraFeats = feats.map((r) => r.data as BookFeat).filter((f) => !known.has(f.name.toLowerCase()));

  let spellMap = base.spells;
  if (base.rules === "2014" && spells.length) {
    spellMap = { ...(base.spells ?? {}) };
    for (const s of spells) if (!spellMap[s.name]) spellMap[s.name] = s.classes;
  }
  return { ...base, classes, feats: [...base.feats, ...extraFeats], spells: spellMap };
}

/** Builder data plus the books' species, subspecies and backgrounds. Doesn't change `base`. */
export function mergeBuilder(base: BuilderData, rows: BookRow[]): BuilderData {
  const species = byRules(rows, base.rules, "species");
  const bgs = byRules(rows, base.rules, "background");
  if (!species.length && !bgs.length) return base;

  const list: SpeciesData[] = base.species.map((s) => ({ ...s }));
  for (const r of species) {
    const s = r.data as BookSpecies;
    const there = list.find((x) => same(x.name, s.name));
    if (there) {
      // new subspecies for a species that's already there (a new elf lineage…)
      const add = (s.subs ?? []).filter((n: SpeciesSub) => !there.subs.some((o) => same(o.name, n.name)));
      if (add.length) there.subs = [...there.subs, ...add];
      continue;
    }
    if (s.subsOnly) continue; // its species isn't in this rule set
    const { subsOnly: _drop, ...rest } = s; // eslint-disable-line @typescript-eslint/no-unused-vars
    list.push(rest);
  }
  const backgrounds: BackgroundData[] = [...base.backgrounds];
  for (const r of bgs) {
    const b = r.data as BackgroundData;
    if (!backgrounds.some((x) => same(x.name, b.name))) backgrounds.push(b);
  }
  return {
    ...base,
    species: list.sort((a, b) => a.name.localeCompare(b.name)),
    backgrounds: backgrounds.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Choices a subclass gives at a level, in the shape the level-up engine uses. */
export function choiceRows(list: { level: number; title: string; choose: number; options: DataChoice["options"] }[], sub: string): Record<string, DataChoice[]> {
  const out: Record<string, DataChoice[]> = {};
  list.forEach((c, i) => {
    const key = `${sub}-${c.level}-${i}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    (out[String(c.level)] ??= []).push({ key, kind: "pick", title: c.title, choose: c.choose, options: c.options });
  });
  return out;
}
