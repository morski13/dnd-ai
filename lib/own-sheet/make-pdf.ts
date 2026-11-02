// Draws our own character sheet as a fillable PDF (3 A4 pages) with pdf-lib:
//   1 · the character (classes, numbers, abilities and saves, skills, attacks)
//   2 · features, equipment, coins, limited uses, notes
//   3 · spells (spellcasting per class, slots per level, a line per spell with a "prepared" box)
// Print-friendly parchment look: dark ink, one copper accent, Spectral for headings and big numbers.
// Every box is a form field named in fields.ts, so the file can be printed, filled in by hand or in any
// PDF app, and imported back exactly. Runs in the browser (fonts from /fonts) and in tests (from disk).
import { AnnotationFlags, PDFDocument, rgb, TextAlignment, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { CLASS_NAMES } from "../classes";
import { ABILITIES, SKILLS, type Ability } from "../rules";
import { ATTACK_ROWS, CAST_ROWS, CLASS_ROWS, COIN_KEYS, FIELD, SPELL_LINES, toFields, type PrintData } from "./fields";

export type SheetFonts = { regular: Uint8Array | ArrayBuffer; bold: Uint8Array | ArrayBuffer; heading: Uint8Array | ArrayBuffer };

const INK = rgb(0.13, 0.1, 0.08);
const MUTED = rgb(0.45, 0.39, 0.32);
const LINE = rgb(0.74, 0.66, 0.55);
const PAPER = rgb(0.988, 0.975, 0.95);
const FILL = rgb(0.957, 0.925, 0.87);
const ACCENT = rgb(0.66, 0.3, 0.1);
const ACCENT_SOFT = rgb(0.93, 0.85, 0.76);
const WHITE = rgb(1, 1, 1);

const W = 595.28, H = 841.89;
const M = 30;              // margin inside the frame
const RIGHT = W - M;
const FULL = RIGHT - M;

const ABILITY_NAME: Record<Ability, string> = { STR: "Strength", DEX: "Dexterity", CON: "Constitution", INT: "Intelligence", WIS: "Wisdom", CHA: "Charisma" };
const LEVEL_NAME = ["Cantrips", "1st level", "2nd level", "3rd level", "4th level", "5th level", "6th level", "7th level", "8th level", "9th level"];

export async function makeSheetPdf(data: PrintData, fonts: SheetFonts): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(data.name ? `${data.name} · character sheet` : "Character sheet");
  doc.setCreator("Lemound's Tiny Hut");
  doc.setProducer("Lemound's Tiny Hut");
  // field fonts are embedded whole, so anything typed later in a PDF app (č, ć, đ…) still shows
  const regular = await doc.embedFont(fonts.regular, { subset: false });
  const bold = await doc.embedFont(fonts.bold, { subset: false });
  const heading = await doc.embedFont(fonts.heading, { subset: false });
  const form = doc.getForm();
  const values = toFields(data);
  const pages = [doc.addPage([W, H]), doc.addPage([W, H]), doc.addPage([W, H])];
  const [p1, p2, p3] = pages;

  // ---------------- drawing helpers ----------------
  const path = (page: PDFPage, d: string, x: number, top: number, o: { fill?: RGB; border?: RGB; width?: number } = {}) =>
    page.drawSvgPath(d, { x, y: top, color: o.fill, borderColor: o.border, borderWidth: o.border ? o.width ?? 0.7 : 0 });
  /** A box with cut corners, like a plaque. */
  const plaque = (page: PDFPage, x: number, y: number, w: number, h: number, o: { fill?: RGB; border?: RGB; c?: number; width?: number } = {}) => {
    const c = o.c ?? 6;
    path(page, `M ${c} 0 H ${w - c} L ${w} ${c} V ${h - c} L ${w - c} ${h} H ${c} L 0 ${h - c} V ${c} Z`, x, y + h, { fill: o.fill, border: o.border ?? LINE, width: o.width });
  };
  /** A shield (for Armor Class). */
  const shield = (page: PDFPage, x: number, y: number, w: number, h: number) =>
    path(page, `M 0 0 H ${w} V ${h * 0.55} Q ${w} ${h * 0.85} ${w / 2} ${h} Q 0 ${h * 0.85} 0 ${h * 0.55} Z`, x, y + h, { fill: FILL, border: ACCENT, width: 0.9 });
  const diamond = (page: PDFPage, cx: number, cy: number, r: number, fill: RGB = ACCENT) =>
    path(page, `M 0 ${r} L ${r} 0 L ${2 * r} ${r} L ${r} ${2 * r} Z`, cx - r, cy + r, { fill });
  const text = (page: PDFPage, s: string, x: number, y: number, o: { size?: number; font?: PDFFont; color?: RGB; align?: "left" | "center" | "right"; w?: number } = {}) => {
    const font = o.font ?? regular, size = o.size ?? 7;
    const tw = font.widthOfTextAtSize(s, size);
    const dx = o.align === "center" ? ((o.w ?? 0) - tw) / 2 : o.align === "right" ? (o.w ?? 0) - tw : 0;
    page.drawText(s, { x: x + dx, y, size, font, color: o.color ?? INK });
  };
  const label = (page: PDFPage, s: string, x: number, y: number, o: { align?: "left" | "center" | "right"; w?: number; color?: RGB; size?: number } = {}) =>
    text(page, s.toUpperCase(), x, y, { size: o.size ?? 5.8, font: bold, color: o.color ?? MUTED, align: o.align, w: o.w });
  /** A section title: ◆ Title ───────── ◆ */
  const section = (page: PDFPage, s: string, x: number, y: number, w: number) => {
    diamond(page, x + 3, y + 3.5, 2.6);
    text(page, s, x + 10, y, { size: 11, font: heading, color: ACCENT });
    const tw = heading.widthOfTextAtSize(s, 11);
    page.drawLine({ start: { x: x + 16 + tw, y: y + 3.5 }, end: { x: x + w - 8, y: y + 3.5 }, thickness: 0.6, color: LINE });
    diamond(page, x + w - 3, y + 3.5, 2);
  };
  /** The page: parchment, a double frame with diamond corners, the brand line and the page title. */
  const frame = (page: PDFPage, title: string, n: number) => {
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: PAPER });
    page.drawRectangle({ x: 12, y: 12, width: W - 24, height: H - 24, borderColor: ACCENT, borderWidth: 1.1 });
    page.drawRectangle({ x: 16, y: 16, width: W - 32, height: H - 32, borderColor: LINE, borderWidth: 0.5 });
    for (const [cx, cy] of [[14, 14], [W - 14, 14], [14, H - 14], [W - 14, H - 14]]) diamond(page, cx, cy, 5);
    text(page, "LEMOUND'S TINY HUT", M, H - 30, { size: 6.5, font: bold, color: ACCENT });
    text(page, `${title.toUpperCase()} · ${n} / 3`, M, H - 30, { size: 6.5, font: bold, color: MUTED, align: "right", w: FULL });
    text(page, "Fill it in on paper or in any PDF app, then bring it back: Characters → Import from PDF. Everything is read exactly.", M, 22, { size: 5.8, color: MUTED });
  };

  const made = new Map<string, ReturnType<typeof form.createTextField>>();
  type FieldOpts = { size?: number; multiline?: boolean; align?: "left" | "center" | "right"; boxed?: boolean | "line"; font?: PDFFont; readOnly?: boolean; fill?: RGB };
  const field = (page: PDFPage, name: string, x: number, y: number, w: number, h: number, o: FieldOpts = {}) => {
    let tf = made.get(name);
    if (!tf) {
      tf = form.createTextField(name);
      if (o.multiline) tf.enableMultiline();
      tf.disableRichFormatting();
      const v = values[name];
      if (typeof v === "string" && v) tf.setText(v);
      made.set(name, tf);
    }
    if (o.boxed === "line") page.drawLine({ start: { x, y: y + 1 }, end: { x: x + w, y: y + 1 }, thickness: 0.5, color: LINE });
    const boxed = o.boxed === undefined || o.boxed === true;
    tf.addToPage(page, {
      x, y, width: w, height: h, font: o.font ?? regular, textColor: INK,
      borderWidth: boxed ? 0.6 : 0, borderColor: boxed ? LINE : undefined, backgroundColor: boxed ? o.fill ?? WHITE : undefined,
    });
    tf.setFontSize(o.size ?? 9);
    tf.setAlignment(o.align === "center" ? TextAlignment.Center : o.align === "right" ? TextAlignment.Right : TextAlignment.Left);
    if (o.readOnly) {
      tf.enableReadOnly();
      for (const wd of tf.acroField.getWidgets()) wd.setFlagTo(AnnotationFlags.Hidden, true); // data only, never shown or printed
    }
  };
  const check = (page: PDFPage, name: string, x: number, y: number, size = 8.5, round = false) => {
    const cb = form.createCheckBox(name);
    if (round) diamond(page, x + size / 2, y + size / 2, size / 2 + 1.2, ACCENT_SOFT);
    cb.addToPage(page, { x, y, width: size, height: size, borderWidth: 0.7, borderColor: MUTED, backgroundColor: WHITE, textColor: ACCENT });
    if (values[name] === true) cb.check();
  };
  /** Class box: a list of the 12 classes, and you can type any other. */
  const classPicker = (page: PDFPage, name: string, x: number, y: number, w: number, h: number) => {
    const dd = form.createDropdown(name);
    dd.addOptions(["", ...CLASS_NAMES]);
    dd.enableEditing();
    const v = values[name];
    if (typeof v === "string" && v) dd.select(v);
    dd.addToPage(page, { x, y, width: w, height: h, font: regular, textColor: INK, borderWidth: 0.6, borderColor: LINE, backgroundColor: WHITE });
    dd.setFontSize(9);
  };
  const name2 = (page: PDFPage) => {
    if (data.name) text(page, data.name, M, H - 58, { size: 22, font: heading });
    else { label(page, "Character", M, H - 46); field(page, FIELD.name, M, H - 70, 260, 22, { size: 14, font: heading, boxed: "line" }); }
  };

  // ======================= PAGE 1 · CHARACTER =======================
  frame(p1, "Character", 1);
  field(p1, FIELD.kind, RIGHT - 1, H - 20, 1, 1, { size: 1, boxed: false, readOnly: true });
  field(p1, FIELD.id, RIGHT - 3, H - 20, 1, 1, { size: 1, boxed: false, readOnly: true });
  field(p1, FIELD.snapshot, RIGHT - 5, H - 20, 1, 1, { size: 1, boxed: false, readOnly: true, multiline: true });

  // name on a banner
  plaque(p1, M, 756, 300, 46, { fill: FILL, border: ACCENT, c: 8, width: 0.9 });
  label(p1, "Character name", M + 10, 791, { color: ACCENT });
  field(p1, FIELD.name, M + 10, 761, 280, 26, { size: 18, font: heading, boxed: false });
  const meta: [string, string, number, number][] = [
    ["Species", FIELD.species, 342, 784], ["Background", FIELD.background, 342 + 114, 784],
    ["Alignment", FIELD.alignment, 342, 756], ["Player", FIELD.player, 342 + 114, 756],
  ];
  for (const [l, n, x, y] of meta) { label(p1, l, x, y + 13); field(p1, n, x, y, 107, 12, { size: 9, boxed: "line" }); }

  // classes (multiclass: one per row)
  section(p1, "Class & level", M, 728, FULL);
  label(p1, "Class (pick or type)", M, 714); label(p1, "Subclass", M + 128, 714); label(p1, "Level", M + 286, 714, { align: "center", w: 34 }); label(p1, "Hit die", M + 324, 714, { align: "center", w: 36 });
  for (let i = 0; i < CLASS_ROWS; i++) {
    const y = 694 - i * 19;
    classPicker(p1, FIELD.cls(i), M, y, 122, 16);
    field(p1, FIELD.sub(i), M + 128, y, 152, 16, { size: 9 });
    field(p1, FIELD.lvl(i), M + 286, y, 34, 16, { size: 10, align: "center", font: heading });
    field(p1, FIELD.hd(i), M + 324, y, 36, 16, { size: 9, align: "center", fill: FILL });
  }
  const rx = M + 374, rw = RIGHT - rx;
  label(p1, "Hit dice (total)", rx, 714); field(p1, FIELD.hitDice, rx, 694, rw, 16, { size: 9 });
  label(p1, "Rules · 2014 or 2024", rx, 677); field(p1, FIELD.rules, rx, 656, 56, 16, { size: 10, align: "center", font: heading });
  text(p1, "Multiclass? One class per row.", rx + 62, 661, { size: 6, color: MUTED });

  // the big numbers
  const stats: [string, string][] = [["Max HP", FIELD.hp], ["Speed", FIELD.speed], ["Initiative", FIELD.init], ["Proficiency", FIELD.prof], ["Passive Perc.", FIELD.passive]];
  shield(p1, M + 6, 572, 64, 70);
  label(p1, "Armor class", M + 6, 631, { align: "center", w: 64, color: ACCENT });
  field(p1, FIELD.ac, M + 14, 596, 48, 30, { size: 22, font: heading, align: "center", boxed: false });
  const sx0 = M + 84, sw = (RIGHT - sx0 - 4 * 6) / 5;
  stats.forEach(([l, n], i) => {
    const x = sx0 + i * (sw + 6);
    plaque(p1, x, 584, sw, 54, { fill: FILL });
    label(p1, l, x, 627, { align: "center", w: sw });
    field(p1, n, x + 9, 590, sw - 18, 30, { size: 18, font: heading, align: "center" });
  });

  // abilities + saves
  section(p1, "Abilities & saves", M, 560, 176);
  ABILITIES.forEach((a, i) => {
    const top = 548 - i * 56, y = top - 52;
    plaque(p1, M, y, 176, 52, { fill: FILL, c: 7 });
    text(p1, ABILITY_NAME[a], M + 8, top - 11, { size: 9, font: heading, color: ACCENT });
    label(p1, a, M + 8, y + 6);
    field(p1, FIELD.score(a), M + 46, y + 8, 34, 24, { size: 14, font: heading, align: "center" });
    label(p1, "score", M + 46, y + 34, { align: "center", w: 34 });
    field(p1, FIELD.mod(a), M + 86, y + 8, 30, 24, { size: 13, align: "center", fill: ACCENT_SOFT });
    label(p1, "mod", M + 86, y + 34, { align: "center", w: 30 });
    check(p1, FIELD.save(a), M + 124, y + 15.5, 8.5, true);
    field(p1, FIELD.saveTotal(a), M + 138, y + 8, 32, 24, { size: 13, align: "center" });
    label(p1, "save", M + 122, y + 34, { align: "center", w: 50 });
  });

  // skills
  const kx = M + 186, kw = 186;
  section(p1, "Skills", kx, 560, kw);
  text(p1, "1st box: proficient · 2nd box: expertise", kx, 548, { size: 6, color: MUTED });
  Object.entries(SKILLS).forEach(([skill, ab], i) => {
    const y = 528 - i * 18.4;
    if (i % 2 === 0) p1.drawRectangle({ x: kx, y: y - 3.5, width: kw, height: 17, color: FILL });
    check(p1, FIELD.skill(skill), kx + 3, y + 1, 8);
    check(p1, FIELD.exp(skill), kx + 13.5, y + 1, 8);
    text(p1, skill, kx + 27, y + 2.5, { size: 8.5 });
    text(p1, ab, kx + 27 + regular.widthOfTextAtSize(skill, 8.5) + 4, y + 2.5, { size: 5.8, font: bold, color: MUTED });
    field(p1, FIELD.skillTotal(skill), kx + kw - 38, y - 1.5, 35, 14, { size: 9.5, align: "center", font: bold });
  });

  // right column: limited uses, coins, notes
  const cx = kx + kw + 10, cw = RIGHT - cx;
  section(p1, "Limited uses", cx, 560, cw);
  field(p1, FIELD.uses, cx, 380, cw, 168, { size: 8.5, multiline: true });
  text(p1, "Rage 4 / long rest · Second Wind 1 / short rest", cx, 371, { size: 5.8, color: MUTED });
  section(p1, "Coins", cx, 350, cw);
  const coinW = (cw - 4 * 4) / 5;
  COIN_KEYS.forEach((c, i) => {
    const x = cx + i * (coinW + 4);
    plaque(p1, x, 298, coinW, 40, { fill: FILL, c: 5 });
    label(p1, c, x, 327, { align: "center", w: coinW, color: ACCENT, size: 6.5 });
    field(p1, FIELD.coin(c), x + 3, 304, coinW - 6, 16, { size: 9, align: "center", font: bold });
  });
  section(p1, "Notes", cx, 282, cw);
  field(p1, FIELD.notes, cx, 196, cw, 78, { size: 8, multiline: true });

  // attacks
  section(p1, "Attacks & spells you roll", M, 180, FULL);
  const cols: [string, number, number][] = [["Name", M, 160], ["To hit / DC", M + 164, 56], ["Damage & type", M + 224, 136], ["Notes (range, action, save)", M + 364, FULL - 364]];
  for (const [l, x, w] of cols) label(p1, l, x + 2, 168, { w });
  for (let i = 0; i < ATTACK_ROWS; i++) {
    const y = 148 - i * 15.5;
    field(p1, FIELD.atk(i, "name"), cols[0][1], y, cols[0][2], 13, { size: 9, font: bold });
    field(p1, FIELD.atk(i, "bonus"), cols[1][1], y, cols[1][2], 13, { size: 9, align: "center", fill: ACCENT_SOFT });
    field(p1, FIELD.atk(i, "damage"), cols[2][1], y, cols[2][2], 13, { size: 9 });
    field(p1, FIELD.atk(i, "notes"), cols[3][1], y, cols[3][2], 13, { size: 7.5 });
  }

  // ======================= PAGE 2 · FEATURES & GEAR =======================
  frame(p2, "Features & gear", 2);
  name2(p2);
  section(p2, "Features & traits", M, 744, 352);
  text(p2, "One per paragraph: “• Name: what it does”. Class, species and background features, feats, languages.", M, 732, { size: 6, color: MUTED });
  field(p2, FIELD.features, M, 34, 352, 692, { size: 7.5, multiline: true });
  const ex = M + 364, ew = RIGHT - ex;
  section(p2, "Equipment", ex, 744, ew);
  text(p2, "One item per line · “×4” · “(equipped)”", ex, 732, { size: 6, color: MUTED });
  field(p2, FIELD.equipment, ex, 34, ew, 692, { size: 8, multiline: true });

  // ======================= PAGE 3 · SPELLS =======================
  frame(p3, "Spells", 3);
  name2(p3);
  section(p3, "Spellcasting", M, 744, FULL);
  label(p3, "Class", M, 730); label(p3, "Ability", M + 128, 730, { align: "center", w: 50 }); label(p3, "Save DC", M + 184, 730, { align: "center", w: 50 }); label(p3, "Spell attack", M + 240, 730, { align: "center", w: 56 });
  for (let i = 0; i < CAST_ROWS; i++) {
    const y = 710 - i * 21;
    field(p3, FIELD.castClass(i), M, y, 122, 17, { size: 9 });
    field(p3, FIELD.castAbility(i), M + 128, y, 50, 17, { size: 10, align: "center", font: heading });
    field(p3, FIELD.castDc(i), M + 184, y, 50, 17, { size: 11, align: "center", font: heading, fill: ACCENT_SOFT });
    field(p3, FIELD.castAttack(i), M + 240, y, 56, 17, { size: 11, align: "center", font: heading, fill: ACCENT_SOFT });
  }
  text(p3, "Multiclassed caster: one row per class.", M + 304, 715, { size: 6, color: MUTED });
  label(p3, "Pact magic (warlock)", M + 304, 700); field(p3, FIELD.pact, M + 304, 684, RIGHT - M - 304, 13, { size: 8.5, boxed: "line" });

  // slots: level, how many, used
  section(p3, "Spell slots", M, 660, FULL);
  const slotW = (FULL - 8 * 5) / 9;
  for (let l = 1; l <= 9; l++) {
    const x = M + (l - 1) * (slotW + 5);
    plaque(p3, x, 604, slotW, 46, { fill: FILL, c: 5 });
    text(p3, String(l), x, 636, { size: 10, font: heading, color: ACCENT, align: "center", w: slotW });
    field(p3, FIELD.slotTotal(l), x + 5, 618, slotW / 2 - 6, 14, { size: 10, align: "center", font: heading });
    field(p3, FIELD.slotUsed(l), x + slotW / 2 + 1, 618, slotW / 2 - 6, 14, { size: 10, align: "center" });
    label(p3, "slots   used", x, 609, { align: "center", w: slotW, size: 5 });
  }

  // a line per spell, two columns; the box before each name: prepared
  const colW = (FULL - 16) / 2;
  const columns: number[][] = [[0, 1, 2, 3], [4, 5, 6, 7, 8, 9]];
  columns.forEach((levels, ci) => {
    const x = M + ci * (colW + 16);
    let y = 584;
    for (const l of levels) {
      plaque(p3, x, y - 4, colW, 15, { fill: ACCENT_SOFT, border: ACCENT, c: 4, width: 0.6 });
      text(p3, LEVEL_NAME[l], x + 8, y, { size: 9, font: heading, color: ACCENT });
      if (l > 0) text(p3, "box = prepared", x, y, { size: 5.8, color: MUTED, align: "right", w: colW - 8 });
      y -= 16;
      for (let i = 0; i < SPELL_LINES[l]; i++) {
        if (l > 0) check(p3, FIELD.prep(l, i), x + 2, y + 1.5, 7);
        field(p3, FIELD.spell(l, i), x + (l > 0 ? 13 : 2), y, colW - (l > 0 ? 13 : 2), 12, { size: 8.5, boxed: "line" });
        y -= 13.6;
      }
      y -= 8;
    }
    if (ci === 1) {
      label(p3, "More spells (one line per level: “Level 1: …”)", x, y + 2);
      field(p3, FIELD.spells, x, 34, colW, y - 38, { size: 7.5, multiline: true });
    }
  });

  form.updateFieldAppearances(regular);
  return doc.save();
}

/** In the browser: fetch the sheet fonts once (they're only loaded when someone prints). */
let fontsP: Promise<SheetFonts> | null = null;
export function loadSheetFonts(): Promise<SheetFonts> {
  const get = (f: string) => fetch(`/fonts/${f}`).then((r) => { if (!r.ok) throw new Error(`font ${f}`); return r.arrayBuffer(); });
  fontsP ??= Promise.all([get("sheet-lato-regular.ttf"), get("sheet-lato-bold.ttf"), get("sheet-spectral-bold.ttf")])
    .then(([regular, bold, heading]) => ({ regular, bold, heading }))
    .catch((e) => { fontsP = null; throw e; });
  return fontsP;
}
