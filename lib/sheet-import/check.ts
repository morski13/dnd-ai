// "Check your numbers": after a PDF import, the app works out the numbers itself and compares them
// with what the sheet says. Nothing is changed by this: the player picks which one to keep (the sheet's
// number may be right because of a magic item, a feat or a homebrew rule the app doesn't know about).
// Pure functions, used by the import form (browser) and tested on their own.
import { averageHp, CLASSES } from "../classes";
import { abilityMod, profBonus, type Ability } from "../rules";

export type CheckInput = {
  rules: "2014" | "2024";
  species: string;
  classes: { class: string; level: number; subclass?: string }[];
  scores: Record<Ability, number>;
  equipment: string[];            // item names from the sheet
  features: string[];             // feature / feat names from the sheet
  sheet: { hp: number | null; ac: number | null; speed: number | null; prof: number | null };
};

export type CheckRow = {
  key: "hp" | "ac" | "speed" | "prof";
  label: string;
  sheet: number | null;
  app: number | null;
  /** how the app got its number, in a few words */
  how: string;
  /** both known and different */
  differs: boolean;
  /** extra advice when they differ */
  hint?: string;
};

// SRD armor (first match wins, so "Half plate" comes before "Plate"): base AC, how much DEX counts (null = all), heavy
const ARMOR: { re: RegExp; base: number; dex: number | null; heavy?: boolean; name: string }[] = [
  { re: /\bhalf[- ]?plate\b/i, base: 15, dex: 2, name: "Half plate" },
  { re: /\bplate( armou?r)?\b/i, base: 18, dex: 0, heavy: true, name: "Plate" },
  { re: /\bsplint\b/i, base: 17, dex: 0, heavy: true, name: "Splint" },
  { re: /\bchain ?mail\b/i, base: 16, dex: 0, heavy: true, name: "Chain mail" },
  { re: /\bring ?mail\b/i, base: 14, dex: 0, heavy: true, name: "Ring mail" },
  { re: /\bbreastplate\b/i, base: 14, dex: 2, name: "Breastplate" },
  { re: /\bscale ?mail\b/i, base: 14, dex: 2, name: "Scale mail" },
  { re: /\bchain ?shirt\b/i, base: 13, dex: 2, name: "Chain shirt" },
  { re: /\bhide armou?r\b|^\s*hide(\s*\+\d)?\s*$/i, base: 12, dex: 2, name: "Hide" },
  { re: /\bstudded leather\b/i, base: 12, dex: null, name: "Studded leather" },
  { re: /\bleather armou?r\b|^\s*(\+\d\s*)?leather(\s*\+\d)?\s*$/i, base: 11, dex: null, name: "Leather" },
  { re: /\bpadded armou?r\b|^\s*padded\s*$/i, base: 11, dex: null, name: "Padded" },
];

// Walking speed by species (SRD); anything else (Leonin, Tabaxi…) isn't checked.
const SPEED_2014: Record<string, number> = { dwarf: 25, halfling: 25, gnome: 25, "wood elf": 35, elf: 30, human: 30, dragonborn: 30, "half-elf": 30, "half-orc": 30, tiefling: 30 };
const SPEED_2024: Record<string, number> = { goliath: 35, "wood elf": 35, dwarf: 30, halfling: 30, gnome: 30, elf: 30, human: 30, dragonborn: 30, orc: 30, tiefling: 30, aasimar: 30 };

const magic = (s: string) => { const m = s.match(/\+([1-3])\b/); return m ? Number(m[1]) : 0; };
const levelOf = (i: CheckInput, cls: string) => i.classes.find((c) => c.class === cls)?.level ?? 0;
const has = (list: string[], re: RegExp) => list.some((x) => re.test(x));

export function appHp(i: CheckInput): { value: number; how: string } {
  const total = i.classes.reduce((s, c) => s + c.level, 0);
  let hp = averageHp(i.classes, i.scores.CON);
  const extras: string[] = [];
  if (/dwarf/i.test(i.species) && (i.rules === "2024" || /hill/i.test(i.species) || has(i.features, /dwarven toughness/i))) { hp += total; extras.push("Dwarven Toughness"); }
  if (has(i.features, /^tough\b/i)) { hp += 2 * total; extras.push("Tough"); }
  const draconic = i.classes.find((c) => c.class === "Sorcerer" && /draconic/i.test(c.subclass ?? ""));
  if (draconic) { hp += draconic.level; extras.push("Draconic Resilience"); }
  return { value: hp, how: `average hit dice + CON${extras.length ? ` + ${extras.join(" + ")}` : ""}` };
}

export function appAc(i: CheckInput): { value: number; how: string } {
  const dex = abilityMod(i.scores.DEX);
  const names = i.equipment;
  const shieldItem = names.find((n) => /\bshield\b/i.test(n) && !/spell|guardian|shield of faith/i.test(n));
  const shield = shieldItem ? 2 + magic(shieldItem) : 0;
  const options: { value: number; how: string }[] = [{ value: 10 + dex, how: "10 + DEX" }];
  for (const n of names) {
    const a = ARMOR.find((x) => x.re.test(n));
    if (!a) continue;
    const d = a.dex === null ? dex : Math.min(dex, a.dex);
    const plus = magic(n);
    options.push({ value: a.base + d + plus, how: `${a.name}${plus ? ` +${plus}` : ""}${a.dex === 0 ? "" : " + DEX"}` });
  }
  if (levelOf(i, "Barbarian")) options.push({ value: 10 + dex + abilityMod(i.scores.CON), how: "Unarmored Defense (10 + DEX + CON)" });
  if (levelOf(i, "Monk")) options.push({ value: 10 + dex + abilityMod(i.scores.WIS), how: "Unarmored Defense (10 + DEX + WIS)" });
  if (i.classes.some((c) => c.class === "Sorcerer" && /draconic/i.test(c.subclass ?? ""))) options.push({ value: 13 + dex, how: "Draconic Resilience (13 + DEX)" });
  // a Monk's Unarmored Defense doesn't work with a shield
  const best = options.map((o) => ({ ...o, value: o.value + (shield && !/WIS/.test(o.how) ? shield : 0), how: o.how + (shield && !/WIS/.test(o.how) ? ` + shield${shield > 2 ? ` +${shield - 2}` : ""}` : "") }))
    .sort((a, b) => b.value - a.value)[0];
  return best;
}

export function appSpeed(i: CheckInput): { value: number; how: string } | null {
  const table = i.rules === "2014" ? SPEED_2014 : SPEED_2024;
  const sp = i.species.toLowerCase();
  const key = Object.keys(table).sort((a, b) => b.length - a.length).find((k) => sp.includes(k));
  if (!key) return null;
  let speed = table[key];
  const extras: string[] = [];
  const heavy = i.equipment.some((n) => ARMOR.find((a) => a.re.test(n))?.heavy);
  if (levelOf(i, "Barbarian") >= 5 && !heavy) { speed += 10; extras.push("Fast Movement"); }
  const monk = levelOf(i, "Monk");
  if (monk >= 2) {
    const bonus = monk >= 18 ? 30 : monk >= 14 ? 25 : monk >= 10 ? 20 : monk >= 6 ? 15 : 10;
    speed += bonus; extras.push("Unarmored Movement");
  }
  return { value: speed, how: `${key[0].toUpperCase()}${key.slice(1)} ${table[key]} ft${extras.length ? ` + ${extras.join(" + ")}` : ""}` };
}

export function checkNumbers(i: CheckInput): CheckRow[] {
  const level = i.classes.reduce((s, c) => s + c.level, 0);
  const known = i.classes.every((c) => CLASSES[c.class]);
  const rows: CheckRow[] = [];
  const row = (key: CheckRow["key"], label: string, sheet: number | null, app: number | null, how: string, hint?: string) => {
    const differs = sheet != null && app != null && sheet !== app;
    rows.push({ key, label, sheet, app, how, differs, ...(differs && hint ? { hint } : {}) });
  };
  if (known) {
    const hp = appHp(i);
    row("hp", "Max HP", i.sheet.hp, hp.value, hp.how, "Rolled hit points, a feat or a magic item can explain it.");
  }
  const ac = appAc(i);
  row("ac", "Armor Class", i.sheet.ac, ac.value, ac.how, "Magic armor, a ring or cloak of protection, a fighting style or a homebrew rule can explain it.");
  const sp = appSpeed(i);
  row("speed", "Speed", i.sheet.speed, sp?.value ?? null, sp?.how ?? "species not in the free rules: not checked", "A feat (Mobile), boots or a homebrew species can explain it.");
  row("prof", "Proficiency bonus", i.sheet.prof, profBonus(level), `level ${level}`, "The app uses the bonus for the character's level; to use another one, set it in \"Edit numbers\" on the sheet after saving.");
  return rows;
}
