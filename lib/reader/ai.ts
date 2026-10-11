// The AI reader, on top of the free smart reader: the smart reader finds who's who; the AI adds the links
// the rules can't see ("Warrik is secretly the Lord of the Seven Seas") and a short summary per box.
// Pure functions only (prompts, checking the AI's answer, merging). Talking to the AI is in lib/ai-reading.ts.
import { docLines } from "./smart";
import type { Analysis, MapEdge, ReaderDoc } from "./types";

export type AiLink = { a: string; b: string; label: string; why: string };
export type AiReading = { links: AiLink[]; summaries: Record<string, string> };
export type AiState = { configured: boolean; host: string | null; at: string | null; stale: boolean; model: string | null };

const MAX_NOTES = 24_000; // characters of notes sent (free tiers have small limits)

/** Short ids (n1, n2…) keep the prompt small and stop the AI inventing names. */
export function nodeIds(a: Analysis) {
  const list = a.nodes.filter((n) => n.type !== "event").map((n, i) => ({ short: `n${i + 1}`, n }));
  return { list, byShort: new Map(list.map((x) => [x.short, x.n.id])) };
}

export function readingPrompt(a: Analysis, docs: ReaderDoc[]) {
  const { list } = nodeIds(a);
  let notes = "";
  for (const d of docs) {
    const lines = docLines(d.doc).map((l) => `${l.secret ? "[DM only] " : ""}${l.kind.startsWith("h") ? "# " : ""}${l.text}`);
    const block = `\n=== ${d.title} (${d.folderName ?? d.folder}) ===\n${lines.join("\n")}\n`;
    if (notes.length + block.length > MAX_NOTES) { notes += `\n=== ${d.title} === (left out: too long)\n`; continue; }
    notes += block;
  }
  const system = "You read a Dungeons & Dragons campaign's notes and find how things connect. Use ONLY what the notes say; never invent people, places or facts. Reply with one JSON object and nothing else.";
  const user = `Things in the campaign (id | name | kind):
${list.map(({ short, n }) => `${short} | ${n.label} | ${n.type}`).join("\n")}

Notes:
${notes}

Return JSON: {"links":[{"a":"n1","b":"n2","label":"brother of","why":"one short sentence from the notes"}],"summaries":{"n1":"one or two sentences"}}
- links: connections between the ids above that the notes state or clearly imply (family, allies, enemies, secret identities, who lives/works where, who wants what). Up to 40. "label" is 1-4 words read as "a <label> b".
- summaries: for the most important ids, who or what it is in one or two plain sentences.
- Only use the ids listed.`;
  return [{ role: "system" as const, content: system }, { role: "user" as const, content: user }];
}

/** Check the AI's answer: known ids only, sensible sizes, no self-links, no duplicates. */
export function cleanReading(raw: unknown, a: Analysis): AiReading {
  const { byShort } = nodeIds(a);
  const r = (raw ?? {}) as { links?: unknown; summaries?: unknown };
  const seen = new Set<string>();
  const links: AiLink[] = [];
  for (const l of Array.isArray(r.links) ? r.links : []) {
    const x = l as Partial<Record<keyof AiLink, unknown>>;
    const a1 = byShort.get(String(x.a)), b1 = byShort.get(String(x.b));
    if (!a1 || !b1 || a1 === b1) continue;
    const key = [a1, b1].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ a: a1, b: b1, label: String(x.label ?? "linked to").replace(/\s+/g, " ").trim().slice(0, 40) || "linked to", why: String(x.why ?? "").replace(/\s+/g, " ").trim().slice(0, 240) });
    if (links.length >= 60) break;
  }
  const summaries: Record<string, string> = {};
  if (r.summaries && typeof r.summaries === "object") {
    for (const [k, v] of Object.entries(r.summaries as Record<string, unknown>)) {
      const id = byShort.get(k);
      if (id && typeof v === "string" && v.trim()) summaries[id] = v.replace(/\s+/g, " ").trim().slice(0, 400);
    }
  }
  return { links, summaries };
}

/**
 * Put the AI's reading on top of the smart reader's. `view` says which copy this is:
 * the DM copy was made from secret notes too, so anything not also in the player copy counts as secret.
 */
export function mergeAi(a: Analysis, reading: AiReading | null, view: "dm" | "player", publicReading: AiReading | null = null): Analysis {
  if (!reading) return a;
  const nodes = new Map(a.nodes.map((n) => [n.id, n]));
  const have = new Map(a.edges.map((e) => [[e.a, e.b].sort().join("|"), e]));
  const edges = a.edges.map((e) => ({ ...e }));
  const byKey = new Map(edges.map((e) => [[e.a, e.b].sort().join("|"), e]));
  const publicPairs = new Set((publicReading?.links ?? []).map((l) => [l.a, l.b].sort().join("|")));
  const extra: MapEdge[] = [];
  for (const l of reading.links) {
    const A = nodes.get(l.a), B = nodes.get(l.b);
    const key = [l.a, l.b].sort().join("|");
    if (!A || !B) continue; // gone since
    const secret = view === "dm" && (A.secret || B.secret || !publicPairs.has(key));
    const known = have.has(key) ? byKey.get(key)! : null;
    if (known) {
      // the smart reader already linked them: the AI only names the link (if the notes didn't) and adds its reason
      if (known.label === "connected" && (!secret || known.secret)) known.label = l.label; // never put a secret name on an open link
      if (l.why) known.evidence = [...known.evidence, { text: l.why, secret: secret || known.secret, docId: "", docTitle: "AI" }];
      continue;
    }
    extra.push({ id: `ai:${key}`, a: l.a, b: l.b, label: l.label, weight: 1, secret, ai: true,
      evidence: l.why ? [{ text: l.why, secret, docId: "", docTitle: "AI" }] : [] });
  }
  const out = a.nodes.map((n) => {
    const s = reading.summaries[n.id];
    if (!s || n.aiSummary) return n; // keep the first summary (the DM's own reading goes first)
    const secret = view === "dm" && (n.secret || !publicReading?.summaries[n.id]);
    return { ...n, aiSummary: { text: s, secret }, degree: n.degree + extra.filter((e) => e.a === n.id || e.b === n.id).length };
  });
  return { ...a, engine: `${a.engine}+ai`, nodes: out, edges: [...edges, ...extra] };
}

/** Plain lines for "Ask the AI" (only what this viewer may see). */
export function askContext(a: Analysis, withSecrets: boolean): string {
  const ok = <T extends { secret: boolean }>(x: T) => withSecrets || !x.secret;
  const label = new Map(a.nodes.map((n) => [n.id, n.label]));
  const out: string[] = [];
  for (const n of a.nodes.filter(ok)) {
    const facts = n.facts.filter(ok).map((f) => f.text);
    if (n.aiSummary && ok(n.aiSummary)) facts.unshift(n.aiSummary.text);
    if (facts.length) out.push(`${n.label} (${n.type}): ${facts.join(" | ")}`);
  }
  for (const e of a.edges.filter(ok)) {
    if (!label.has(e.a) || !label.has(e.b)) continue;
    const ev = e.evidence.filter(ok).map((v) => v.text)[0];
    out.push(`${label.get(e.a)} —${e.label}→ ${label.get(e.b)}${ev ? `: ${ev}` : ""}`);
  }
  let s = "";
  for (const l of out) { if (s.length + l.length > MAX_NOTES) break; s += l + "\n"; }
  return s;
}

export function askPrompt(question: string, context: string) {
  return [
    { role: "system" as const, content: "You answer questions about a Dungeons & Dragons campaign using ONLY the notes given. If the notes don't say, answer that the notes don't say. Never invent. Reply with one JSON object and nothing else." },
    { role: "user" as const, content: `Notes:\n${context}\nQuestion: ${question.slice(0, 500)}\n\nReturn JSON: {"answer":"2-4 plain sentences","about":["names from the notes the answer is about"]}` },
  ];
}
