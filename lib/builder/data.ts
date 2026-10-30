// The builder's rules data for each rule set, and the short class facts the class cards show.
import { CLASSES } from "../classes";
import { rulesData } from "../levelup/data";
import type { RulesData, Text } from "../levelup/types";
import b14 from "./data-2014.json";
import b24 from "./data-2024.json";
import type { BuilderData, Rules } from "./types";

export const builderData = (rules: Rules): BuilderData => (rules === "2014" ? b14 : b24) as unknown as BuilderData;

export type ClassCard = {
  name: string; hitDie: number; saves: string[]; spell: string | null; subclassLevel: number; subclasses: string[];
  level1: Text[];
};

/** For the class step: hit die, saves, level-1 features (with text) and the free-rules subclass. */
export function classCards(rules: Rules, ld: RulesData = rulesData(rules)): ClassCard[] {
  return Object.keys(ld.classes).map((name) => {
    const c = ld.classes[name];
    return {
      name, hitDie: c.hitDie, saves: CLASSES[name]?.saves ?? [], spell: CLASSES[name]?.spell ?? null, subclassLevel: c.subclassLevel,
      subclasses: c.subclasses.map((s) => s.name), level1: c.levels["1"]?.features ?? [],
    };
  });
}

/** A feat's rules text (origin feats, fighting styles…). */
export function featTextFor(rules: Rules, name: string, ld: RulesData = rulesData(rules)): string {
  return ld.feats.find((f) => f.name === name)?.text ?? "";
}
export function originFeatTexts(rules: Rules, ld: RulesData = rulesData(rules)): Record<string, string> {
  if (rules !== "2024") return {};
  return Object.fromEntries(ld.feats.filter((f) => /origin/i.test(f.category ?? "")).map((f) => [f.name, f.text]));
}
