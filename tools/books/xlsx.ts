// Excel side of the book tools: writes the template and reads a filled one.
import ExcelJS from "exceljs";
import { BOOK_FIELDS, TABS, type Tab } from "../../lib/books/columns";
import type { SheetRow, Workbook } from "../../lib/books/check";

const HEAD_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2B2118" } } as const;
const HINT_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4EEE6" } } as const;
const REQ = "FFE39B3C";

const README = [
  ["", "Kako se koristi"],
  ["1.", "Na tabu Book upiši ime knjige, kratku oznaku (npr. XGE) i pravila (2014, 2024 ili both)."],
  ["2.", "Popuni tabove koji ti trebaju; ostali mogu ostati prazni. Podaci kreću od 3. reda (2. red je sivi primer, njega ne diraj)."],
  ["3.", "Narandžaste kolone su obavezne. Pređi mišem preko naslova kolone za objašnjenje. Gde postoji padajuća lista, biraj iz nje."],
  ["4.", "Duži tekst: novi red u istoj ćeliji je Alt+Enter. Monster akcije: svaki napad u svom redu, tačno kao u knjizi."],
  ["5.", "Sačuvaj fajl u folder books/ projekta (taj folder se ne šalje na GitHub)."],
  ["6.", "Provera: u PowerShell-u, u folderu projekta:  npm run book -- books/ime-fajla.xlsx"],
  ["", "Ispiše GREŠKE (moraš ispraviti), UPOZORENJA (pogledaj) i šta je pročitano automatski (proveri jednom)."],
  ["7.", "Kad nema grešaka, napravi se books/<oznaka>.sql. Otvori Supabase → SQL Editor, nalepi ceo fajl, Run."],
  ["", "Prvi put pre toga jednom pokreni supabase/26-books.sql."],
  ["8.", "Za minut-dva sve je u aplikaciji: builder (rase, backgroundi, subklase, featovi), level-up, spellovi, predmeti, Battle planner."],
  ["", "Ponovno pokretanje istog SQL-a zamenjuje tu knjigu (ništa drugo se ne briše)."],
  ["", ""],
  ["", "Napomene"],
  ["•", "Imena moraju biti ista kao u knjizi (engleski). Ime koje već postoji u SRD-u je greška, da se ništa ne pomeša."],
  ["•", "Klase se ne dodaju (samo subklase za postojećih 12 klasa)."],
  ["•", "Tekst iz knjiga ostaje u TVOJOJ bazi. Popunjene fajlove i SQL ne stavljaj u javni repo."],
];

export async function writeTemplate(path: string, fill?: Workbook): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Leomund's Tiny Hut";

  const readme = wb.addWorksheet("Read me", { properties: { tabColor: { argb: REQ } } });
  readme.columns = [{ width: 6 }, { width: 110 }];
  for (const [a, b] of README) {
    const r = readme.addRow([a, b]);
    if (b === "Kako se koristi" || b === "Napomene") r.font = { bold: true, size: 13 };
    r.getCell(2).alignment = { wrapText: true, vertical: "top" };
  }
  readme.addRow([]);
  const tabsHead = readme.addRow(["", "Tabovi:"]);
  tabsHead.font = { bold: true };
  for (const t of TABS) readme.addRow(["", `${t.name}: ${t.help}`]).getCell(2).alignment = { wrapText: true };

  const book = wb.addWorksheet("Book", { properties: { tabColor: { argb: REQ } } });
  book.columns = [{ header: "Field", width: 16 }, { header: "Value", width: 40 }, { header: "Help", width: 80 }];
  styleHeader(book.getRow(1), 3);
  for (const f of BOOK_FIELDS) {
    const r = book.addRow([f.label, fill?.book[f.key] ?? "", f.help]);
    r.getCell(1).font = { bold: true };
    r.getCell(3).font = { color: { argb: "FF7A6A58" }, italic: true };
  }
  book.getCell("B4").dataValidation = { type: "list", allowBlank: false, formulae: ['"2014,2024,both"'] };

  for (const t of TABS) addTab(wb, t, fill?.tabs[t.name] ?? []);
  await wb.xlsx.writeFile(path);
}

function styleHeader(row: ExcelJS.Row, n: number) {
  for (let i = 1; i <= n; i++) {
    const c = row.getCell(i);
    c.fill = HEAD_FILL;
    c.font = { bold: true, color: { argb: "FFF7EEDD" } };
  }
}

function addTab(wb: ExcelJS.Workbook, t: Tab, rows: SheetRow[]) {
  const ws = wb.addWorksheet(t.name, { views: [{ state: "frozen", ySplit: 2, xSplit: 1 }] });
  ws.columns = t.cols.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 14 }));
  const head = ws.getRow(1);
  styleHeader(head, t.cols.length);
  t.cols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    if (c.required) cell.font = { bold: true, color: { argb: REQ } };
    cell.note = { texts: [{ text: `${c.header}${c.required ? " (obavezno)" : ""}\n${c.help}${c.list ? `\nMože: ${c.list.join(", ")}` : ""}` }] };
  });
  const hint = ws.addRow(t.cols.map((c) => c.hint));
  hint.eachCell({ includeEmpty: true }, (cell) => { cell.fill = HINT_FILL; cell.font = { italic: true, color: { argb: "FF9A8A78" } }; });
  for (const r of rows) ws.addRow(t.cols.map((c) => r.cells[c.key] ?? ""));
  // dropdowns and wrapping down to row 400
  t.cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    for (let r = 3; r <= 400; r++) {
      const cell = ws.getCell(r, i + 1);
      if (c.list) cell.dataValidation = { type: "list", allowBlank: true, showErrorMessage: false, formulae: [`"${c.list.join(",")}"`] };
      if (c.long) cell.alignment = { wrapText: true, vertical: "top" };
      else cell.alignment = { vertical: "top" };
    }
    void col;
  });
}

/** Any cell value as plain text. */
function text(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((p) => p.text).join("");
    if ("result" in v) return text(v.result as ExcelJS.CellValue);
    if ("text" in v) return String((v as { text: unknown }).text);
    if ("error" in v) return "";
  }
  return String(v);
}

export async function readWorkbook(path: string): Promise<Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const problems: string[] = [];
  const book: Record<string, string> = {};
  const bs = wb.getWorksheet("Book");
  if (!bs) problems.push('Nema taba "Book". Koristi template (tools/books/book-template.xlsx).');
  else bs.eachRow((r) => {
    const label = text(r.getCell(1).value).trim().toLowerCase();
    const f = BOOK_FIELDS.find((x) => x.label.toLowerCase() === label);
    if (f) book[f.key] = text(r.getCell(2).value).trim();
  });

  const tabs: Record<string, SheetRow[]> = {};
  for (const t of TABS) {
    const ws = wb.getWorksheet(t.name);
    if (!ws) continue; // a tab you deleted is just empty
    const headers = new Map<number, string>();
    ws.getRow(1).eachCell((cell, i) => {
      const h = text(cell.value).trim().toLowerCase();
      if (!h) return;
      const col = t.cols.find((c) => c.header.toLowerCase() === h);
      if (col) headers.set(i, col.key);
      else problems.push(`Tab "${t.name}": nepoznata kolona "${text(cell.value)}". Ne menjaj naslove kolona.`);
    });
    for (const c of t.cols) if (c.required && ![...headers.values()].includes(c.key)) problems.push(`Tab "${t.name}": nema kolone "${c.header}".`);
    const rows: SheetRow[] = [];
    ws.eachRow((r, n) => {
      if (n < 3) return; // header + grey example
      const cells: Record<string, string> = {};
      for (const [i, key] of headers) cells[key] = text(r.getCell(i).value).replace(/\r\n?/g, "\n").trim();
      if (Object.values(cells).some(Boolean)) rows.push({ row: n, cells });
    });
    tabs[t.name] = rows;
  }
  return { book, tabs, problems };
}
