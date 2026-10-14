// The assistant's knowledge finder (pure, tested): picks the few pieces of rules / spells / features / items /
// monsters / notes that a question is about, so the AI answers from real text instead of memory.
// How: names mentioned in the question win outright ("Misty Step", "Cunning Action"), then a BM25 word score
// over everything else. Everything is cut to a character budget so it fits small (free or self-hosted) models.

export type DocKind = "rule" | "spell" | "feat" | "feature" | "item" | "monster" | "lore" | "house" | "sheet" | "note";

export type KDoc = {
  id: string;
  kind: DocKind;
  title: string;
  text: string;
  /** names that count as "mentioned" (the title is always one) */
  names?: string[];
  secret?: boolean;
  /** a small push for kinds that matter more in this mode */
  boost?: number;
};

const STOP = new Set(("a an and are as at be but by can could do does did for from has have how i if in into is it its me my " +
  "of on or our so than that the their them then there these they this to up was we what when where which who why will with " +
  "would you your yes no not about also any all some more most just only after before while am get got use using used").split(" "));

/** lower-case words, light stemming ("attacks" → "attack", "grappled" → "grappl") */
export function words(s: string): string[] {
  return s.toLowerCase().replace(/[’']/g, "").split(/[^a-z0-9+]+/).filter((w) => w.length > 1 && !STOP.has(w)).map(stem);
}
function stem(w: string) {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 3 && w.endsWith("es") && /(sh|ch|x|ss)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/** a name or question as stemmed words between spaces, so "Opportunity Attacks" matches "opportunity attack" */
const norm = (s: string) => ` ${words(s).join(" ")} `;
/** "Glossary › Grappled [Condition]" → "grappled"; "Combat › Making an Attack (2/3)" → "making an attack" */
export function nameOf(title: string) {
  return title.split("›").pop()!.replace(/\[[^\]]*\]|\(\d+\/\d+\)/g, "").trim();
}

/** the thing's own name: "Spell: Misty Step" → "Misty Step" */
export const primaryName = (d: KDoc) => d.names?.[0] ?? nameOf(d.title);

export type Index = { docs: KDoc[]; tf: Map<string, number>[]; len: number[]; df: Map<string, number>; avg: number; names: { doc: number; name: string }[] };

export function buildIndex(docs: KDoc[]): Index {
  const tf: Map<string, number>[] = [], len: number[] = [], df = new Map<string, number>(), names: Index["names"] = [];
  docs.forEach((d, i) => {
    // the title counts three times: a piece called "Opportunity Attacks" is about opportunity attacks
    const ws = [...words(d.title), ...words(d.title), ...words(d.title), ...words(d.text)];
    const m = new Map<string, number>();
    for (const w of ws) m.set(w, (m.get(w) ?? 0) + 1);
    tf.push(m); len.push(ws.length);
    for (const w of m.keys()) df.set(w, (df.get(w) ?? 0) + 1);
    for (const n of new Set([nameOf(d.title), ...(d.names ?? [])])) {
      const k = norm(n).trim();
      // very short names ("Help", "Hide") would match too much: they're found by the word score instead
      if (k && n.trim().length >= 5) names.push({ doc: i, name: k });
    }
  });
  return { docs, tf, len, df, avg: len.reduce((a, b) => a + b, 0) / Math.max(1, len.length), names };
}

export type Hit = { doc: KDoc; score: number; named: boolean };

/** Best matches for a question. `allowSecret` false drops secret docs before scoring. */
export function search(ix: Index, question: string, opts: { allowSecret?: boolean; limit?: number; namesFrom?: string } = {}): Hit[] {
  const q = words(question);
  // names only count when the person wrote them (not words the app added to the search)
  const qn = norm(opts.namesFrom ?? question);
  const N = ix.docs.length, k1 = 1.4, b = 0.75;
  const named = new Map<number, number>();
  for (const { doc, name } of ix.names) {
    if (qn.includes(` ${name} `)) named.set(doc, Math.max(named.get(doc) ?? 0, name.split(" ").length));
  }
  const hits: Hit[] = [];
  ix.docs.forEach((d, i) => {
    if (d.secret && !opts.allowSecret) return;
    let s = 0;
    for (const w of new Set(q)) {
      const f = ix.tf[i].get(w);
      if (!f) continue;
      const idf = Math.log(1 + (N - (ix.df.get(w) ?? 0) + 0.5) / ((ix.df.get(w) ?? 0) + 0.5));
      s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * ix.len[i] / ix.avg));
    }
    const n = named.get(i);
    if (n) s += 12 + 4 * n;               // named outright: always near the top (longer names beat shorter ones)
    if (s <= 0) return;
    hits.push({ doc: d, score: s * (1 + (d.boost ?? 0)), named: !!n });
  });
  hits.sort((a, b) => b.score - a.score);
  // a name inside a longer named thing isn't what was asked ("Shield" inside "Shield of Faith")
  const longNames = hits.filter((h) => h.named).map((h) => norm(primaryName(h.doc)));
  const out = hits.filter((h) => { const me = norm(primaryName(h.doc)); return !longNames.some((l) => l !== me && l.includes(me)); });
  return out.slice(0, opts.limit ?? 12);
}

export type Picked = { id: string; kind: DocKind; title: string; text: string; secret: boolean };

/**
 * Turn hits into numbered sources [S1], [S2]… within a character budget. Named things first, then the rest;
 * each piece is cut to `per` characters; weak matches (far below the best) are dropped.
 */
export function pick(hits: Hit[], budget = 9000, per = 1600): Picked[] {
  const out: Picked[] = [];
  const best = Math.max(0, ...hits.filter((h) => !h.named).map((h) => h.score));
  let used = 0;
  const seen = new Set<string>();
  for (const h of [...hits.filter((x) => x.named), ...hits.filter((x) => !x.named)]) {
    if (!h.named && h.score < best * 0.25) continue;
    const key = `${h.doc.kind}|${nameOf(h.doc.title).toLowerCase()}|${h.doc.text.slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let text = h.doc.text.trim();
    if (text.length > per) text = text.slice(0, per).replace(/\s+\S*$/, "") + " …";
    if (used + text.length > budget) { if (out.length >= 3) break; else continue; }
    used += text.length;
    out.push({ id: `S${out.length + 1}`, kind: h.doc.kind, title: h.doc.title, text, secret: !!h.doc.secret });
  }
  return out;
}
