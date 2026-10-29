// Turns the fields of a character sheet PDF into an ImportedSheet (pure, tested).
// Knows the official WotC fillable sheet (2014) and D&D Beyond's export; anything else is matched by
// field names that look alike ("MaxHP", "HP Max", "Hit Point Maximum"...). Field names are compared
// without case, spaces or punctuation, because real sheets are full of stray spaces ("Race ", "DEXmod ").
import { CLASS_NAMES } from "../classes";
import { ABILITIES, SKILLS, type Ability } from "../rules";
import { emptySheet, type Coins, type ImportedSheet, type PdfField, type SheetAttack, type SheetFeature, type SheetItem } from "./types";

export const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const SKILL_NAMES = Object.keys(SKILLS);
const ABILITY_WORDS: Record<string, Ability> = {
  str: "STR", strength: "STR", dex: "DEX", dexterity: "DEX", con: "CON", constitution: "CON",
  int: "INT", intelligence: "INT", wis: "WIS", wisdom: "WIS", cha: "CHA", charisma: "CHA",
};

/** The official sheet's proficiency check boxes, in the order they sit on the page. */
const OFFICIAL_SAVE_BOXES: [string, Ability][] = [["checkbox11", "STR"], ["checkbox18", "DEX"], ["checkbox19", "CON"], ["checkbox20", "INT"], ["checkbox21", "WIS"], ["checkbox22", "CHA"]];
const OFFICIAL_SKILL_BOXES = ["Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception", "History", "Insight", "Intimidation",
  "Investigation", "Medicine", "Nature", "Perception", "Performance", "Persuasion", "Religion", "Sleight of Hand", "Stealth", "Survival"]
  .map((s, i) => [`checkbox${23 + i}`, s] as const);
/** Field names (keyed) for each skill's total; "Animal" is how both sheets spell Animal Handling. */
const SKILL_FIELDS: Record<string, string[]> = Object.fromEntries(SKILL_NAMES.map((s) => [s, [key(s), ...(s === "Animal Handling" ? ["animal"] : [])]]));

export function num(s: string | undefined | null): number | null {
  if (s == null) return null;
  const m = String(s).replace(/[−–]/g, "-").match(/[+-]?\s*\d+/);
  return m ? Number(m[0].replace(/\s/g, "")) : null;
}
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** "Rogue 2 / Wizard 1", "Barbarian (Berserker) 3", "Level 4 Cleric", "Fighter 5, Champion" → SRD classes + the ones the app doesn't know. */
export function parseClassLevel(s: string): { classes: ImportedSheet["classes"]; unknown: string[] } {
  const classes: ImportedSheet["classes"] = [];
  const unknown: string[] = [];
  // split between classes: "/", "+", "&", ";", " and ", or a comma followed by another "Name 3"
  const parts = s.split(/\s*(?:\/|\+|&|;|\band\b|,(?=\s*[A-Za-z]+\s*(?:\([^)]*\))?\s*\d))\s*/i).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const cls = CLASS_NAMES.find((c) => new RegExp(`\\b${c}\\b`, "i").test(part));
    if (!cls) {
      // "Champion" right after "Fighter 5," is the subclass, not another class
      const last = classes[classes.length - 1];
      if (last && !last.subclass && !/\d/.test(part) && /^[a-z][a-z' -]+$/i.test(part)) last.subclass = part.slice(0, 40);
      else if (/[a-z]/i.test(part)) unknown.push(part.slice(0, 40));
      continue;
    }
    const level = num(part.match(/\d+/)?.[0]);
    const paren = part.match(/\(([^)]+)\)/)?.[1]?.trim();
    const rest = part.replace(/\([^)]*\)/g, " ").replace(new RegExp(`\\b${cls}\\b`, "i"), " ").replace(/\b(level|lvl|lv)\b\.?/gi, " ")
      .replace(/\d+/g, " ").replace(/[,:\-–]/g, " ").replace(/\s+/g, " ").trim();
    classes.push({ class: cls, subclass: (paren ?? rest).slice(0, 40), level: clamp(level ?? 1, 1, 20) });
  }
  return { classes, unknown };
}

/** "1d8+3 slashing", "2d6 + 4 Piercing", "0 Bludgeoning" → dice, flat bonus, type. */
export function parseDamage(s: string): { dice: string; flat: number; type: string } {
  const t = s.replace(/[−–]/g, "-");
  const m = t.match(/(\d+)\s*d\s*(\d+)/i);
  const dice = m ? `${m[1]}d${m[2]}` : "";
  const flatM = m ? t.slice(m.index! + m[0].length).match(/^\s*([+-]\s*\d+)/) : t.match(/^\s*([+-]?\s*\d+)/);
  const type = t.match(/\b(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder)\b/i)?.[1]?.toLowerCase() ?? "";
  return { dice, flat: flatM ? Number(flatM[1].replace(/\s/g, "")) : 0, type };
}

export function parseSpeed(s: string): number | null {
  const n = num(s);
  return n && n > 0 && n <= 120 ? n : null;
}

/** "Dagger x2", "2 Daggers", "Rope, hempen (50 feet)" → name + amount. */
export function parseItemLine(line: string): SheetItem | null {
  let s = line.replace(/^[\s•*\-–·]+/, "").trim();
  if (!s || s.length > 80) return null;
  let qty = 1;
  const tail = s.match(/\s*(?:[x×]\s*(\d+)|\((\d+)\))\s*$/i);
  if (tail) { qty = Number(tail[1] ?? tail[2]); s = s.slice(0, tail.index).trim(); }
  else {
    const head = s.match(/^(\d+)\s*[x×]?\s+(.+)$/i);
    if (head) { qty = Number(head[1]); s = head[2].trim(); }
  }
  return s ? { name: s.slice(0, 60), qty: clamp(qty, 1, 9999) } : null;
}

/** A block of free text (Equipment box) → one item per line or comma. Commas inside "(...)" or "Rope, hempen" style names are kept. */
export function parseItemBlock(text: string): SheetItem[] {
  // one item per line; a line that is a list ("Longsword, shield, 4 javelins") splits on commas outside brackets
  const pieces = text.split(/\n+/).flatMap((l) => l.split(/,(?![^()]*\))/));
  return pieces.map(parseItemLine).filter((x): x is SheetItem => !!x && !/^(coins?|gp|sp|cp|pp|ep|equipment)$/i.test(x.name));
}

/** A features box → one feature per heading-like line ("* Rage • PHB 48", "Rage.", "Second Wind:"), the text below it as the description. */
export function parseFeatureBlock(text: string, fallbackName: string): SheetFeature[] {
  const out: SheetFeature[] = [];
  let cur: SheetFeature | null = null;
  for (const raw of text.split(/\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^===.*===$/.test(line)) continue; // "=== RANGER FEATURES ==="
    const head = line.match(/^(?:[*•\-–]\s*)?([A-Z][^.:•|]{1,48}?)\s*(?:[•|].*|[.:])\s*(.*)$/);
    const bulletOnly = line.match(/^[*•\-–]\s*(.{2,50})$/);
    // a heading: a bullet, or a short name followed by its text ("Natural Explorer. You…"), or a short "Name:" line;
    // a sentence ("You have advantage on…", "Turn undead.") is description
    const words = head ? head[1].trim().split(/\s+/).length : 99;
    const sentence = head ? /^(you|your|when|if|the|a|an|this|once|as|while|in|at|on|for|whenever|each|after|before|it|they)\b/i.test(head[1]) : true;
    const isHead = !!head && (/^[*•\-–]/.test(line) || (!sentence && words <= 5 && (!!head[2] || /:\s*$/.test(line) || !cur)));
    if (head && isHead) {
      if (cur) out.push(cur);
      cur = { name: head[1].trim(), description: head[2]?.trim() ?? "" };
    } else if (bulletOnly) {
      if (cur) out.push(cur);
      cur = { name: bulletOnly[1].trim(), description: "" };
    } else if (cur) cur.description = `${cur.description} ${line}`.trim();
    else cur = { name: fallbackName, description: line };
  }
  if (cur) out.push(cur);
  return out.map((f) => ({ name: f.name.slice(0, 60), description: f.description.slice(0, 2000) })).slice(0, 60);
}

/** A spell name as written on a sheet → plain name ("Find Familiar [R]" → "Find Familiar", "Shield - VS" → "Shield"). */
export function cleanSpellName(s: string): string {
  return s.replace(/\[[^\]]*\]/g, "").replace(/\s[-–]\s.*$/, "").replace(/\((?:ritual|r|c|concentration)\)/gi, "").replace(/^[\s•*O○●◯◉]+/, "").replace(/\s+/g, " ").trim();
}

const abilityOf = (s: string): Ability | null => ABILITY_WORDS[s.trim().split(/[\s/,]/)[0]?.toLowerCase() ?? ""] ?? null;

/** Proficient or expert from the skill's total: total - ability mod = proficiency bonus (×2 = expertise). */
function inferProf(total: number | null, mod: number | null, prof: number | null): "" | "P" | "E" {
  if (total == null || mod == null || !prof) return "";
  const d = total - mod;
  return d >= prof * 2 ? "E" : d >= prof ? "P" : "";
}

export function fieldsToSheet(fields: PdfField[]): ImportedSheet {
  const sheet = emptySheet("form");
  const byKey = new Map<string, PdfField>();
  for (const f of fields) { const k = key(f.name); if (!byKey.has(k) || (!byKey.get(k)!.value && f.value)) byKey.set(k, f); }
  const get = (...names: string[]) => { for (const n of names) { const v = byKey.get(key(n))?.value; if (v) return v; } return ""; };
  const on = (...names: string[]) => names.some((n) => { const v = byKey.get(key(n))?.value ?? ""; return !!v && !/^(off|false|no|0|--)$/i.test(v); });

  sheet.name = get("CharacterName", "Character Name", "Name").slice(0, 60);
  sheet.playerName = get("PlayerName", "Player Name", "Player").slice(0, 40);
  sheet.species = get("Race", "Species", "Race Species", "Ancestry", "Lineage").slice(0, 40);
  sheet.background = get("Background").slice(0, 40);
  sheet.alignment = get("Alignment").slice(0, 40);

  const cl = get("ClassLevel", "Class Level", "Class & Level", "Class", "Classes");
  if (cl) {
    const { classes, unknown } = parseClassLevel(cl);
    const lvl = num(get("Level", "Character Level"));
    if (classes.length === 1 && !/\d/.test(cl) && lvl) classes[0].level = clamp(lvl, 1, 20);
    sheet.classes = classes;
    sheet.unknownClasses = unknown;
  }

  for (const a of ABILITIES) {
    const full = Object.entries(ABILITY_WORDS).find(([w, ab]) => ab === a && w.length > 3)![0];
    const score = num(get(a, `${a} Score`, full, `${full} Score`));
    if (score != null && score >= 1 && score <= 30) sheet.scores[a] = score;
    else {
      const mod = num(get(`${a}mod`, `${a} Mod`, `${full} Mod`, a === "CHA" ? "CHamod" : ""));
      if (mod != null) { sheet.scores[a] = clamp(10 + mod * 2, 1, 30); sheet.warnings.push(`${a}: only the modifier was on the sheet, so the score is a guess (${10 + mod * 2}).`); }
    }
  }
  const mods = Object.fromEntries(ABILITIES.map((a) => [a, sheet.scores[a] != null ? Math.floor((sheet.scores[a]! - 10) / 2) : null])) as Record<Ability, number | null>;
  sheet.profBonus = num(get("ProfBonus", "Proficiency Bonus", "Prof Bonus"));
  if (sheet.profBonus == null && sheet.classes.length) {
    const lvl = sheet.classes.reduce((s, c) => s + c.level, 0);
    sheet.profBonus = 2 + Math.floor((Math.min(20, lvl) - 1) / 4);
  }

  // saving throws: the official sheet's boxes, D&D Beyond's "StrProf" dots, or worked out from the totals
  const fullName: Record<Ability, string> = { STR: "Strength", DEX: "Dexterity", CON: "Constitution", INT: "Intelligence", WIS: "Wisdom", CHA: "Charisma" };
  for (const [box, a] of OFFICIAL_SAVE_BOXES) {
    const t = a[0] + a.slice(1).toLowerCase();
    if (on(box, `${t}Prof`, `${t} Save Prof`, `ST ${fullName[a]} Prof`)) sheet.saves.push(a);
  }
  if (!sheet.saves.length) {
    for (const a of ABILITIES) {
      if (inferProf(num(get(`ST ${fullName[a]}`, `${fullName[a]} Save`, `${a} Save`)), mods[a], sheet.profBonus)) sheet.saves.push(a);
    }
  }

  // skills
  const marked = new Map<string, "P" | "E">();
  for (const [box, s] of OFFICIAL_SKILL_BOXES) if (on(box)) marked.set(s, "P");
  for (const s of SKILL_NAMES) {
    const v = SKILL_FIELDS[s].map((k) => byKey.get(`${k}prof`)?.value ?? "").find(Boolean) ?? "";
    if (/^e/i.test(v)) marked.set(s, "E"); else if (v && !/^(off|false|no|0|--)$/i.test(v)) marked.set(s, "P");
  }
  for (const s of SKILL_NAMES) {
    const total = num(SKILL_FIELDS[s].map((k) => byKey.get(k)?.value ?? "").find(Boolean));
    const inferred = inferProf(total, mods[SKILLS[s as keyof typeof SKILLS] as Ability], sheet.profBonus);
    const m = marked.get(s) ?? (marked.size ? "" : inferred);
    // a box ticked + a total that shows double proficiency = expertise
    const level = m === "P" && inferred === "E" ? "E" : m;
    if (level) sheet.skills.push(s);
    if (level === "E") sheet.expertise.push(s);
  }

  sheet.hp = num(get("HPMax", "MaxHP", "Max HP", "HP Max", "Hit Point Maximum", "HitPointMaximum", "HP"));
  sheet.ac = num(get("AC", "Armor Class", "ArmorClass"));
  sheet.speed = parseSpeed(get("Speed", "Walking Speed"));
  if (sheet.hp != null && (sheet.hp < 1 || sheet.hp > 999)) sheet.hp = null;
  if (sheet.ac != null && (sheet.ac < 1 || sheet.ac > 40)) sheet.ac = null;

  // attacks: "Wpn Name" + "Wpn1 AtkBonus" + "Wpn1 Damage" (official: 3 rows, D&D Beyond: more)
  for (let i = 1; i <= 8; i++) {
    const name = get(i === 1 ? "Wpn Name" : `Wpn Name ${i}`, `Wpn${i} Name`, `Weapon ${i}`, `Attack ${i}`);
    if (!name) continue;
    const bonusRaw = get(`Wpn${i} AtkBonus`, `Wpn ${i} AtkBonus`, `Wpn${i} Atk Bonus`, `Attack ${i} Bonus`);
    const dmg = get(`Wpn${i} Damage`, `Wpn ${i} Damage`, `Attack ${i} Damage`);
    const d = parseDamage(dmg);
    const attack: SheetAttack = {
      name: name.slice(0, 60), bonus: /\d/.test(bonusRaw) ? num(bonusRaw) : null,
      damage: d.dice ? `${d.dice}${d.flat ? (d.flat > 0 ? `+${d.flat}` : `${d.flat}`) : ""}` : d.flat ? String(d.flat) : "",
      damageType: d.type, notes: get(`Wpn Notes ${i}`, `Wpn${i} Notes`).slice(0, 80),
    };
    sheet.attacks.push(attack);
  }

  // spells: D&D Beyond "spellName0…"; the official sheet "Spells 1014…"; anything else named like a spell list
  const spellFields = fields.filter((f) => f.value && (/^spellname\d+$/.test(key(f.name)) || /^spells\d+$/.test(key(f.name)) || /^(cantrip|spell)\d+$/.test(key(f.name))))
    .sort((a, b) => a.page - b.page || b.y - a.y);
  const spells: string[] = [];
  for (const f of spellFields) for (const piece of f.value.split(/\n|;/)) {
    const n = cleanSpellName(piece);
    if (n && n.length <= 50 && !/^=+/.test(n) && !/^(spells?|cantrips?|name|spell name)$/i.test(n) && !spells.some((s) => s.toLowerCase() === n.toLowerCase())) spells.push(n);
  }
  sheet.spells = spells.slice(0, 120);
  sheet.spellAbility = abilityOf(get("SpellcastingAbility 2", "spellCastingAbility0", "Spellcasting Ability", "SpellcastingAbility"));

  // equipment: D&D Beyond's rows, or the official sheet's Equipment box
  const rows: SheetItem[] = [];
  for (const f of fields) {
    const m = key(f.name).match(/^eqname(\d+)$/);
    if (!m || !f.value) continue;
    const qty = num(byKey.get(`eqqty${m[1]}`)?.value) ?? 1;
    const it = parseItemLine(f.value);
    if (it) rows.push({ name: it.name, qty: clamp(qty || 1, 1, 9999) });
  }
  const block = get("Equipment", "Inventory", "Gear");
  const items = rows.length ? rows : block ? parseItemBlock(block) : [];
  // the same item listed twice (D&D Beyond repeats containers' contents) → add the amounts
  for (const it of items) {
    const same = sheet.equipment.find((e) => e.name.toLowerCase() === it.name.toLowerCase());
    if (same) same.qty = clamp(same.qty + it.qty, 1, 9999); else sheet.equipment.push({ ...it });
  }
  sheet.equipment = sheet.equipment.slice(0, 80);

  const coins: Coins = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
  for (const c of ["pp", "gp", "ep", "sp", "cp"] as const) coins[c] = clamp(num(get(c.toUpperCase(), `${c} coins`)) ?? 0, 0, 9_999_999);
  sheet.coins = coins;

  // features and the "about me" boxes
  const featureText = [get("Features and Traits", "FeaturesTraits", "Features & Traits", "Features"),
    ...[1, 2, 3, 4, 5, 6].map((i) => get(`FeaturesTraits${i}`)), get("Feat+Traits", "Additional Features and Traits")].filter(Boolean).join("\n");
  if (featureText) sheet.features.push(...parseFeatureBlock(featureText, "Features and traits"));
  const about: [string, string][] = [
    ["Personality traits", get("PersonalityTraits", "Personality Traits", "Personality")], ["Ideals", get("Ideals")], ["Bonds", get("Bonds")], ["Flaws", get("Flaws")],
    ["Proficiencies & languages", get("ProficienciesLang", "Other Proficiencies and Languages", "Proficiencies", "Languages")],
    ["Backstory", get("Backstory", "Character Backstory")], ["Allies & organizations", get("Allies", "Allies & Organizations")],
  ];
  for (const [n, v] of about) if (v) sheet.features.push({ name: n, description: v.replace(/\s+\n/g, "\n").slice(0, 2000) });

  if (!sheet.classes.length && cl) sheet.warnings.push(`Couldn't find a class the app knows in “${cl}”. Pick it below.`);
  if (sheet.unknownClasses.length) sheet.warnings.push(`The app doesn't have ${sheet.unknownClasses.join(", ")} yet (only the 12 classes from the free rules). Pick the closest one, or keep it as a note.`);
  return sheet;
}

/** How much of a character we found: a sheet with almost nothing filled in is probably a flat (printed or scanned) PDF. */
export function sheetScore(s: ImportedSheet): number {
  return (s.name ? 2 : 0) + (s.classes.length || s.unknownClasses.length ? 2 : 0) + Object.keys(s.scores).length + (s.hp ? 1 : 0) + (s.ac ? 1 : 0) + Math.min(3, s.skills.length);
}
