// Cleans a character sheet that came from somewhere we don't control: an AI's reading of a flat PDF,
// or the import screen sending it back to the server. Everything is checked and clamped; unknown
// classes, skills and abilities are dropped or listed as warnings. Pure (tested).
import { ABILITIES, SKILLS, type Ability } from "../rules";
import { cleanSpellName, num, parseClassLevel, parseDamage, parseSpeed } from "./parse";
import { emptySheet, type ImportedSheet, type SheetAttack } from "./types";

type Loose = Record<string, unknown>;
const obj = (v: unknown): Loose => (v && typeof v === "object" && !Array.isArray(v) ? (v as Loose) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, max = 60) => (typeof v === "string" || typeof v === "number" ? String(v).replace(/\s+/g, " ").trim().slice(0, max) : "");
const longStr = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const SKILL_NAMES = Object.keys(SKILLS);

export function toAbility(v: unknown): Ability | null {
  const s = str(v).toUpperCase().slice(0, 3);
  return (ABILITIES as readonly string[]).includes(s) ? (s as Ability) : null;
}
export function toSkill(v: unknown): string | null {
  const s = str(v).toLowerCase();
  return SKILL_NAMES.find((k) => k.toLowerCase() === s) ?? null;
}
const positive = (v: unknown, max: number) => { const n = typeof v === "number" ? Math.round(v) : num(str(v)); return n != null && n > 0 ? Math.min(max, n) : null; };

function cleanAttack(v: unknown): SheetAttack | null {
  const a = obj(v);
  const name = str(a.name);
  if (!name) return null;
  const d = parseDamage(str(a.damage));
  const bonusN = typeof a.bonus === "number" ? Math.round(a.bonus) : /\d/.test(str(a.bonus)) && !/dc/i.test(str(a.bonus)) ? num(str(a.bonus)) : null;
  return {
    name, bonus: bonusN != null ? clamp(bonusN, -5, 30) : null,
    damage: d.dice ? `${d.dice}${d.flat ? (d.flat > 0 ? `+${d.flat}` : `${d.flat}`) : ""}` : d.flat ? String(d.flat) : "",
    damageType: str(a.damageType).toLowerCase() || d.type, notes: str(a.notes, 80),
  };
}

/** Any loose object shaped roughly like an ImportedSheet → a safe ImportedSheet. */
export function cleanSheet(raw: unknown, source: ImportedSheet["source"]): ImportedSheet {
  const r = obj(raw);
  const s = emptySheet(source);
  s.name = str(r.name);
  s.playerName = str(r.playerName, 40);
  s.species = str(r.species, 40);
  s.background = str(r.background, 40);
  s.alignment = str(r.alignment, 40);

  for (const c of arr(r.classes)) {
    const o = obj(c);
    const line = typeof c === "string" ? c : `${str(o.class)} ${str(o.subclass) ? `(${str(o.subclass)}) ` : ""}${str(o.level)}`;
    const { classes, unknown } = parseClassLevel(line);
    for (const k of classes) if (s.classes.length < 3 && !s.classes.some((x) => x.class === k.class)) s.classes.push(k);
    s.unknownClasses.push(...unknown);
  }
  for (const u of arr(r.unknownClasses)) { const t = str(u, 40); if (t && !s.unknownClasses.includes(t)) s.unknownClasses.push(t); }
  if (s.classes.reduce((t, c) => t + c.level, 0) > 20) s.classes = s.classes.map((c, i) => (i === 0 ? { ...c, level: clamp(c.level, 1, 20) } : c)).slice(0, 1);

  const scores = obj(r.scores);
  for (const [k, v] of Object.entries(scores)) {
    const a = toAbility(k);
    const n = typeof v === "number" ? Math.round(v) : num(str(v));
    if (a && n != null && n > 0) s.scores[a] = clamp(n, 1, 30);
  }
  const pb = typeof r.profBonus === "number" ? r.profBonus : num(str(r.profBonus));
  s.profBonus = pb != null && pb >= 2 && pb <= 9 ? pb : null;
  s.saves = [...new Set(arr(r.saves).map(toAbility).filter((x): x is Ability => !!x))];
  s.skills = [...new Set(arr(r.skills).map(toSkill).filter((x): x is string => !!x))];
  s.expertise = [...new Set(arr(r.expertise).map(toSkill).filter((x): x is string => !!x && s.skills.includes(x)))];

  s.hp = positive(r.hp, 999);
  s.ac = positive(r.ac, 40);
  s.speed = typeof r.speed === "number" ? (r.speed > 0 && r.speed <= 120 ? Math.round(r.speed) : null) : parseSpeed(str(r.speed));

  s.attacks = arr(r.attacks).map(cleanAttack).filter((x): x is SheetAttack => !!x).slice(0, 12);
  const spells: string[] = [];
  for (const v of arr(r.spells)) { const n = typeof v === "string" ? cleanSpellName(v) : ""; if (!/[a-z]/i.test(n)) continue; if (n && !spells.some((x) => x.toLowerCase() === n.toLowerCase())) spells.push(n); }
  s.spells = spells.slice(0, 120);
  s.spellAbility = toAbility(r.spellAbility);

  for (const v of arr(r.equipment)) {
    const o = obj(v);
    const name = typeof v === "string" ? str(v) : str(o.name);
    if (!name) continue;
    const qty = typeof v === "string" ? 1 : positive(o.qty, 9999) ?? 1;
    const same = s.equipment.find((e) => e.name.toLowerCase() === name.toLowerCase());
    if (same) same.qty = Math.min(9999, same.qty + qty); else s.equipment.push({ name, qty });
  }
  s.equipment = s.equipment.slice(0, 80);
  const coins = obj(r.coins);
  for (const c of ["pp", "gp", "ep", "sp", "cp"] as const) { const n = positive(coins[c], 9_999_999); s.coins[c] = n ?? 0; }

  s.features = arr(r.features).map((f) => { const o = obj(f); return { name: str(o.name), description: longStr(o.description) }; }).filter((f) => f.name).slice(0, 60);
  s.warnings = arr(r.warnings).map((w) => str(w, 200)).filter(Boolean).slice(0, 12);
  if (s.unknownClasses.length && !s.warnings.some((w) => w.includes("doesn't have")))
    s.warnings.push(`The app doesn't have ${s.unknownClasses.join(", ")} yet (only the 12 classes from the free rules). Pick the closest one, or keep it as a note.`);
  return s;
}

/** An AI's answer (JSON already parsed, or anything else) → a checked sheet with a "check this" warning on top. */
export function cleanAiSheet(raw: unknown): ImportedSheet {
  const s = cleanSheet(raw, "ai");
  s.warnings.unshift("An AI read this sheet from the PDF's text. Check every number before you save.");
  return s;
}

