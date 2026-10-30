// Writes the SQL for one checked book. Running it again replaces that book (nothing else is touched).
import type { CheckResult } from "./check";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

export function bookSql(r: CheckResult, when = new Date().toISOString().slice(0, 10)): string {
  const all = JSON.stringify([r.spells, r.items, r.monsters, r.feats, r.content]);
  let tag = "book";
  for (let n = 1; all.includes(`$${tag}$`); n++) tag = `book${n}`; // a dollar-quote the text can't break
  const json = (v: unknown) => `$${tag}$${JSON.stringify(v)}$${tag}$::jsonb`;
  const b = q(r.book.name);
  const out: string[] = [];
  out.push(`-- ${r.book.name} [${r.book.code}] — made by \`npm run book\` on ${when}.`);
  out.push(`-- ${r.spells.length} spells, ${r.items.length} items, ${r.monsters.length} monsters, ${r.feats.length} feats, ${r.content.length} builder/level-up rows.`);
  out.push("-- Supabase → SQL Editor → paste the whole file → Run. Running it again replaces this book.");
  out.push("-- Contains text from your book: keep this file private (don't commit it to a public repo).");
  out.push("");
  out.push("do $check$ begin");
  out.push("  if to_regclass('public.book_content') is null then");
  out.push("    raise exception 'Run supabase/26-books.sql first (it adds the tables for books).';");
  out.push("  end if;");
  out.push("end $check$;");
  out.push("");
  out.push("begin;");
  out.push(`delete from public.srd_spells   where book = ${b};`);
  out.push(`delete from public.srd_items    where book = ${b};`);
  out.push(`delete from public.srd_monsters where book = ${b};`);
  out.push(`delete from public.srd_feats    where book = ${b};`);
  out.push(`delete from public.book_content where book = ${b};`);
  if (r.spells.length) {
    out.push("");
    out.push("insert into public.srd_spells (name, level, school, classes, casting_time, ritual, range, components, duration, concentration, description, higher_levels, action, roll, book)");
    out.push("select name, level, school, classes, casting_time, ritual, range, components, duration, concentration, description, higher_levels, action, roll, book");
    out.push(`from jsonb_populate_recordset(null::public.srd_spells, ${json(r.spells)});`);
  }
  if (r.items.length) {
    out.push("");
    out.push("insert into public.srd_items (id, rules, name, kind, category, rarity, attunement, cost_cp, weight, bundle, summary, description, data, book)");
    out.push("select id, rules, name, kind, category, rarity, attunement, cost_cp, weight, bundle, summary, description, data, book");
    out.push(`from jsonb_populate_recordset(null::public.srd_items, ${json(r.items)});`);
  }
  if (r.monsters.length) {
    out.push("");
    out.push("insert into public.srd_monsters (name, size_type, cr, cr_num, xp, ac, hp, init, data, book)");
    out.push("select name, size_type, cr, cr_num, xp, ac, hp, init, data, book");
    out.push(`from jsonb_populate_recordset(null::public.srd_monsters, ${json(r.monsters)});`);
  }
  if (r.feats.length) {
    out.push("");
    out.push("insert into public.srd_feats (name, category, prerequisite, description, book)");
    out.push("select name, category, prerequisite, description, book");
    out.push(`from jsonb_populate_recordset(null::public.srd_feats, ${json(r.feats)});`);
  }
  if (r.content.length) {
    out.push("");
    out.push("insert into public.book_content (kind, rules, parent, name, book, data)");
    out.push("select kind, rules, parent, name, book, data");
    out.push(`from jsonb_populate_recordset(null::public.book_content, ${json(r.content)});`);
  }
  out.push("");
  out.push("commit;");
  out.push("");
  out.push(`-- What's in the database now:  select * from public.books_added where book = ${b};`);
  return out.join("\n") + "\n";
}
