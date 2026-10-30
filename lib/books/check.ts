// Checks a filled book template and turns it into database rows.
// Errors stop the SQL from being written; warnings are things to look at; "guessed" lists what was read
// from text automatically (spell rolls, monster attacks), so a person can check it once.
// Messages are in Serbian, for the people filling the sheet.
import type { BackgroundData, KitItem, SpeciesData, SpeciesSub, Text } from "../builder/types";
import type { MonsterAction } from "../encounter/build";
import type { DataChoice, Opt, SubclassData } from "../levelup/types";
import { ALL_SKILLS } from "../builder/special";
import type { Ability } from "../rules";
import {
  ABILITY_NAMES, BOOK_FIELDS, CLASS_NAMES, DAMAGE_TYPES, FEAT_CATEGORIES, TABS,
} from "./columns";
import { choiceRows, type BookFeat, type BookRow, type BookSpecies } from "./merge";
import { cleanDice, entries, readActions } from "./monster-text";
import type { SrdIndex, SrdItem } from "./srd-index";

export type Cells = Record<string, string>;
export type SheetRow = { row: number; cells: Cells };
export type Workbook = { book: Record<string, string>; tabs: Record<string, SheetRow[]>; problems?: string[] };
export type Issue = { level: "error" | "warning" | "guess"; tab: string; row?: number; name?: string; msg: string };
type Rules = "2014" | "2024";

export type SpellRow = {
  name: string; level: number; school: string; classes: string[]; casting_time: string; ritual: boolean; range: string; components: string;
  duration: string; concentration: boolean; description: string; higher_levels: string | null; action: string; roll: Record<string, unknown> | null; book: string;
};
export type ItemRow = {
  id: string; rules: Rules; name: string; kind: string; category: string | null; rarity: string | null; attunement: boolean; cost_cp: number | null;
  weight: number | null; bundle: number | null; summary: string | null; description: string; data: Record<string, unknown> | null; book: string;
};
export type MonsterRow = { name: string; size_type: string; cr: string; cr_num: number; xp: number; ac: number; hp: number; init: number; data: Record<string, unknown>; book: string };
export type FeatRow = { name: string; category: string; prerequisite: string | null; description: string; book: string };

export type CheckResult = {
  book: { name: string; code: string; rules: string };
  issues: Issue[];
  spells: SpellRow[]; items: ItemRow[]; monsters: MonsterRow[]; feats: FeatRow[]; content: BookRow[];
};

const lc = (s: string) => s.trim().toLowerCase();
const list = (s: string) => s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
const slug = (s: string) => s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const DICE = /^(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/i;
const XP: Record<string, number> = {
  "0": 10, "1/8": 25, "1/4": 50, "1/2": 100, "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800, "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900,
  "11": 7200, "12": 8400, "13": 10000, "14": 11500, "15": 13000, "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000, "21": 33000, "22": 41000,
  "23": 50000, "24": 62000, "25": 75000, "26": 90000, "27": 105000, "28": 120000, "29": 135000, "30": 155000,
};
const ABIL_WORD: Record<string, string> = { strength: "STR", dexterity: "DEX", constitution: "CON", intelligence: "INT", wisdom: "WIS", charisma: "CHA" };

export function checkBook(wb: Workbook, srd: SrdIndex): CheckResult {
  const issues: Issue[] = (wb.problems ?? []).map((msg) => ({ level: "error", tab: "Fajl", msg }));
  const out: CheckResult = { book: { name: "", code: "", rules: "" }, issues, spells: [], items: [], monsters: [], feats: [], content: [] };

  // ---------------------------------------------------------------- the book itself
  const bookName = (wb.book.book ?? "").trim();
  const code = (wb.book.code ?? "").trim();
  const defRules = lc(wb.book.rules ?? "");
  if (!bookName) issues.push({ level: "error", tab: "Book", msg: `Upiši "${BOOK_FIELDS[0].label}" (ime knjige).` });
  if (!/^[A-Za-z0-9]{2,8}$/.test(code)) issues.push({ level: "error", tab: "Book", msg: `"${BOOK_FIELDS[1].label}" mora imati 2–8 slova ili cifara (npr. XGE). Sada: "${code}".` });
  if (!["2014", "2024", "both"].includes(defRules)) issues.push({ level: "error", tab: "Book", msg: `"Rules" mora biti 2014, 2024 ili both. Sada: "${wb.book.rules ?? ""}".` });
  out.book = { name: bookName, code: code.toUpperCase(), rules: defRules };
  const book = bookName;
  const prefix = slug(code) || "book";

  // ---------------------------------------------------------------- cell helpers (they report problems)
  let tab = "", row = 0, name = "";
  const err = (msg: string) => issues.push({ level: "error", tab, row, name: name || undefined, msg });
  const warn = (msg: string) => issues.push({ level: "warning", tab, row, name: name || undefined, msg });
  const guess = (msg: string) => issues.push({ level: "guess", tab, row, name: name || undefined, msg });
  const colOf = (key: string) => TABS.find((t) => t.name === tab)!.cols.find((c) => c.key === key)!;
  const head = (key: string) => `"${colOf(key).header}"`;

  const yes = (c: Cells, key: string, dflt = false): boolean => {
    const v = lc(c[key] ?? "");
    if (!v) return dflt;
    if (["yes", "y", "true", "da", "1", "x", "✓"].includes(v)) return true;
    if (["no", "n", "false", "ne", "0", "-"].includes(v)) return false;
    err(`${head(key)} mora biti Yes ili No (sada: "${c[key]}").`);
    return dflt;
  };
  const num = (c: Cells, key: string, o: { min?: number; max?: number; int?: boolean } = {}): number | null => {
    const raw = (c[key] ?? "").trim();
    if (!raw) return null;
    const n = Number(raw.replace(",", ".").replace(/\s*(ft\.?|feet|lb\.?)$/i, ""));
    if (!Number.isFinite(n) || (o.int && !Number.isInteger(n)) || (o.min !== undefined && n < o.min) || (o.max !== undefined && n > o.max)) {
      err(`${head(key)} mora biti ${o.int ? "ceo " : ""}broj${o.min !== undefined ? ` od ${o.min}` : ""}${o.max !== undefined ? ` do ${o.max}` : ""} (sada: "${raw}").`);
      return null;
    }
    return n;
  };
  const pick = (c: Cells, key: string, allowed: string[]): string | null => {
    const raw = (c[key] ?? "").trim();
    if (!raw) return null;
    const hit = allowed.find((a) => lc(a) === lc(raw));
    if (!hit) { err(`${head(key)}: "${raw}" nije dozvoljeno. Može: ${allowed.join(", ")}.`); return null; }
    return hit;
  };
  const dice = (c: Cells, key: string): string | null => {
    const raw = (c[key] ?? "").trim();
    if (!raw) return null;
    const d = cleanDice(raw);
    if (!DICE.test(d)) { err(`${head(key)} nije ispravno bacanje kockica (npr. 2d6+3). Sada: "${raw}".`); return null; }
    return d.toLowerCase();
  };
  const rulesOf = (c: Cells): Rules[] => {
    const v = lc(c.rules ?? "") || defRules;
    if (v === "both") return ["2014", "2024"];
    if (v === "2014" || v === "2024") return [v];
    if ((c.rules ?? "").trim()) err(`"Rules" mora biti 2014, 2024 ili both (sada: "${c.rules}").`); // an empty cell: the Book tab's error says it once
    return [];
  };
  const abilities = (s: string, key: string): { a: string; b: number }[] => {
    const outA: { a: string; b: number }[] = [];
    for (const part of list(s)) {
      const m = part.match(/^([A-Za-z]+)\s*([+-]\s*\d+)$/);
      const a = m ? (ABIL_WORD[lc(m[1])] ?? m[1].toUpperCase()) : "";
      if (!m || !ABILITY_NAMES.includes(a)) { err(`${head(key)}: "${part}" nije u obliku "DEX +2".`); continue; }
      outA.push({ a, b: Number(m[2].replace(/\s/g, "")) });
    }
    return outA;
  };
  const skills = (s: string, key: string): string[] => list(s).flatMap((x) => {
    const hit = ALL_SKILLS.find((k) => lc(k) === lc(x));
    if (!hit) { err(`${head(key)}: "${x}" nije veština. Veštine: ${ALL_SKILLS.join(", ")}.`); return []; }
    return [hit];
  });
  const required = (cells: Cells) => {
    for (const col of TABS.find((t) => t.name === tab)!.cols) if (col.required && !(cells[col.key] ?? "").trim()) err(`Kolona "${col.header}" je obavezna.`);
  };
  const each = (tabName: string, fn: (c: Cells) => void) => {
    tab = tabName;
    for (const r of wb.tabs[tabName] ?? []) {
      row = r.row; name = (r.cells.name ?? r.cells.subclass ?? r.cells.monster ?? r.cells.species ?? "").trim();
      required(r.cells);
      fn(r.cells);
    }
    row = 0; name = "";
  };
  const seen = new Map<string, number>();
  const dup = (key: string, label: string) => {
    if (seen.has(key)) { err(`${label} se ponavlja (već u redu ${seen.get(key)}).`); return true; }
    seen.set(key, row); return false;
  };

  // names that exist in this book (for cross-checks between tabs)
  const bookSpells = new Set((wb.tabs.Spells ?? []).map((r) => lc(r.cells.name ?? "")));
  const bookFeatNames = new Set((wb.tabs.Feats ?? []).map((r) => lc(r.cells.name ?? "")));
  const spellExists = (s: string) => srd.spells.has(lc(s)) || bookSpells.has(lc(s));

  // ---------------------------------------------------------------- spells
  each("Spells", (c) => {
    if (!c.name) return;
    if (dup(`spell:${lc(c.name)}`, "Spell")) return;
    if (srd.spells.has(lc(c.name))) return err(`"${c.name}" već postoji u SRD-u. Isto ime ne može dva puta (preimenuj, npr. "${c.name} (${code})", ili ga izostavi).`);
    const level = num(c, "level", { min: 0, max: 9, int: true });
    const school = pick(c, "school", ["Abjuration", "Conjuration", "Divination", "Enchantment", "Evocation", "Illusion", "Necromancy", "Transmutation"]);
    const classes = list(c.classes ?? "").map((x) => {
      const hit = CLASS_NAMES.find((k) => lc(k) === lc(x));
      if (!hit) warn(`Klasa "${x}" ne postoji u aplikaciji (spell će ipak biti sačuvan, ali ga ta klasa neće videti na listi).`);
      return hit ?? x;
    });
    const duration = (c.duration ?? "").trim();
    const conc = (c.concentration ?? "").trim() ? yes(c, "concentration") : /^concentration/i.test(duration);
    const ct = lc(c.casting_time ?? "");
    const action = /^(1 )?action\b/.test(ct) ? "action" : /bonus action/.test(ct) ? "bonus" : /reaction/.test(ct) ? "reaction" : "other";
    const desc = (c.description ?? "").trim();

    // the roll: what the sheet says, or a guess from the description
    let kind = pick(c, "roll", ["none", "attack", "save", "heal", "damage"]);
    let d = dice(c, "dice");
    let dtype = pick(c, "damage_type", DAMAGE_TYPES);
    let save = pick(c, "save", ABILITY_NAMES);
    let half: boolean | null = (c.half ?? "").trim() ? yes(c, "half") : null;
    const perLevel = dice(c, "per_level");
    const guessed: string[] = [];
    if (!kind) {
      const t = desc.toLowerCase();
      kind = /spell attack/.test(t) ? "attack" : /saving throw/.test(t) && /\d+d\d+/.test(t) ? "save" : /regains? .*hit points/.test(t) && /\d+d\d+/.test(t) ? "heal" : /\d+d\d+ \w+ damage/.test(t) ? "damage" : "none";
      if (kind !== "none") guessed.push(`roll = ${kind}`);
    }
    if (kind !== "none") {
      const m = desc.match(/(\d+d\d+(?:\s*\+\s*\d+)?)\s+(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder)\s+damage/i);
      if (!d) { d = m ? cleanDice(m[1]).toLowerCase() : (desc.match(/\d+d\d+/)?.[0] ?? null); if (d) guessed.push(`dice = ${d}`); }
      if (!dtype && m && kind !== "heal") { dtype = m[2][0].toUpperCase() + m[2].slice(1).toLowerCase(); guessed.push(`damage type = ${dtype}`); }
      if (kind === "save" && !save) {
        const s = desc.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i);
        if (s) { save = ABIL_WORD[lc(s[1])]; guessed.push(`save = ${save}`); }
      }
      if (kind === "save" && half === null) { half = /half as much|half damage/i.test(desc); guessed.push(`half on save = ${half ? "Yes" : "No"}`); }
      if (!d) err(`Roll je "${kind}" ali nema kocki: popuni ${head("dice")}.`);
      if (kind === "save" && !save) err(`Roll je "save": popuni ${head("save")} (koji atribut).`);
    }
    if (guessed.length) guess(`Iz opisa: ${guessed.join(", ")}. Proveri, pa po potrebi upiši u kolone sam(a).`);
    const kindMap: Record<string, string> = { attack: "spell_attack", save: "save", heal: "heal", damage: "damage_only" };
    const roll = kind && kind !== "none" && d ? {
      kind: kindMap[kind], damage: d, ...(dtype ? { damage_type: lc(dtype) } : {}),
      ...(kind === "save" ? { save_ability: save, half_on_save: !!half } : {}),
      ...(perLevel ? { per_level: perLevel } : {}),
      ...(yes(c, "add_mod") ? { add_mod: true } : {}),
      ...(level === 0 && kind !== "heal" ? { cantrip_scaling: true } : {}),
    } : null;
    if (level === null || !school) return;
    out.spells.push({
      name: c.name.trim(), level, school, classes, casting_time: (c.casting_time ?? "").trim(), ritual: yes(c, "ritual"), range: (c.range ?? "").trim(),
      components: (c.components ?? "").trim(), duration, concentration: conc, description: desc, higher_levels: (c.higher_levels ?? "").trim() || null,
      action, roll, book,
    });
  });

  // ---------------------------------------------------------------- items
  const bookItems: ItemRow[] = [];
  each("Items", (c) => {
    if (!c.name) return;
    const kind = pick(c, "kind", ["gear", "weapon", "armor", "ammo", "tool", "pack", "mount", "magic"]);
    const rarity = pick(c, "rarity", ["Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact", "Varies"]);
    let cost: number | null = null;
    const rawCost = (c.cost ?? "").trim();
    if (rawCost) {
      const m = rawCost.replace(",", ".").match(/^([\d.]+)\s*(cp|sp|ep|gp|pp)?$/i);
      if (!m) err(`${head("cost")} mora biti npr. "25 gp" ili "5 sp" (sada: "${rawCost}").`);
      else cost = Math.round(Number(m[1]) * ({ cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 }[lc(m[2] ?? "gp") as "gp"]));
    }
    const weight = num(c, "weight", { min: 0 });
    const bundle = num(c, "bundle", { min: 1, int: true });
    const dmg = dice(c, "damage");
    const dtype = pick(c, "damage_type", DAMAGE_TYPES);
    const versatile = dice(c, "versatile");
    const mastery = pick(c, "mastery", ["Cleave", "Graze", "Nick", "Push", "Sap", "Slow", "Topple", "Vex"]);
    const props = list(c.properties ?? "");
    let range: { normal: number; long?: number } | null = null;
    if ((c.range ?? "").trim()) {
      const m = c.range.replace(/\s*(ft\.?|feet)/gi, "").match(/^(\d+)\s*(?:\/\s*(\d+))?$/);
      if (!m) err(`${head("range")} mora biti npr. "80/320" (sada: "${c.range}").`);
      else range = { normal: Number(m[1]), ...(m[2] ? { long: Number(m[2]) } : {}) };
    }
    const ac = num(c, "ac", { min: 0, max: 30, int: true });
    const maxDex = num(c, "max_dex", { min: 0, max: 10, int: true });
    let data: Record<string, unknown> | null = null;
    if (dmg) {
      if (!dtype) err(`Oružje ima ${head("damage")} ali nema ${head("damage_type")}.`);
      data = { damage: dmg, type: dtype ?? "", props, ...(versatile ? { twoHanded: versatile } : {}), ...(mastery ? { mastery } : {}), range: range ?? { normal: 5 } };
    } else if (kind === "weapon") warn(`Kind je weapon, ali nema ${head("damage")}: neće moći da se napada njime.`);
    if (ac !== null) data = { ...(data ?? {}), ac: { base: ac, dex_bonus: yes(c, "dex"), ...(maxDex !== null ? { max_bonus: maxDex } : {}) } };
    else if (kind === "armor") warn(`Kind je armor, ali nema ${head("ac")}: AC se neće računati.`);
    const summary = (c.summary ?? "").trim() || (dmg ? `${dmg} ${dtype ?? ""}${props.length ? " · " + props.join(", ") : ""}${versatile ? ` · Versatile (${versatile})` : ""}${mastery ? ` · Mastery: ${mastery}` : ""}`.replace(/\s+·/g, " ·").trim()
      : ac !== null ? (/shield/i.test(c.category ?? "") ? `+${ac} AC` : `AC ${ac}`) : null);
    for (const r of rulesOf(c)) {
      const id = `${r}:${prefix}-${slug(c.name)}`;
      if (dup(`item:${id}`, `Predmet "${c.name}" (${r})`)) continue;
      if (srd.items.some((i) => i.rules === r && lc(i.name) === lc(c.name))) warn(`"${c.name}" već postoji u SRD-u (${r}). Biće dva predmeta istog imena; ako je isti predmet, izostavi ga.`);
      if (!kind) continue;
      const it: ItemRow = {
        id, rules: r, name: c.name.trim(), kind, category: (c.category ?? "").trim() || null, rarity, attunement: yes(c, "attunement"),
        cost_cp: cost, weight, bundle, summary, description: (c.description ?? "").trim(), data, book,
      };
      bookItems.push(it);
      out.items.push(it);
    }
  });

  // ---------------------------------------------------------------- monsters
  const attackRows = new Map<string, Cells[]>();
  each("Monster Attacks", (c) => {
    if (!c.monster) return;
    if (!(wb.tabs.Monsters ?? []).some((m) => lc(m.cells.name ?? "") === lc(c.monster))) err(`Čudovište "${c.monster}" ne postoji na tabu Monsters.`);
    const k = lc(c.monster);
    attackRows.set(k, [...(attackRows.get(k) ?? []), { ...c, __row: String(row) }]);
  });
  each("Monsters", (c) => {
    if (!c.name) return;
    if (dup(`monster:${lc(c.name)}`, "Čudovište")) return;
    if (srd.monsters.has(lc(c.name))) return err(`"${c.name}" već postoji u SRD-u. Preimenuj (npr. "${c.name} (${code})") ili izostavi.`);
    const ac = num(c, "ac", { min: 1, max: 30, int: true });
    const hp = num(c, "hp", { min: 1, max: 1000, int: true });
    const scores: Record<string, number> = {};
    for (const a of ABILITY_NAMES) { const v = num(c, lc(a), { min: 1, max: 30, int: true }); if (v !== null) scores[a] = v; }
    const cr = (c.cr ?? "").trim().replace("⅛", "1/8").replace("¼", "1/4").replace("½", "1/2");
    if (cr && !(cr in XP)) err(`${head("cr")} mora biti 0, 1/8, 1/4, 1/2 ili 1–30 (sada: "${c.cr}").`);
    const mod = (s: number) => Math.floor((s - 10) / 2);
    const saves: Record<string, number> = {};
    for (const part of list(c.saves ?? "")) {
      const m = part.match(/^([A-Za-z]+)\s*([+-]\s*\d+)$/);
      const a = m ? (ABIL_WORD[lc(m[1])] ?? m[1].toUpperCase()) : "";
      if (!m || !ABILITY_NAMES.includes(a)) err(`${head("saves")}: "${part}" nije u obliku "DEX +4".`);
      else saves[a] = Number(m[2].replace(/\s/g, ""));
    }
    const init = num(c, "initiative", { min: -10, max: 20, int: true });
    const legendary = num(c, "legendary_uses", { min: 1, max: 5, int: true });

    // attacks: from the Monster Attacks tab if there are rows for it, otherwise read from the text
    const parsed = readActions(c.actions ?? "");
    const bonusParsed = readActions(c.bonus_actions ?? "");
    let actions: MonsterAction[] = parsed.actions;
    let multiattack = parsed.multiattack;
    const manual = attackRows.get(lc(c.name));
    if (manual) {
      actions = [];
      multiattack = undefined;
      const saveTab = tab, saveRow = row;
      tab = "Monster Attacks";
      for (const m of manual) {
        row = Number(m.__row);
        const type = pick(m, "type", ["attack", "save", "multiattack"]);
        if (type === "multiattack") {
          const count = num(m, "count", { min: 1, max: 10, int: true }) ?? 1;
          multiattack = { count, uses: list(m.uses ?? "") };
          actions.push({ name: "Multiattack", kind: "multiattack", count });
          continue;
        }
        const dmg = dice(m, "damage");
        if (!dmg) { err(`Napad "${m.action}" nema ${head("damage")}.`); continue; }
        const dt = (pick(m, "damage_type", DAMAGE_TYPES) ?? "").toLowerCase();
        const extra = { ...(num(m, "recharge", { min: 2, max: 6, int: true }) ? { recharge: Number(m.recharge) } : {}), ...(num(m, "per_day", { min: 1, max: 10, int: true }) ? { per_day: Number(m.per_day) } : {}) };
        if (type === "attack") {
          const bonus = num(m, "bonus", { min: -5, max: 30, int: true });
          if (bonus === null) err(`Napad "${m.action}": popuni ${head("bonus")}.`);
          actions.push({ name: m.action.trim(), kind: "attack", bonus: bonus ?? 0, damage: dmg, damage_type: dt, ranged: yes(m, "ranged"), ...extra });
        } else if (type === "save") {
          const sv = pick(m, "save", ABILITY_NAMES);
          const dc = num(m, "dc", { min: 5, max: 30, int: true });
          if (!sv || dc === null) err(`Napad "${m.action}" (save): popuni ${head("save")} i ${head("dc")}.`);
          actions.push({ name: m.action.trim(), kind: "save", save_ability: (sv ?? "DEX") as MonsterAction["save_ability"], dc: dc ?? 10, damage: dmg, damage_type: dt,
            half: yes(m, "half"), targets: num(m, "targets", { min: 1, max: 10, int: true }) ?? 1, ...extra });
        }
      }
      if (multiattack) for (const u of multiattack.uses) if (!actions.some((a) => lc(a.name) === lc(u))) err(`Multiattack koristi "${u}", a taj napad nije u listi.`);
      tab = saveTab; row = saveRow;
    } else {
      const attacks = parsed.actions.filter((a) => a.kind !== "multiattack");
      if (attacks.length) guess(`Napadi pročitani iz Actions: ${attacks.map((a) => a.kind === "attack" ? `${a.name} +${a.bonus} ${a.damage} ${a.damage_type}` : `${a.name} DC ${a.dc} ${a.save_ability} ${a.damage}`).join("; ")}${multiattack ? `; Multiattack ${multiattack.count}× (${multiattack.uses.join(", ")})` : ""}.`);
      else warn(`Nijedan napad nije pročitan iz Actions: Battle planner neće znati koliko udara. Dodaj ga na tab Monster Attacks.`);
      if (parsed.unread.length) warn(`Ne mogu da pročitam: ${parsed.unread.join(", ")}. Ako je to napad, dodaj ga na tab Monster Attacks.`);
    }
    if (ac === null || hp === null || !cr || !(cr in XP) || Object.keys(scores).length < 6) return;
    const sections: Record<string, string[]> = {};
    const sec = (label: string, key: string) => { const e = entries(c[key] ?? ""); if (e.length) sections[label] = e; };
    sec("Traits", "traits"); sec("Actions", "actions"); sec("Bonus Actions", "bonus_actions"); sec("Reactions", "reactions"); sec("Legendary Actions", "legendary_actions");
    const crNum = cr.includes("/") ? Number(cr.split("/")[0]) / Number(cr.split("/")[1]) : Number(cr);
    const data = {
      name: c.name.trim(), size_type: (c.size_type ?? "").trim(), ac, init: init ?? mod(scores.DEX), hp, hp_dice: (c.hit_dice ?? "").trim() || undefined,
      speed: (c.speed ?? "").trim(),
      abilities: Object.fromEntries(ABILITY_NAMES.map((a) => [a, { mod: mod(scores[a]), save: saves[a] ?? mod(scores[a]) }])),
      senses: (c.senses ?? "").trim() || undefined, languages: (c.languages ?? "").trim() || undefined, skills: (c.skills ?? "").trim() || undefined,
      resistances: (c.resistances ?? "").trim() || undefined, immunities: (c.immunities ?? "").trim() || undefined, vulnerabilities: (c.vulnerabilities ?? "").trim() || undefined,
      cr, cr_num: crNum, xp: XP[cr], sections, actions, ...(multiattack ? { multiattack } : {}),
      bonus_actions: bonusParsed.actions.filter((a) => a.kind === "attack"), ...(legendary ? { legendary_uses: legendary } : {}),
    };
    out.monsters.push({ name: data.name, size_type: data.size_type, cr, cr_num: crNum, xp: XP[cr], ac, hp, init: data.init, data: JSON.parse(JSON.stringify(data)), book });
  });

  // ---------------------------------------------------------------- feats
  const featsFor: Record<Rules, Set<string>> = {
    "2014": new Set([...srd.rules["2014"].feats.map((f) => lc(f.name))]),
    "2024": new Set([...srd.rules["2024"].feats.map((f) => lc(f.name))]),
  };
  each("Feats", (c) => {
    if (!c.name) return;
    const rs = rulesOf(c);
    if (srd.feats.has(lc(c.name)) || rs.some((r) => featsFor[r].has(lc(c.name)))) return err(`Feat "${c.name}" već postoji u SRD-u.`);
    if (dup(`feat:${lc(c.name)}`, "Feat")) return;
    const cat = (c.category ?? "").trim();
    const catOk = FEAT_CATEGORIES.find((x) => lc(x) === lc(cat));
    if (rs.includes("2024") && !catOk) err(`${head("category")} za 2024 mora biti: ${FEAT_CATEGORIES.join(", ")} (sada: "${cat}").`);
    const f: BookFeat = { name: c.name.trim(), category: catOk ?? (cat || "General"), prereq: (c.prerequisite ?? "").trim() || null, text: (c.text ?? "").trim() };
    for (const r of rs) {
      out.content.push({ kind: "feat", rules: r, parent: "", name: f.name, book, data: f });
      featsFor[r].add(lc(f.name));
    }
    out.feats.push({ name: f.name, category: f.category ?? "General", prerequisite: f.prereq, description: f.text, book });
  });

  // ---------------------------------------------------------------- subclasses
  const subs = new Map<string, { rules: Rules; cls: string; data: SubclassData; choices: { level: number; title: string; choose: number; options: DataChoice["options"] }[] }>();
  const subKey = (r: string, cls: string, s: string) => `${r}|${lc(cls)}|${lc(s)}`;
  each("Subclasses", (c) => {
    if (!c.subclass) return;
    const cls = pick(c, "class", CLASS_NAMES);
    if (!cls) return;
    for (const r of rulesOf(c)) {
      if (dup(`sub:${r}:${lc(cls)}:${lc(c.subclass)}`, `Subklasa "${c.subclass}" (${r})`)) continue;
      if (srd.rules[r].classes[cls]?.subclasses.some((s) => lc(s.name) === lc(c.subclass))) { err(`${cls} već ima subklasu "${c.subclass}" u SRD-u (${r}).`); continue; }
      subs.set(subKey(r, cls, c.subclass), { rules: r, cls, choices: [], data: { name: c.subclass.trim(), flavor: (c.flavor ?? "").trim(), text: (c.text ?? "").trim(), levels: {}, choices: {} } });
    }
  });
  each("Subclass Features", (c) => {
    if (!c.subclass) return;
    const cls = pick(c, "class", CLASS_NAMES);
    const level = num(c, "level", { min: 1, max: 20, int: true });
    if (!cls || level === null) return;
    for (const r of rulesOf(c)) {
      const s = subs.get(subKey(r, cls, c.subclass));
      if (!s) { err(`Subklasa "${c.subclass}" (${cls}, ${r}) ne postoji na tabu Subclasses.`); continue; }
      const at = srd.rules[r].classes[cls]?.subclassLevel ?? 3;
      if (level < at) warn(`${cls} bira subklasu na nivou ${at} (${r}), a ova osobina je na nivou ${level}: lik je neće dobiti dok ne izabere subklasu.`);
      (s.data.levels[String(level)] ??= []).push({ name: (c.feature ?? "").trim(), text: (c.text ?? "").trim() });
    }
  });
  each("Subclass Choices", (c) => {
    if (!c.subclass) return;
    const cls = pick(c, "class", CLASS_NAMES);
    const level = num(c, "level", { min: 1, max: 20, int: true });
    const choose = num(c, "choose", { min: 1, max: 20, int: true });
    if (!cls || level === null || choose === null) return;
    for (const r of rulesOf(c)) {
      const s = subs.get(subKey(r, cls, c.subclass));
      if (!s) { err(`Subklasa "${c.subclass}" (${cls}, ${r}) ne postoji na tabu Subclasses.`); continue; }
      const raw = (c.options ?? "").trim();
      let options: DataChoice["options"];
      if (srd.rules[r].options[lc(raw)]) options = lc(raw);
      else {
        const opts: Opt[] = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => {
          const m = l.match(/^([^:]{1,60}):\s*(.*)$/);
          return m ? { name: m[1].trim(), text: m[2].trim() } : { name: l.slice(0, 60), text: "" };
        });
        if (opts.length < choose) err(`${head("options")}: ima ${opts.length} opcija, a bira se ${choose}. Svaka opcija u svom redu (Alt+Enter), "Ime: tekst". Gotove liste za ${r}: ${Object.keys(srd.rules[r].options).join(", ") || "nema"}.`);
        options = opts;
      }
      s.choices.push({ level, title: (c.title ?? "").trim(), choose, options });
    }
  });
  for (const s of subs.values()) {
    tab = "Subclasses"; name = s.data.name;
    if (!Object.keys(s.data.levels).length) warn(`Subklasa "${s.data.name}" (${s.cls}, ${s.rules}) nema nijednu osobinu na tabu Subclass Features.`);
    const data: SubclassData = { ...s.data, choices: choiceRows(s.choices, s.data.name) };
    out.content.push({ kind: "subclass", rules: s.rules, parent: s.cls, name: s.data.name, book, data });
  }
  name = "";

  // ---------------------------------------------------------------- species
  const species = new Map<string, BookSpecies>();
  const spKey = (r: string, s: string) => `${r}|${lc(s)}`;
  const cantripCheck = (names: string[], key: string) => names.forEach((n) => { if (!spellExists(n)) warn(`${head(key)}: spell "${n}" nije ni u SRD-u ni na tabu Spells.`); });
  each("Species", (c) => {
    if (!c.name) return;
    const speed = num(c, "speed", { min: 0, max: 120, int: true });
    const size = (c.size ?? "").trim();
    const given = skills(c.skills_given ?? "", "skills_given");
    let skillChoice: { choose: number; from: string[]; why: string } | undefined;
    if ((c.skill_choice ?? "").trim()) {
      const m = c.skill_choice.trim().match(/^(\d+)\s+from\s+(.+)$/i);
      if (!m) err(`${head("skill_choice")} mora biti npr. "1 from any" ili "2 from Insight, Perception".`);
      else skillChoice = { choose: Number(m[1]), from: lc(m[2]) === "any" ? ALL_SKILLS : skills(m[2], "skill_choice"), why: c.name.trim() };
    }
    const cantrips = list(c.cantrips_given ?? "");
    cantripCheck(cantrips, "cantrips_given");
    const cantripFrom = pick(c, "cantrip_from", CLASS_NAMES);
    const hpl = num(c, "hp_per_level", { min: 1, max: 5, int: true });
    let asiChoice: SpeciesData["asiChoice"];
    if ((c.ability_choice ?? "").trim()) {
      const m = c.ability_choice.trim().match(/^(\d+)\s*\+\s*(\d+)/);
      if (!m) err(`${head("ability_choice")} mora biti npr. "2 +1" (dva atributa po +1).`);
      else asiChoice = { choose: Number(m[1]), bonus: Number(m[2]), from: ABILITY_NAMES as Ability[] };
    }
    const asi = abilities(c.ability_bonuses ?? "", "ability_bonuses") as SpeciesData["asi"];
    for (const r of rulesOf(c)) {
      if (dup(`species:${r}:${lc(c.name)}`, `Rasa "${c.name}" (${r})`)) continue;
      if (srd.builder[r].species.some((s) => lc(s.name) === lc(c.name))) { err(`Rasa "${c.name}" već postoji (${r}). Za novu podrasu koristi samo tab Subspecies.`); continue; }
      if (r === "2024" && asi.length) warn(`2024 rase nemaju bonuse na atribute (dolaze od backgrounda); ${head("ability_bonuses")} se ipak čuva.`);
      species.set(spKey(r, c.name), {
        name: c.name.trim(), speed: speed ?? 30, size, traits: [], asi, ...(asiChoice ? { asiChoice } : {}),
        ...((c.languages ?? "").trim() ? { languages: c.languages.trim() } : {}), subs: [], book,
        gives: { skills: given, cantrips, ...(hpl ? { hpPerLevel: hpl } : {}) },
        needs: {
          ...(skillChoice ? { skills: skillChoice } : {}), ...(yes(c, "origin_feat") ? { feat: true } : {}),
          ...(cantripFrom ? { cantrip: { list: cantripFrom, why: c.name.trim() } } : {}), ...(yes(c, "spell_ability") ? { ability: true } : {}),
        },
      });
    }
  });
  each("Subspecies", (c) => {
    if (!c.species || !c.subspecies) return;
    for (const r of rulesOf(c)) {
      let sp = species.get(spKey(r, c.species));
      if (!sp) {
        const srdSp = srd.builder[r].species.find((s) => lc(s.name) === lc(c.species));
        if (!srdSp) { err(`Rasa "${c.species}" (${r}) ne postoji ni na tabu Species ni u SRD-u.`); continue; }
        if (srdSp.subs.some((s) => lc(s.name.replace(/^.*?:\s*/, "")) === lc(c.subspecies))) { err(`${srdSp.name} već ima podrasu "${c.subspecies}" (${r}).`); continue; }
        sp = { name: srdSp.name, speed: srdSp.speed, size: srdSp.size, traits: [], asi: [], subs: [], subsOnly: true, book };
        species.set(spKey(r, c.species), sp);
      }
      if (sp.subs.some((s) => lc(s.name) === lc(c.subspecies))) { err(`Podrasa "${c.subspecies}" se ponavlja.`); continue; }
      const cantrips = list(c.cantrips_given ?? "");
      cantripCheck(cantrips, "cantrips_given");
      const speed = num(c, "speed", { min: 0, max: 120, int: true });
      const hpl = num(c, "hp_per_level", { min: 1, max: 5, int: true });
      const from = pick(c, "cantrip_from", CLASS_NAMES);
      const sub: SpeciesSub = {
        name: c.subspecies.trim(), traits: [], asi: abilities(c.ability_bonuses ?? "", "ability_bonuses") as SpeciesSub["asi"],
        gives: { skills: skills(c.skills_given ?? "", "skills_given"), cantrips, ...(speed ? { speed } : {}), ...(hpl ? { hpPerLevel: hpl } : {}) },
        ...(from ? { needs: { cantrip: { list: from, why: c.subspecies.trim() } } } : {}),
      };
      sp.subs.push(sub);
    }
  });
  each("Species Traits", (c) => {
    if (!c.species) return;
    for (const r of rulesOf(c)) {
      const sp = species.get(spKey(r, c.species));
      if (!sp) { err(`Rasa "${c.species}" (${r}) nije na tabu Species${(wb.tabs.Subspecies ?? []).length ? " ni Subspecies" : ""}.`); continue; }
      const t: Text = { name: (c.trait ?? "").trim(), text: (c.text ?? "").trim() };
      if ((c.subspecies ?? "").trim()) {
        const sub = sp.subs.find((s) => lc(s.name) === lc(c.subspecies));
        if (!sub) { err(`Podrasa "${c.subspecies}" nije na tabu Subspecies.`); continue; }
        sub.traits.push(t);
      } else if (sp.subsOnly) err(`"${sp.name}" je postojeća rasa: osobine dodaj samo njenim novim podrasama (kolona Subspecies).`);
      else sp.traits.push(t);
    }
  });
  for (const [k, sp] of species) {
    const r = k.split("|")[0] as Rules;
    tab = "Species"; name = sp.name;
    if (!sp.subsOnly && !sp.traits.length) warn(`Rasa "${sp.name}" (${r}) nema nijednu osobinu na tabu Species Traits.`);
    out.content.push({ kind: "species", rules: r, parent: "", name: sp.subsOnly ? `${sp.name} (subspecies)` : sp.name, book, data: sp });
  }
  name = "";

  // ---------------------------------------------------------------- backgrounds
  // "Traveler's Clothes" = "Clothes, Traveler's"; "2 Daggers" = "Dagger": compare the words, in any order, without plurals
  const itemKey = (s: string) => lc(s).replace(/\([^)]*\)/g, " ").replace(/['’]s\b/g, "").replace(/['’]/g, "").split(/[^a-z0-9]+/)
    .filter(Boolean).map((w) => (w.length > 3 ? w.replace(/(ies)$/, "y").replace(/(?<!s)s$/, "") : w)).sort().join(" ");
  const itemIn = (r: Rules, raw: string): SrdItem | ItemRow | undefined => {
    const k = itemKey(raw);
    return bookItems.find((i) => i.rules === r && itemKey(i.name) === k) ?? srd.items.find((i) => i.rules === r && itemKey(i.name) === k);
  };
  const kit = (r: Rules, text: string, key: string): { items: KitItem[]; gp: number } => {
    const items: KitItem[] = []; let gp = 0;
    for (const part of text.split(/,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean)) {
      const money = part.match(/^(\d+)\s*(gp|sp|cp)$/i);
      if (money) { gp += Number(money[1]) * ({ gp: 1, sp: 0.1, cp: 0.01 }[lc(money[2]) as "gp"]); continue; }
      let qty = 1, nm = part;
      let m = part.match(/^(\d+)\s+(.+)$/);
      if (m) { qty = Number(m[1]); nm = m[2]; }
      else if ((m = part.match(/^(.+?)\s*[x×]\s*(\d+)$/i))) { nm = m[1]; qty = Number(m[2]); }
      const inParens = nm.match(/\((\d+)\s+\w+\)$/); // "Parchment (10 sheets)"
      if (inParens) qty = Number(inParens[1]);
      const hit = itemIn(r, nm);
      if (!hit) warn(`${head(key)}: "${nm}" nije pronađen u predmetima (${r}). Biće dodat kao običan predmet bez opisa.`);
      const item: KitItem = { name: hit?.name ?? nm.trim(), qty };
      if (hit) {
        item.ref = `srd:${hit.id}`;
        const d = (hit.data ?? {}) as { damage?: string; type?: string; props?: string[]; range?: { normal?: number; long?: number }; ac?: { base: number; dex_bonus?: boolean; max_bonus?: number } };
        if (d.ac) {
          item.ac = { base: d.ac.base, dex: !!d.ac.dex_bonus, ...(d.ac.dex_bonus && d.ac.max_bonus !== undefined ? { max: d.ac.max_bonus } : {}) };
          const cat = lc(hit.category ?? "");
          item.armor = cat.startsWith("shield") || /shield/.test(lc(hit.name)) ? "Shield" : cat.startsWith("light") ? "Light" : cat.startsWith("medium") ? "Medium" : cat.startsWith("heavy") ? "Heavy" : "";
        }
        if (d.damage) item.w = { damage: d.damage, type: d.type ?? "", props: d.props ?? [], ranged: /ranged/i.test(hit.category ?? ""), ...(d.range?.long ? { range: `${d.range.normal}/${d.range.long} ft` } : {}) };
      }
      items.push(item);
    }
    return { items, gp: Math.round(gp * 100) / 100 };
  };
  each("Backgrounds", (c) => {
    if (!c.name) return;
    const sk = skills(c.skills ?? "", "skills");
    if (sk.length !== 2) warn(`${head("skills")}: background obično daje tačno 2 veštine (sada ${sk.length}).`);
    for (const r of rulesOf(c)) {
      if (dup(`bg:${r}:${lc(c.name)}`, `Background "${c.name}" (${r})`)) continue;
      if (srd.builder[r].backgrounds.some((b) => lc(b.name) === lc(c.name))) { err(`Background "${c.name}" već postoji (${r}).`); continue; }
      const bg: BackgroundData = { name: c.name.trim(), skills: sk, tools: list(c.tools ?? ""), equipment: [] };
      if (r === "2024") {
        const ab = list(c.abilities ?? "").map((x) => ABIL_WORD[lc(x)] ?? x.toUpperCase());
        if (ab.length !== 3 || ab.some((a) => !ABILITY_NAMES.includes(a))) err(`${head("abilities")}: za 2024 tačno tri atributa, npr. "STR, CON, WIS".`);
        bg.abilities = ab as BackgroundData["abilities"];
        const feat = (c.feat ?? "").trim();
        if (!feat) err(`${head("feat")}: 2024 background daje origin feat.`);
        else if (!featsFor["2024"].has(lc(feat)) && !bookFeatNames.has(lc(feat))) err(`Origin feat "${feat}" ne postoji ni u SRD-u ni na tabu Feats.`);
        else {
          const f = [...srd.rules["2024"].feats, ...out.content.filter((x) => x.kind === "feat" && x.rules === "2024").map((x) => x.data as BookFeat)].find((x) => lc(x.name) === lc(feat));
          if (f && !/origin/i.test(f.category ?? "")) warn(`Feat "${feat}" nije Origin feat (kategorija: ${f.category}).`);
        }
        bg.feat = feat ? { name: (featsFor["2024"].has(lc(feat)) ? srd.rules["2024"].feats.find((x) => lc(x.name) === lc(feat))?.name : undefined) ?? feat, note: (c.feat_note ?? "").trim() || null } : null;
        const a = kit(r, c.equipment_a ?? "", "equipment_a");
        const b = kit(r, (c.equipment_b ?? "").trim() || "50 GP", "equipment_b");
        bg.equipment = [{ desc: `Choose A or B: (A) ${(c.equipment_a ?? "").trim() || "—"}; or (B) ${(c.equipment_b ?? "").trim() || "50 GP"}`, options: [
          { label: "A", items: a.items, gp: a.gp, picks: [] }, { label: "B", items: b.items, gp: b.gp, picks: [] },
        ] }];
      } else {
        const langs = num(c, "languages", { min: 0, max: 4, int: true });
        bg.languages = langs ?? 0;
        const a = kit(r, c.equipment_a ?? "", "equipment_a");
        bg.equipmentFixed = a.items; bg.gp = a.gp;
        bg.feature = (c.feature ?? "").trim() ? { name: c.feature.trim(), text: (c.feature_text ?? "").trim() } : null;
        if (!bg.feature) warn(`2014 background obično ima osobinu (${head("feature")}).`);
      }
      out.content.push({ kind: "background", rules: r, parent: "", name: bg.name, book, data: bg });
    }
  });

  // ---------------------------------------------------------------- the whole book
  tab = "Book";
  const total = out.spells.length + out.items.length + out.monsters.length + out.content.length;
  if (!issues.some((i) => i.level === "error") && total === 0) issues.push({ level: "error", tab: "Book", msg: "Nijedan red nije popunjen (redovi počinju od 3. reda, ispod sivog primera)." });
  return out;
}

/** Turns a check result into a short report (Serbian). */
export function report(r: CheckResult): string {
  const lines: string[] = [];
  const errors = r.issues.filter((i) => i.level === "error");
  const warnings = r.issues.filter((i) => i.level === "warning");
  const guesses = r.issues.filter((i) => i.level === "guess");
  const where = (i: Issue) => `${i.tab}${i.row ? `, red ${i.row}` : ""}${i.name ? ` (${i.name})` : ""}`;
  lines.push(`Knjiga: ${r.book.name || "?"} [${r.book.code || "?"}], pravila: ${r.book.rules || "?"}`);
  const count = (k: string) => r.content.filter((c) => c.kind === k).length;
  lines.push(`Pročitano: ${r.spells.length} spellova, ${r.items.length} predmeta, ${r.monsters.length} čudovišta, ${count("subclass")} subklasa, ${count("feat")} featova, ${count("species")} rasa, ${count("background")} backgrounda.`);
  lines.push("");
  if (errors.length) {
    lines.push(`GREŠKE (${errors.length}): ispravi ih, pa pokreni proveru ponovo. SQL nije napravljen.`);
    for (const i of errors) lines.push(`  ✗ ${where(i)}: ${i.msg}`);
    lines.push("");
  }
  if (warnings.length) {
    lines.push(`UPOZORENJA (${warnings.length}): nije greška, ali pogledaj.`);
    for (const i of warnings) lines.push(`  ! ${where(i)}: ${i.msg}`);
    lines.push("");
  }
  if (guesses.length) {
    lines.push(`PROČITANO AUTOMATSKI (${guesses.length}): proveri jednom da li je tačno.`);
    for (const i of guesses) lines.push(`  ~ ${where(i)}: ${i.msg}`);
    lines.push("");
  }
  if (!errors.length) lines.push("Nema grešaka. ✓");
  return lines.join("\n");
}
