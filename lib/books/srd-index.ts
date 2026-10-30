// What the app already has (the SRD), read from the repo's own files, so the checker can catch
// name clashes and point at things that don't exist. Node only (the checker and its tests).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import b14 from "../builder/data-2014.json";
import b24 from "../builder/data-2024.json";
import l14 from "../levelup/data-2014.json";
import l24 from "../levelup/data-2024.json";
import type { BuilderData } from "../builder/types";
import type { RulesData } from "../levelup/types";

export type SrdItem = { id: string; rules: "2014" | "2024"; name: string; kind: string; category: string | null; data: Record<string, unknown> | null };
export type SrdIndex = {
  spells: Set<string>;         // lower-case names
  feats: Set<string>;          // srd_feats names (lower-case)
  monsters: Set<string>;
  items: SrdItem[];
  rules: Record<"2014" | "2024", RulesData>;
  builder: Record<"2014" | "2024", BuilderData>;
};

const lc = (s: string) => s.trim().toLowerCase();

/** The JSON between the n-th pair of $srd$ … $srd$ in a SQL file. */
function srdJson(sql: string, n = 0): { name: string }[] {
  let at = 0;
  for (let k = 0; ; k++) {
    const i = sql.indexOf("$srd$", at);
    const j = sql.indexOf("$srd$", i + 5);
    if (i < 0 || j < 0) return [];
    if (k === n) return JSON.parse(sql.slice(i + 5, j));
    at = j + 5;
  }
}

/** The value tuples of `insert … values ('a', 'b', null, 3, '{…}'::jsonb), (…);` */
export function sqlTuples(sql: string): (string | number | boolean | null)[][] {
  const out: (string | number | boolean | null)[][] = [];
  let i = sql.indexOf(" values");
  while (i >= 0 && i < sql.length) {
    const start = sql.indexOf("\n('", i);
    if (start < 0) break;
    i = start + 2;
    const row: (string | number | boolean | null)[] = [];
    while (i < sql.length) {
      while (sql[i] === " " || sql[i] === ",") i++;
      if (sql[i] === "'") {
        let s = ""; i++;
        for (;;) {
          if (sql[i] === "'" && sql[i + 1] === "'") { s += "'"; i += 2; continue; }
          if (sql[i] === "'") { i++; break; }
          s += sql[i++];
        }
        if (sql.startsWith("::jsonb", i)) i += 7;
        row.push(s);
      } else {
        const m = /^(null|true|false|-?\d+(?:\.\d+)?)/.exec(sql.slice(i, i + 30));
        if (!m) break;
        row.push(m[1] === "null" ? null : m[1] === "true" ? true : m[1] === "false" ? false : Number(m[1]));
        i += m[1].length;
      }
      while (sql[i] === " ") i++;
      if (sql[i] === ")") { i++; break; }
    }
    out.push(row);
    if (sql[i] === ";") break;
  }
  return out;
}

export function loadSrdIndex(root = process.cwd()): SrdIndex {
  const read = (f: string) => readFileSync(join(root, "supabase", f), "utf8");
  const s05 = read("05-spells-feats.sql");
  const s07 = read("07-fight-planner.sql");
  const items: SrdItem[] = [];
  for (const f of ["14-item-library-2014-part1.sql", "14-item-library-2014-part2.sql", "14-item-library-2014-part3.sql", "15-item-library-2024-part1.sql", "15-item-library-2024-part2.sql"]) {
    // columns: id, rules, name, kind, category, rarity, attunement, cost_cp, weight, bundle, summary, description, data
    for (const t of sqlTuples(read(f))) {
      let data: Record<string, unknown> | null = null;
      try { data = typeof t[12] === "string" ? JSON.parse(t[12] as string) : null; } catch { data = null; }
      items.push({ id: String(t[0]), rules: t[1] as "2014" | "2024", name: String(t[2]), kind: String(t[3]), category: (t[4] as string) ?? null, data });
    }
  }
  return {
    spells: new Set(srdJson(s05, 0).map((x) => lc(x.name))),
    feats: new Set(srdJson(s05, 1).map((x) => lc(x.name))),
    monsters: new Set(srdJson(s07, 0).map((x) => lc(x.name))),
    items,
    rules: { "2014": l14 as unknown as RulesData, "2024": l24 as unknown as RulesData },
    builder: { "2014": b14 as unknown as BuilderData, "2024": b24 as unknown as BuilderData },
  };
}
