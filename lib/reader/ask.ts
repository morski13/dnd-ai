// "Ask about the world": finds the things a question is about and the lines from the notes that answer it.
// Works only on what the reader already has (players only ever have what was shared).
import type { Analysis, MapNode } from "./types";

const STOP = new Set(("what who whom whose where when which why how does did do is are was were the a an and or of to in on at for with from about "
  + "know we us our they them their there this that these those any some have has had can could would should will tell me something anything "
  + "much many more most into than then also just like who's what's where's").split(" "));

export type Answer = { nodes: MapNode[]; lines: { text: string; secret: boolean; from: string; nodeId: string | null }[] };

const stem = (w: string) => w.toLowerCase().replace(/['’]s$/, "").replace(/(ers|er|ing|ed|es|s)$/, "");
const words = (t: string) => t.split(/[^\p{L}\p{N}'’]+/u).filter(Boolean);

export function ask(question: string, a: Analysis): Answer {
  const q = question.trim();
  if (q.length < 2) return { nodes: [], lines: [] };
  const lower = q.toLowerCase();
  const nodes = a.nodes
    .filter((n) => [n.label, ...n.aliases].some((al) => new RegExp(`(?<![\\p{L}])${al.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "u").test(lower)))
    .sort((x, y) => y.degree - x.degree);
  const keys = new Set(words(q).filter((w) => w.length >= 3 && !STOP.has(w.toLowerCase())).map(stem));
  const ids = new Set(nodes.map((n) => n.id));
  const label = new Map(a.nodes.map((n) => [n.id, n.label]));

  const scored: (Answer["lines"][number] & { score: number })[] = [];
  const seen = new Set<string>();
  const consider = (text: string, secret: boolean, from: string, nodeId: string | null, bonus: number) => {
    if (seen.has(text)) return;
    const hits = words(text).map(stem).filter((w) => keys.has(w)).length;
    const score = hits + bonus;
    if (score <= 0 || (hits === 0 && bonus < 2)) return;
    seen.add(text);
    scored.push({ text, secret, from, nodeId, score });
  };
  for (const n of a.nodes) for (const f of n.facts) consider(f.text, f.secret, n.label, n.id, ids.has(n.id) ? 2 : 0);
  for (const e of a.edges) {
    const bonus = (ids.has(e.a) ? 1 : 0) + (ids.has(e.b) ? 1 : 0);
    for (const ev of e.evidence) consider(ev.text, ev.secret, `${label.get(e.a)} ↔ ${label.get(e.b)}`, null, bonus);
  }
  scored.sort((x, y) => y.score - x.score || Number(x.secret) - Number(y.secret));
  return { nodes: nodes.slice(0, 3), lines: scored.slice(0, 6).map((r) => ({ text: r.text, secret: r.secret, from: r.from, nodeId: r.nodeId })) };
}
