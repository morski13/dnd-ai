// npm run book:template  →  tools/books/book-template.xlsx (empty) and tools/books/book-example.xlsx (a filled homebrew example)
import { EXAMPLE } from "./example";
import { writeTemplate } from "./xlsx";

async function main() {
  await writeTemplate("tools/books/book-template.xlsx");
  await writeTemplate("tools/books/book-example.xlsx", EXAMPLE);
  console.log("tools/books/book-template.xlsx and tools/books/book-example.xlsx are written.");
}
void main();
