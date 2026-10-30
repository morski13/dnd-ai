// npm run book -- books/my-book.xlsx
// Checks a filled book template and, when there are no errors, writes books/<code>.sql for Supabase.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { checkBook, report } from "../../lib/books/check";
import { bookSql } from "../../lib/books/sql";
import { loadSrdIndex } from "../../lib/books/srd-index";
import { readWorkbook } from "./xlsx";

const file = process.argv[2];
if (!file) {
  console.log("Upotreba:  npm run book -- books/ime-fajla.xlsx\nPrazan template: tools/books/book-template.xlsx (kopiraj ga u books/ pa popuni).");
  process.exit(1);
}
if (!existsSync(file)) {
  console.log(`Ne nalazim fajl: ${file}`);
  process.exit(1);
}

async function main(file: string) {
const wb = await readWorkbook(file);
const result = checkBook(wb, loadSrdIndex()); // npm runs this from the project folder
const text = report(result);
console.log(text);

const outDir = join(dirname(resolve(file)));
mkdirSync(outDir, { recursive: true });
const stem = (result.book.code || basename(file).replace(/\.xlsx$/i, "")).toLowerCase();
writeFileSync(join(outDir, `${stem}-report.txt`), text + "\n");
if (result.issues.some((i) => i.level === "error")) {
  console.log(`\nIzveštaj: ${join(outDir, `${stem}-report.txt`)}`);
  process.exit(1);
}
const sqlPath = join(outDir, `${stem}.sql`);
writeFileSync(sqlPath, bookSql(result));
console.log(`\nSQL je spreman: ${sqlPath}\nSupabase → SQL Editor → nalepi ceo fajl → Run. (Prvi put pre toga: supabase/26-books.sql)`);
}

main(file).catch((e) => {
  console.log(`Ne mogu da pročitam fajl (${e instanceof Error ? e.message : e}). Da li je .xlsx napravljen od template-a?`);
  process.exit(1);
});
