// Our own character sheet (a fillable PDF). Every box has a fixed field name the app knows, so
// importing it back is exact: no guessing, no AI. This file is pure data:
//  - PrintData: what the sheet shows (built on the server from a character, or empty for a blank sheet)
//  - FIELD names and toFields(): what goes in each box
//  - fromFields(): a filled-in sheet → ImportedSheet for the normal import form
// Totals (saves, skills, initiative, spell DC / attack) are printed for reading at the table. On import,
// a total that differs from what the app works out becomes a hand-set extra ("Edit numbers"), so a magic
// cloak or a homebrew bonus written on the sheet survives the round trip.
import { cleanBonuses, type Bonuses } from "../homebrew";
import { ABILITIES, abilityMod, profBonus, SKILLS, type Ability } from "../rules";
import { CLASS_NAMES, CLASSES } from "../classes";

const HIT_DIE: Record<string, number> = Object.fromEntries(Object.entries(CLASSES).map(([k, v]) => [k, v.hitDie]));
import { emptySheet, type ImportedSheet, type PdfField, type SheetAttack } from "../sheet-import/types";

export const SHEET_KIND = "lth-sheet-2"; // 1: two pages, spells as one text box; 2: a spell page with a line per spell
/** Lines on the spell page for each spell level (0 = cantrips); more go in "More spells". */
export const SPELL_LINES: Record<number, number> = { 0: 8, 1: 10, 2: 8, 3: 8, 4: 6, 5: 6, 6: 4, 7: 4, 8: 3, 9: 3 };
export const CAST_ROWS = 2;
export const ATTACK_ROWS = 8;
export const CLASS_ROWS = 3;
export const COIN_KEYS = ["pp", "gp", "ep", "sp", "cp"] as const;

export type PrintData = {
  id: string | null;
  name: string; player: string; species: string; background: string; alignment: string; rules: "2014" | "2024" | "";
  classes: { class: string; subclass: string; level: number }[];
  scores: Partial<Record<Ability, number>>;
  saves: Ability[]; skills: string[]; expertise: string[];
  hpMax: number | null; ac: number | null; speed: number | null; prof: number | null; init: number | null; passive: number | null;
  hitDice: string;
  saveTotals: Partial<Record<Ability, number>>; skillTotals: Record<string, number>;
  attacks: { name: string; bonus: string; damage: string; notes: string }[];
  spellAbility: Ability | null; spellDc: number | null; spellAttack: number | null; slots: string;
  /** spellcasting per class (a multiclassed caster has one row each); the first row is the main one */
  casters: { class: string; ability: Ability; dc: number; attack: number }[];
  slotsBy: Record<number, number>;         // spell slots per level (1–9)
  pact: string;                            // "2× level 3" (warlock pact magic)
  spells: { level: number; name: string }[];
  equipment: { name: string; qty: number; equipped: boolean }[];
  coins: Record<(typeof COIN_KEYS)[number], number>;
  uses: string[];                          // "Rage 4 / long rest"
  features: { name: string; text: string }[];
  notes: string;
};

export const BLANK: PrintData = {
  id: null, name: "", player: "", species: "", background: "", alignment: "", rules: "",
  classes: [], scores: {}, saves: [], skills: [], expertise: [],
  hpMax: null, ac: null, speed: null, prof: null, init: null, passive: null, hitDice: "",
  saveTotals: {}, skillTotals: {}, attacks: [], spellAbility: null, spellDc: null, spellAttack: null, slots: "", casters: [], slotsBy: {}, pact: "",
  spells: [], equipment: [], coins: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }, uses: [], features: [], notes: "",
};

/** "Animal Handling" → "AnimalHandling" (field names have no spaces). */
export const skillKey = (s: string) => s.replace(/[^A-Za-z]/g, "");

/** Every field name on the sheet. */
export const FIELD = {
  kind: "LTH_kind", id: "LTH_id", snapshot: "LTH_snapshot",
  name: "LTH_name", player: "LTH_player", species: "LTH_species", background: "LTH_background", alignment: "LTH_alignment", rules: "LTH_rules",
  cls: (i: number) => `LTH_class${i + 1}`, sub: (i: number) => `LTH_subclass${i + 1}`, lvl: (i: number) => `LTH_level${i + 1}`,
  score: (a: Ability) => `LTH_${a}`, mod: (a: Ability) => `LTH_${a}_mod`,
  save: (a: Ability) => `LTH_save_${a}`, saveTotal: (a: Ability) => `LTH_save_${a}_total`,
  skill: (s: string) => `LTH_skill_${skillKey(s)}`, exp: (s: string) => `LTH_exp_${skillKey(s)}`, skillTotal: (s: string) => `LTH_skill_${skillKey(s)}_total`,
  hp: "LTH_hp", ac: "LTH_ac", speed: "LTH_speed", prof: "LTH_prof", init: "LTH_init", passive: "LTH_passive", hitDice: "LTH_hitdice",
  atk: (i: number, part: "name" | "bonus" | "damage" | "notes") => `LTH_atk${i + 1}_${part}`,
  spellAbility: "LTH_spell_ability", spellDc: "LTH_spell_dc", spellAttack: "LTH_spell_attack", slots: "LTH_spell_slots", spells: "LTH_spells",
  equipment: "LTH_equipment", coin: (c: string) => `LTH_${c}`, uses: "LTH_uses", features: "LTH_features", notes: "LTH_notes",
  // sheet 2: hit die per class row, a second spellcasting class, slots per level, a line per spell
  hd: (i: number) => `LTH_hd${i + 1}`,
  castClass: (i: number) => `LTH_cast${i + 1}_class`,
  castAbility: (i: number) => (i === 0 ? "LTH_spell_ability" : `LTH_cast${i + 1}_ability`),
  castDc: (i: number) => (i === 0 ? "LTH_spell_dc" : `LTH_cast${i + 1}_dc`),
  castAttack: (i: number) => (i === 0 ? "LTH_spell_attack" : `LTH_cast${i + 1}_attack`),
  slotTotal: (l: number) => `LTH_slots${l}`, slotUsed: (l: number) => `LTH_slots${l}_used`, pact: "LTH_pact",
  spell: (l: number, i: number) => `LTH_spell${l}_${i + 1}`, prep: (l: number, i: number) => `LTH_prep${l}_${i + 1}`,
} as const;

/** Which spells go on which line of the spell page; the rest go to "More spells". */
export function spellLines(spells: PrintData["spells"]) {
  const lines: Record<number, string[]> = {};
  const more: PrintData["spells"] = [];
  for (const sp of [...spells].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))) {
    const l = Math.max(0, Math.min(9, sp.level));
    const list = (lines[l] ??= []);
    if (list.length < SPELL_LINES[l]) list.push(sp.name); else more.push(sp);
  }
  return { lines, more };
}

const signed = (n: number | null | undefined) => (n == null ? "" : n >= 0 ? `+${n}` : `${n}`);
const plain = (n: number | null | undefined) => (n == null ? "" : String(n));

/** Spells as one text: a line per level ("Cantrips: Fire Bolt, Light", "Level 1: Shield, Magic Missile"). */
export function spellsText(spells: PrintData["spells"]): string {
  const by = new Map<number, string[]>();
  for (const s of spells) by.set(s.level, [...(by.get(s.level) ?? []), s.name]);
  return [...by.keys()].sort((a, b) => a - b).map((l) => `${l === 0 ? "Cantrips" : `Level ${l}`}: ${by.get(l)!.join(", ")}`).join("\n");
}

/** Equipment as one text: one item per line, "Javelin ×4", equipped ones marked "(equipped)". */
export const equipmentText = (items: PrintData["equipment"]) =>
  items.map((e) => `${e.name}${e.qty > 1 ? ` ×${e.qty}` : ""}${e.equipped ? " (equipped)" : ""}`).join("\n");

/** Features as one text: "• Name: what it does", one per paragraph. */
export const featuresText = (fs: PrintData["features"]) =>
  fs.map((f) => `• ${f.name}${f.text ? `: ${f.text.replace(/\s*\n+\s*/g, " ")}` : ""}`).join("\n");

/**
 * The numbers as printed (hidden on the sheet). When someone changes a score in a PDF app but leaves the
 * printed totals alone, the old totals would look like hand-set extras; the snapshot tells them apart.
 */
type Snapshot = {
  scores: Partial<Record<Ability, number>>; saves: Ability[]; skills: string[]; expertise: string[]; prof: number | null;
  spellAbility: Ability | null; t: Record<string, number | null>;
};
const totalsOf = (d: PrintData): Record<string, number | null> => ({
  init: d.init, spellDc: d.spellDc, spellAttack: d.spellAttack,
  ...Object.fromEntries(ABILITIES.map((a) => [`save:${a}`, d.saveTotals[a] ?? null])),
  ...Object.fromEntries(Object.keys(SKILLS).map((k) => [`skill:${k}`, d.skillTotals[k] ?? null])),
});
const snapshotOf = (d: PrintData): Snapshot => ({
  scores: d.scores, saves: d.saves, skills: d.skills, expertise: d.expertise, prof: d.prof, spellAbility: d.spellAbility, t: totalsOf(d),
});

/** The value of every field. Text fields get strings, check boxes get booleans. */
export function toFields(d: PrintData): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {
    [FIELD.kind]: SHEET_KIND, [FIELD.id]: d.id ?? "", [FIELD.snapshot]: d.name || d.classes.length ? JSON.stringify(snapshotOf(d)) : "",
    [FIELD.name]: d.name, [FIELD.player]: d.player, [FIELD.species]: d.species, [FIELD.background]: d.background,
    [FIELD.alignment]: d.alignment, [FIELD.rules]: d.rules,
    [FIELD.hp]: plain(d.hpMax), [FIELD.ac]: plain(d.ac), [FIELD.speed]: plain(d.speed), [FIELD.prof]: signed(d.prof),
    [FIELD.init]: signed(d.init), [FIELD.passive]: plain(d.passive), [FIELD.hitDice]: d.hitDice,
    [FIELD.spellAbility]: d.spellAbility ?? "", [FIELD.spellDc]: plain(d.spellDc), [FIELD.spellAttack]: signed(d.spellAttack), [FIELD.slots]: d.slots,
    [FIELD.spells]: spellsText(spellLines(d.spells).more), [FIELD.equipment]: equipmentText(d.equipment), [FIELD.uses]: d.uses.join("\n"),
    [FIELD.pact]: d.pact,
    [FIELD.features]: featuresText(d.features), [FIELD.notes]: d.notes,
  };
  for (let i = 0; i < CLASS_ROWS; i++) {
    const c = d.classes[i];
    out[FIELD.cls(i)] = c?.class ?? ""; out[FIELD.sub(i)] = c?.subclass ?? ""; out[FIELD.lvl(i)] = c ? String(c.level) : "";
    out[FIELD.hd(i)] = c && HIT_DIE[c.class] ? `d${HIT_DIE[c.class]}` : "";
  }
  // spellcasting: the first row is the sheet's main one (same fields as sheet 1)
  for (let i = 0; i < CAST_ROWS; i++) {
    const cst = d.casters[i];
    out[FIELD.castClass(i)] = cst?.class ?? "";
    if (i > 0) { out[FIELD.castAbility(i)] = cst?.ability ?? ""; out[FIELD.castDc(i)] = plain(cst?.dc); out[FIELD.castAttack(i)] = signed(cst?.attack); }
  }
  for (let l = 1; l <= 9; l++) { out[FIELD.slotTotal(l)] = d.slotsBy[l] ? String(d.slotsBy[l]) : ""; out[FIELD.slotUsed(l)] = ""; }
  const { lines } = spellLines(d.spells);
  for (const [l, n] of Object.entries(SPELL_LINES)) {
    for (let i = 0; i < n; i++) { out[FIELD.spell(Number(l), i)] = lines[Number(l)]?.[i] ?? ""; out[FIELD.prep(Number(l), i)] = false; }
  }
  for (const a of ABILITIES) {
    const sc = d.scores[a];
    out[FIELD.score(a)] = plain(sc);
    out[FIELD.mod(a)] = sc == null ? "" : signed(abilityMod(sc));
    out[FIELD.save(a)] = d.saves.includes(a);
    out[FIELD.saveTotal(a)] = signed(d.saveTotals[a]);
  }
  for (const s of Object.keys(SKILLS)) {
    out[FIELD.skill(s)] = d.skills.includes(s);
    out[FIELD.exp(s)] = d.expertise.includes(s);
    out[FIELD.skillTotal(s)] = signed(d.skillTotals[s]);
  }
  for (let i = 0; i < ATTACK_ROWS; i++) {
    const a = d.attacks[i];
    out[FIELD.atk(i, "name")] = a?.name ?? ""; out[FIELD.atk(i, "bonus")] = a?.bonus ?? "";
    out[FIELD.atk(i, "damage")] = a?.damage ?? ""; out[FIELD.atk(i, "notes")] = a?.notes ?? "";
  }
  for (const c of COIN_KEYS) out[FIELD.coin(c)] = d.coins[c] ? String(d.coins[c]) : "";
  return out;
}

// ---------------------------------------------------------------------------
// Reading a filled-in sheet back
// ---------------------------------------------------------------------------

/** Is this our own sheet? */
export const isOwnSheet = (fields: PdfField[]) => fields.some((f) => f.name === FIELD.kind && f.value.startsWith("lth-sheet"));

const int = (s: string | undefined): number | null => {
  const m = (s ?? "").replace(/[−–]/g, "-").match(/[+-]?\s*\d+/);
  return m ? Number(m[0].replace(/\s/g, "")) : null;
};
const isOn = (v: string | undefined) => !!v && !/^(off|false|no|0|--)$/i.test(v.trim());

export type OwnSheet = ImportedSheet & { bonuses: Bonuses; characterId: string | null };

export function fromFields(fields: PdfField[]): OwnSheet {
  const byName = new Map<string, string>();
  for (const f of fields) if (!byName.has(f.name) || (!byName.get(f.name) && f.value)) byName.set(f.name, f.value.replace(/\r\n?/g, "\n"));
  const get = (n: string) => (byName.get(n) ?? "").trim();
  const s = emptySheet("form") as OwnSheet;

  s.name = get(FIELD.name).slice(0, 60);
  s.playerName = get(FIELD.player).slice(0, 40);
  s.species = get(FIELD.species).slice(0, 40);
  s.background = get(FIELD.background).slice(0, 40);
  s.alignment = get(FIELD.alignment).slice(0, 40);
  s.characterId = /^[0-9a-f-]{36}$/.test(get(FIELD.id)) ? get(FIELD.id) : null;

  for (let i = 0; i < CLASS_ROWS; i++) {
    const raw = get(FIELD.cls(i)).split(/,\s*/).filter(Boolean).pop() ?? ""; // a list box can hold more than one pick: the last one counts
    if (!raw || /^(other|—|-)/i.test(raw) && !get(FIELD.sub(i))) continue;
    const { cls, sub, lvl } = readClass(raw, get(FIELD.sub(i)), get(FIELD.lvl(i)));
    const level = Math.max(1, Math.min(20, lvl ?? 1));
    if (cls) {
      const same = s.classes.find((x) => x.class === cls);
      if (same) same.level = Math.min(20, same.level + level); // the same class twice: add the levels up
      else s.classes.push({ class: cls, subclass: sub.slice(0, 40), level });
    } else s.unknownClasses.push(`${raw.replace(/\s*\d+\s*$/, "")}${sub ? ` (${sub})` : ""} ${level}`.slice(0, 40));
  }
  if (s.unknownClasses.length) s.warnings.push(`The app doesn't have ${s.unknownClasses.join(", ")} yet (only the 12 classes from the free rules). Pick the closest one, or keep it as a note.`);

  for (const a of ABILITIES) { const n = int(get(FIELD.score(a))); if (n != null && n > 0) s.scores[a] = Math.min(30, n); }
  s.saves = ABILITIES.filter((a) => isOn(byName.get(FIELD.save(a))));
  s.skills = Object.keys(SKILLS).filter((k) => isOn(byName.get(FIELD.skill(k))) || isOn(byName.get(FIELD.exp(k))));
  s.expertise = Object.keys(SKILLS).filter((k) => isOn(byName.get(FIELD.exp(k))));

  const pos = (n: number | null, hi: number) => (n != null && n > 0 && n <= hi ? n : null);
  s.hp = pos(int(get(FIELD.hp)), 999);
  s.ac = pos(int(get(FIELD.ac)), 40);
  s.speed = pos(int(get(FIELD.speed)), 120);
  s.profBonus = pos(int(get(FIELD.prof)), 9);

  for (let i = 0; i < ATTACK_ROWS; i++) {
    const name = get(FIELD.atk(i, "name"));
    if (!name) continue;
    const bonusText = get(FIELD.atk(i, "bonus"));
    const dmg = get(FIELD.atk(i, "damage"));
    const m = dmg.match(/^([\dd+\-\s]+?)\s+([a-z][a-z ]*)$/i); // "1d8+4 piercing"
    const row: SheetAttack = {
      name: name.slice(0, 60),
      bonus: /dc/i.test(bonusText) ? null : int(bonusText), // "DC 15" is a save, not a to-hit bonus
      damage: (m ? m[1] : dmg).replace(/\s/g, "").slice(0, 30),
      damageType: (m ? m[2] : "").trim().toLowerCase().slice(0, 20),
      notes: [get(FIELD.atk(i, "notes")), /dc/i.test(bonusText) ? bonusText : ""].filter(Boolean).join(" · ").slice(0, 120),
    };
    s.attacks.push(row);
  }

  const abil = get(FIELD.spellAbility).toUpperCase().slice(0, 3);
  s.spellAbility = (ABILITIES as readonly string[]).includes(abil) ? (abil as Ability) : null;
  // sheet 2: a line per spell (cantrips to level 9), then "More spells"; sheet 1 only has the text box
  const lined: string[] = [];
  for (const [l, n] of Object.entries(SPELL_LINES)) for (let i = 0; i < n; i++) { const v = get(FIELD.spell(Number(l), i)); if (v) lined.push(v); }
  s.spells = [...new Set([...lined, ...get(FIELD.spells).split(/\n+/)
    .map((l) => l.replace(/^\s*(cantrips?|level\s*\d+|\d+(st|nd|rd|th)?(\s*level)?)\s*[:.\-–]\s*/i, ""))
    .flatMap((l) => l.split(/,|;/)).map((x) => x.replace(/\s*\((?:ritual|r|c|concentration)\)\s*$/i, "").trim())
    .filter((x) => /[a-z]/i.test(x))].map((x) => x.replace(/\s*\((?:ritual|r|c|concentration)\)\s*$/i, "").trim()))].slice(0, 120);

  for (const line of get(FIELD.equipment).split(/\n+/)) {
    const t = line.replace(/\s*\((?:equipped|e)\)\s*$/i, "").replace(/^[\s•*\-–]+/, "").trim();
    if (!t) continue;
    const q = t.match(/^(.*?)\s*[x×]\s*(\d+)\s*$/i) ?? t.match(/^(\d+)\s*[x×]?\s+(.+)$/);
    const [name, qty] = q ? (/^\d+$/.test(q[1]) ? [q[2], Number(q[1])] : [q[1], Number(q[2])]) : [t, 1];
    if (name) s.equipment.push({ name: name.slice(0, 60), qty: Math.max(1, Math.min(9999, qty)) });
  }
  for (const c of COIN_KEYS) s.coins[c] = Math.max(0, int(get(FIELD.coin(c))) ?? 0);

  // features: "• Name: text" paragraphs (a line without a bullet continues the one before)
  for (const line of get(FIELD.features).split(/\n+/)) {
    const t = line.trim();
    if (!t) continue;
    const head = t.match(/^[•*\-–]\s*([^:]{1,60}?)\s*(?::\s*(.*))?$/);
    if (head) s.features.push({ name: head[1].trim(), description: (head[2] ?? "").trim() });
    else if (s.features.length) s.features[s.features.length - 1].description = `${s.features[s.features.length - 1].description} ${t}`.trim();
    else s.features.push({ name: t.slice(0, 60), description: "" });
  }
  if (s.alignment && !s.features.some((f) => /^alignment$/i.test(f.name))) s.features.push({ name: "Alignment", description: s.alignment });
  const notes = get(FIELD.notes);
  if (notes) s.features.push({ name: "Notes", description: notes.slice(0, 2000) });
  s.features = s.features.map((f) => ({ name: f.name.slice(0, 60), description: f.description.slice(0, 2000) })).slice(0, 60);

  const now = {
    init: int(get(FIELD.init)), spellDc: int(get(FIELD.spellDc)), spellAttack: int(get(FIELD.spellAttack)),
    saves: Object.fromEntries(ABILITIES.map((a) => [a, int(get(FIELD.saveTotal(a)))])) as Record<Ability, number | null>,
    skills: Object.fromEntries(Object.keys(SKILLS).map((k) => [k, int(get(FIELD.skillTotal(k)))])),
  };
  let snap: Snapshot | null = null;
  try { const j = JSON.parse(get(FIELD.snapshot) || "null"); if (j && typeof j === "object" && j.t) snap = j as Snapshot; } catch { snap = null; }
  if (!snap) { s.bonuses = bonusesFrom(s, now); return s; }
  // A total nobody touched keeps the extra it had when printed (worked out from the printed numbers);
  // a total that was changed counts against the numbers on the sheet now.
  const printed: ImportedSheet = { ...s, scores: snap.scores ?? {}, saves: snap.saves ?? [], skills: snap.skills ?? [], expertise: snap.expertise ?? [], profBonus: snap.prof ?? null, spellAbility: snap.spellAbility ?? null };
  const same = (k: string, v: number | null) => v != null && snap!.t[k] === v;
  const keep = (k: string, v: number | null) => (same(k, v) ? v : null);
  const changed = (k: string, v: number | null) => (same(k, v) ? null : v);
  const fromOld = bonusesFrom(printed, {
    init: keep("init", now.init), spellDc: keep("spellDc", now.spellDc), spellAttack: keep("spellAttack", now.spellAttack),
    saves: Object.fromEntries(ABILITIES.map((a) => [a, keep(`save:${a}`, now.saves[a])])) as Record<Ability, number | null>,
    skills: Object.fromEntries(Object.keys(SKILLS).map((k) => [k, keep(`skill:${k}`, now.skills[k])])),
  }, s.classes);
  const fromNew = bonusesFrom(s, {
    init: changed("init", now.init), spellDc: changed("spellDc", now.spellDc), spellAttack: changed("spellAttack", now.spellAttack),
    saves: Object.fromEntries(ABILITIES.map((a) => [a, changed(`save:${a}`, now.saves[a])])) as Record<Ability, number | null>,
    skills: Object.fromEntries(Object.keys(SKILLS).map((k) => [k, changed(`skill:${k}`, now.skills[k])])),
  });
  s.bonuses = cleanBonuses({
    ...fromOld, ...fromNew,
    prof: s.profBonus != null && s.profBonus !== profBonus(s.classes.reduce((n, c) => n + c.level, 0)) ? s.profBonus : undefined,
    saves: { ...fromOld.saves, ...fromNew.saves }, skills: { ...fromOld.skills, ...fromNew.skills },
  }, Object.keys(SKILLS));
  return s;
}

/**
 * Totals written on the sheet → hand-set extras: whatever the total has on top of
 * ability modifier + proficiency. A proficiency bonus that isn't the level's becomes a fixed one.
 */
export function bonusesFrom(s: ImportedSheet, t: {
  init: number | null; spellDc: number | null; spellAttack: number | null;
  saves: Record<Ability, number | null>; skills: Record<string, number | null>;
}, classes = s.classes): Bonuses {
  const level = classes.reduce((n, c) => n + c.level, 0);
  if (!level) return {};
  const auto = profBonus(level);
  const pb = s.profBonus ?? auto;
  const mod = (a: Ability) => abilityMod(s.scores[a] ?? 10);
  const out: Record<string, unknown> = { saves: {}, skills: {} };
  if (s.profBonus != null && s.profBonus !== auto) out.prof = s.profBonus;
  if (t.init != null) out.init = t.init - mod("DEX");
  for (const a of ABILITIES) { const v = t.saves[a]; if (v != null) (out.saves as Record<string, number>)[a] = v - mod(a) - (s.saves.includes(a) ? pb : 0); }
  for (const [k, v] of Object.entries(t.skills)) {
    if (v == null) continue;
    const prof = (s.skills.includes(k) ? pb : 0) + (s.expertise.includes(k) ? pb : 0);
    (out.skills as Record<string, number>)[k] = v - mod(SKILLS[k]) - prof;
  }
  if (s.spellAbility) {
    if (t.spellDc != null) out.spell_dc = t.spellDc - (8 + mod(s.spellAbility) + pb);
    if (t.spellAttack != null) out.spell_attack = t.spellAttack - (mod(s.spellAbility) + pb);
  }
  return cleanBonuses(out, Object.keys(SKILLS));
}

/**
 * A class row as players write it: "barbarian", "Barbarian 9", "Barbarian (Wild Soul)", "Fighter / Champion".
 * Returns the app's class name (or null), the subclass and the level, from whichever box they're in.
 */
export function readClass(raw: string, subBox: string, levelBox: string): { cls: string | null; sub: string; lvl: number | null } {
  let text = raw.trim();
  let lvl = int(levelBox);
  const tailNum = text.match(/\s+(\d{1,2})\s*$/);
  if (tailNum) { lvl ??= Number(tailNum[1]); text = text.slice(0, tailNum.index).trim(); }
  let sub = subBox.trim();
  const paren = text.match(/^(.*?)\s*[(/]\s*([^)]*?)\s*\)?\s*$/);
  if (paren && paren[2]) { text = paren[1].trim(); sub ||= paren[2].trim(); }
  const low = text.toLowerCase();
  const cls = CLASS_NAMES.find((c) => c.toLowerCase() === low) ?? CLASS_NAMES.find((c) => low.startsWith(c.toLowerCase())) ?? null;
  return { cls, sub, lvl };
}
