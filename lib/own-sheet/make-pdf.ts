// Draws our own character sheet as a fillable PDF (2 A4 pages) with pdf-lib.
// Print-friendly (light paper, dark ink, one accent), and every box is a form field named in fields.ts,
// so the same file can be printed, filled in by hand or in any PDF app, and imported back exactly.
// Runs in the browser (fonts fetched from /fonts) and in tests (fonts read from disk).
import { AnnotationFlags, PDFDocument, rgb, TextAlignment, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { ABILITIES, SKILLS, type Ability } from "../rules";
import { ATTACK_ROWS, CLASS_ROWS, COIN_KEYS, FIELD, toFields, type PrintData } from "./fields";

export type SheetFonts = { regular: Uint8Array | ArrayBuffer; bold: Uint8Array | ArrayBuffer; heading: Uint8Array | ArrayBuffer };

const INK = rgb(0.12, 0.1, 0.08);
const MUTED = rgb(0.44, 0.4, 0.35);
const LINE = rgb(0.76, 0.71, 0.64);
const FILL = rgb(0.975, 0.96, 0.935);
const ACCENT = rgb(0.71, 0.33, 0.11);
const WHITE = rgb(1, 1, 1);

const A4: [number, number] = [595.28, 841.89];
const M = 28;
const RIGHT = A4[0] - M;
const FULL = RIGHT - M;

const ABILITY_NAME: Record<Ability, string> = { STR: "STRENGTH", DEX: "DEXTERITY", CON: "CONSTITUTION", INT: "INTELLIGENCE", WIS: "WISDOM", CHA: "CHARISMA" };

export async function makeSheetPdf(data: PrintData, fonts: SheetFonts): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(data.name ? `${data.name} · character sheet` : "Character sheet");
  doc.setCreator("Lemound's Tiny Hut");
  doc.setProducer("Lemound's Tiny Hut");
  // field fonts are embedded whole, so anything typed later in a PDF app (č, ć, đ…) still shows
  const regular = await doc.embedFont(fonts.regular, { subset: false });
  const bold = await doc.embedFont(fonts.bold, { subset: false });
  const heading = await doc.embedFont(fonts.heading, { subset: true });
  const form = doc.getForm();
  const values = toFields(data);
  const p1 = doc.addPage(A4);
  const p2 = doc.addPage(A4);

  // ---------- drawing helpers ----------
  const roundRect = (page: PDFPage, x: number, y: number, w: number, h: number, o: { fill?: typeof FILL; border?: typeof LINE; r?: number; width?: number } = {}) => {
    const r = Math.min(o.r ?? 5, w / 2, h / 2);
    const path = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
    page.drawSvgPath(path, { x, y: y + h, color: o.fill, borderColor: o.border ?? LINE, borderWidth: o.width ?? 0.7 });
  };
  const text = (page: PDFPage, s: string, x: number, y: number, o: { size?: number; font?: PDFFont; color?: typeof INK; align?: "left" | "center" | "right"; w?: number } = {}) => {
    const font = o.font ?? regular, size = o.size ?? 7;
    const tw = font.widthOfTextAtSize(s, size);
    const dx = o.align === "center" ? ((o.w ?? 0) - tw) / 2 : o.align === "right" ? (o.w ?? 0) - tw : 0;
    page.drawText(s, { x: x + dx, y, size, font, color: o.color ?? INK });
  };
  const label = (page: PDFPage, s: string, x: number, y: number, o: { align?: "left" | "center" | "right"; w?: number; color?: typeof INK } = {}) =>
    text(page, s.toUpperCase(), x, y, { size: 6, font: bold, color: o.color ?? MUTED, align: o.align, w: o.w });
  const section = (page: PDFPage, s: string, x: number, y: number, w: number) => {
    text(page, s.toUpperCase(), x, y, { size: 7.5, font: bold, color: ACCENT });
    page.drawLine({ start: { x: x + bold.widthOfTextAtSize(s.toUpperCase(), 7.5) + 5, y: y + 2.5 }, end: { x: x + w, y: y + 2.5 }, thickness: 0.6, color: LINE });
  };

  const made = new Map<string, ReturnType<typeof form.createTextField>>();
  const field = (page: PDFPage, name: string, x: number, y: number, w: number, h: number,
    o: { size?: number; multiline?: boolean; align?: "left" | "center" | "right"; boxed?: boolean; strong?: boolean; readOnly?: boolean } = {}) => {
    let tf = made.get(name);
    if (!tf) {
      tf = form.createTextField(name);
      if (o.multiline) tf.enableMultiline();
      tf.disableRichFormatting();
      const v = values[name];
      if (typeof v === "string" && v) tf.setText(v);
      made.set(name, tf);
    }
    tf.addToPage(page, {
      x, y, width: w, height: h, font: o.strong ? bold : regular, textColor: INK,
      borderWidth: o.boxed === false ? 0 : 0.6, borderColor: o.boxed === false ? undefined : LINE, backgroundColor: o.boxed === false ? undefined : WHITE,
    });
    tf.setFontSize(o.size ?? 9);
    tf.setAlignment(o.align === "center" ? TextAlignment.Center : o.align === "right" ? TextAlignment.Right : TextAlignment.Left);
    if (o.readOnly) {
      tf.enableReadOnly();
      for (const w of tf.acroField.getWidgets()) w.setFlagTo(AnnotationFlags.Hidden, true); // data only, never shown or printed
    }
  };
  const check = (page: PDFPage, name: string, x: number, y: number, size = 8.5) => {
    const cb = form.createCheckBox(name);
    cb.addToPage(page, { x, y, width: size, height: size, borderWidth: 0.7, borderColor: MUTED, backgroundColor: WHITE, textColor: ACCENT });
    if (values[name] === true) cb.check();
  };
  const footer = (page: PDFPage, n: number) => {
    text(page, "Made with Lemound's Tiny Hut. To bring changes back into the app: Characters → Import from PDF, and pick this file.", M, 16, { size: 6, color: MUTED });
    text(page, `${n} / 2`, M, 16, { size: 6, color: MUTED, align: "right", w: FULL });
  };

  // ================= PAGE 1 =================
  // brand line + sheet kind (the kind field is what tells the importer this is our sheet)
  text(p1, "LEMOUND'S TINY HUT · CHARACTER SHEET", M, A4[1] - 22, { size: 6.5, font: bold, color: ACCENT, align: "right", w: FULL });
  field(p1, FIELD.kind, RIGHT - 1, A4[1] - 12, 1, 1, { size: 1, boxed: false, readOnly: true });
  field(p1, FIELD.id, RIGHT - 3, A4[1] - 12, 1, 1, { size: 1, boxed: false, readOnly: true });
  field(p1, FIELD.snapshot, RIGHT - 5, A4[1] - 12, 1, 1, { size: 1, boxed: false, readOnly: true, multiline: true });

  label(p1, "Character name", M, 804);
  field(p1, FIELD.name, M, 772, 300, 28, { size: 18, strong: true });
  const meta: [string, string, number, number, number][] = [
    ["Species", FIELD.species, 340, 784, 110], ["Background", FIELD.background, RIGHT - 110, 784, 110],
    ["Alignment", FIELD.alignment, 340, 752, 110], ["Player", FIELD.player, RIGHT - 110, 752, 110],
  ];
  for (const [l, n, x, y, w] of meta) { label(p1, l, x, y + 20); field(p1, n, x, y, w, 17, { size: 9 }); }

  label(p1, "Class", M, 738); label(p1, "Subclass", 154, 738); label(p1, "Level", 302, 738);
  for (let i = 0; i < CLASS_ROWS; i++) {
    const y = 718 - i * 19;
    field(p1, FIELD.cls(i), M, y, 122, 16, { size: 9 });
    field(p1, FIELD.sub(i), 154, y, 144, 16, { size: 9 });
    field(p1, FIELD.lvl(i), 302, y, 30, 16, { size: 9, align: "center" });
  }
  label(p1, "Hit dice", 340, 738); field(p1, FIELD.hitDice, 340, 718, 227, 16, { size: 9 });
  label(p1, "Rules (2014 / 2024)", 340, 700);
  field(p1, FIELD.rules, 340, 680, 60, 16, { size: 9, align: "center" });
  text(p1, "Multiclass: one class per row.", 408, 685, { size: 6.5, color: MUTED });

  // stats strip
  const stats: [string, string][] = [["Armor class", FIELD.ac], ["Max HP", FIELD.hp], ["Speed", FIELD.speed], ["Initiative", FIELD.init], ["Proficiency", FIELD.prof], ["Passive Perception", FIELD.passive]];
  const sw = (FULL - 5 * 6) / 6;
  stats.forEach(([l, n], i) => {
    const x = M + i * (sw + 6);
    roundRect(p1, x, 612, sw, 56, { fill: FILL });
    label(p1, l, x, 657, { align: "center", w: sw });
    field(p1, n, x + 8, 619, sw - 16, 32, { size: 18, strong: true, align: "center" });
  });

  // abilities + saves
  section(p1, "Abilities & saving throws", M, 596, 168);
  ABILITIES.forEach((a, i) => {
    const top = 586 - i * 60, y = top - 56;
    roundRect(p1, M, y, 168, 56, { fill: FILL });
    label(p1, ABILITY_NAME[a], M + 7, top - 11);
    field(p1, FIELD.score(a), M + 7, y + 7, 42, 30, { size: 17, strong: true, align: "center" });
    field(p1, FIELD.mod(a), M + 53, y + 10, 34, 24, { size: 13, align: "center" });
    label(p1, "mod", M + 53, y + 37, { align: "center", w: 34 });
    check(p1, FIELD.save(a), M + 98, y + 17.5);
    field(p1, FIELD.saveTotal(a), M + 112, y + 10, 48, 24, { size: 13, align: "center" });
    label(p1, "save", M + 98, y + 37, { align: "center", w: 62 });
  });

  // skills
  const sx = 204, swid = 180;
  section(p1, "Skills", sx, 596, swid);
  text(p1, "● proficient   ●● expertise", sx, 586, { size: 6, color: MUTED });
  Object.entries(SKILLS).forEach(([skill, ab], i) => {
    const y = 566 - i * 19.4;
    if (i % 2 === 0) p1.drawRectangle({ x: sx, y: y - 3.5, width: swid, height: 18, color: FILL });
    check(p1, FIELD.skill(skill), sx + 3, y + 1);
    check(p1, FIELD.exp(skill), sx + 14, y + 1);
    text(p1, skill, sx + 28, y + 2.5, { size: 8.5 });
    text(p1, ab, sx + 28 + regular.widthOfTextAtSize(skill, 8.5) + 4, y + 2.5, { size: 6, color: MUTED });
    field(p1, FIELD.skillTotal(skill), sx + swid - 40, y - 1, 37, 15, { size: 9.5, align: "center", strong: true });
  });

  // right column: uses, coins, notes
  const cx = 392, cw = RIGHT - cx;
  section(p1, "Limited uses", cx, 596, cw);
  field(p1, FIELD.uses, cx, 446, cw, 142, { size: 8.5, multiline: true });
  text(p1, "Rage 4 / long rest, Second Wind 1 / short rest…", cx, 437, { size: 6, color: MUTED });
  section(p1, "Coins", cx, 418, cw);
  const coinW = (cw - 4 * 4) / 5;
  COIN_KEYS.forEach((c, i) => {
    const x = cx + i * (coinW + 4);
    label(p1, c, x, 405, { align: "center", w: coinW });
    field(p1, FIELD.coin(c), x, 383, coinW, 18, { size: 9, align: "center" });
  });
  section(p1, "Notes", cx, 364, cw);
  field(p1, FIELD.notes, cx, 230, cw, 126, { size: 8, multiline: true });

  // attacks
  section(p1, "Attacks & spells", M, 210, FULL);
  const cols: [string, number, number][] = [["Name", M, 160], ["To hit / DC", M + 164, 56], ["Damage", M + 224, 130], ["Notes", M + 358, FULL - 358]];
  for (const [l, x] of cols) label(p1, l, x + 2, 199);
  for (let i = 0; i < ATTACK_ROWS; i++) {
    const y = 176 - i * 19.5;
    field(p1, FIELD.atk(i, "name"), cols[0][1], y, cols[0][2], 16, { size: 9, strong: true });
    field(p1, FIELD.atk(i, "bonus"), cols[1][1], y, cols[1][2], 16, { size: 9, align: "center" });
    field(p1, FIELD.atk(i, "damage"), cols[2][1], y, cols[2][2], 16, { size: 9 });
    field(p1, FIELD.atk(i, "notes"), cols[3][1], y, cols[3][2], 16, { size: 7.5 });
  }
  footer(p1, 1);

  // ================= PAGE 2 =================
  text(p2, "LEMOUND'S TINY HUT · CHARACTER SHEET", M, A4[1] - 22, { size: 6.5, font: bold, color: ACCENT, align: "right", w: FULL });
  if (data.name) text(p2, data.name, M, 790, { size: 20, font: heading });
  else { label(p2, "Character name", M, 804); }

  section(p2, "Spellcasting", M, 766, FULL);
  const sp: [string, string, number][] = [["Ability", FIELD.spellAbility, 70], ["Save DC", FIELD.spellDc, 70], ["Attack", FIELD.spellAttack, 70]];
  let spx = M;
  for (const [l, n, w] of sp) {
    roundRect(p2, spx, 712, w, 46, { fill: FILL });
    label(p2, l, spx, 748, { align: "center", w });
    field(p2, n, spx + 8, 717, w - 16, 26, { size: 15, strong: true, align: "center" });
    spx += w + 6;
  }
  label(p2, "Spell slots (level: how many)", spx, 748);
  field(p2, FIELD.slots, spx, 717, RIGHT - spx, 26, { size: 10 });
  label(p2, "Spells (one line per level: “Cantrips: …”, “Level 1: …”)", M, 700);
  field(p2, FIELD.spells, M, 560, FULL, 134, { size: 8.5, multiline: true });

  section(p2, "Features & traits", M, 542, 350);
  field(p2, FIELD.features, M, 34, 350, 500, { size: 7, multiline: true });
  section(p2, "Equipment", 392, 542, RIGHT - 392);
  field(p2, FIELD.equipment, 392, 34, RIGHT - 392, 500, { size: 8, multiline: true });
  text(p2, "One item per line · “×4” for how many · “(equipped)”", 392, 26, { size: 5.5, color: MUTED });
  footer(p2, 2);

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
