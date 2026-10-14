// Exports the Tavern's good answers as training data for our own model.
//   node scripts/export-training.mjs                 → training/tavern-training.jsonl (👍 answers + 👎 answers with a correction)
//   node scripts/export-training.mjs --with-unrated  → also answers nobody rated (more data, a bit lower quality)
// Never exports answers that used DM-only notes. Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY from .env.local.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SECRET_KEY;
if (!url || !key) { console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local"); process.exit(1); }
const unrated = process.argv.includes("--with-unrated");
const db = createClient(url, key, { auth: { persistSession: false } });

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("assistant_messages")
    .select("id, content, verdict, sources, rating, correction, prompt, has_secrets")
    .eq("role", "assistant").eq("has_secrets", false).not("prompt", "is", null)
    .order("created_at").range(from, from + 999);
  if (error) { console.error(error.message); process.exit(1); }
  rows.push(...data);
  if (data.length < 1000) break;
}

const verdictOf = (t) => (/^\W*(yes|aye|indeed|arr,? (aye|yes))\b/i.test(t) ? "yes" : /^\W*(no|nay|nope)\b/i.test(t) ? "no" : "info");
let good = 0, fixed = 0, plain = 0;
const lines = [];
for (const r of rows) {
  let answer = null, verdict = r.verdict ?? "info";
  if (r.correction) { answer = r.correction; verdict = verdictOf(r.correction); fixed++; }
  else if (r.rating === 1) { answer = r.content; good++; }
  else if (r.rating === 0 && unrated) { answer = r.content; plain++; }
  if (!answer) continue;
  const sources = (r.sources ?? []).map((s) => s.id);
  lines.push(JSON.stringify({ messages: [...r.prompt, { role: "assistant", content: JSON.stringify({ verdict, answer, sources }) }] }));
}
mkdirSync("training", { recursive: true });
writeFileSync("training/tavern-training.jsonl", lines.join("\n") + "\n");
console.log(`Wrote training/tavern-training.jsonl: ${lines.length} examples (${good} liked, ${fixed} corrected${unrated ? `, ${plain} unrated` : ""}).`);
if (lines.length < 200) console.log("Tip: a few hundred examples is a good start; keep using the Tavern and rating answers.");
