// The free "smart reader": reads the DM's documents with plain rules (no AI, no cost, runs instantly)
// and finds who and what is in the campaign, how they connect, what must happen and the milestones.
// It never invents anything: every connection and story point points back to a line in a document.
import type { DocNode } from "../vault/doc";
import type { Analysis, CampaignReader, Evidence, Fact, MapEdge, MapNode, Milestone, NodeType, ReaderDoc, ReaderInput, StoryPoint } from "./types";

// ------------------------------------------------------------------ lines
export type Line = { text: string; secret: boolean; kind: "h1" | "h2" | "h3" | "p" | "li"; section: string; field: { label: string; value: string } | null };

const inlineText = (n: DocNode): string =>
  n.type === "text" ? n.text ?? "" : n.type === "hardBreak" ? " " : (n.content ?? []).map(inlineText).join("");

const FIELD = /^([A-Z][A-Za-z /'&()-]{1,32}):\s+(.+)$/;

/** A document as lines, each knowing whether it sits in a DM-only block and under which heading. */
export function docLines(doc: DocNode): Line[] {
  const out: Line[] = [];
  let section = "";
  const push = (raw: string, kind: Line["kind"], secret: boolean) => {
    const text = raw.replace(/\s+/g, " ").trim();
    if (!text) return;
    const f = kind === "p" || kind === "li" ? text.match(FIELD) : null;
    out.push({ text, secret, kind, section, field: f ? { label: f[1].trim(), value: f[2].trim() } : null });
  };
  const walk = (n: DocNode, secret: boolean) => {
    if (n.type === "secret") { n.content?.forEach((c) => walk(c, true)); return; }
    if (n.type === "heading") {
      const level = Math.min(3, Math.max(1, Number(n.attrs?.level) || 1));
      const t = inlineText(n).trim();
      if (level > 1 && t) section = t;
      push(t, `h${level}` as Line["kind"], secret);
      return;
    }
    if (n.type === "paragraph") { push(inlineText(n), "p", secret); return; }
    if (n.type === "listItem") {
      for (const c of n.content ?? []) {
        if (c.type === "paragraph") push(inlineText(c), "li", secret);
        else walk(c, secret);
      }
      return;
    }
    n.content?.forEach((c) => walk(c, secret));
  };
  walk(doc, false);
  return out;
}

// ------------------------------------------------------------------ names
const HONORIFIC = /^(?:abbess|abbot|mayor|lord|lady|sir|dame|king|queen|prince|princess|captain|brother|sister|father|mother|master|mistress|elder|duke|duchess|baron|baroness|count|countess|archmage|high priest(?:ess)?|priest(?:ess)?|general|commander|chief|warden|magistrate)\s+/i;
const STOP = new Set(["The", "And", "Saint", "Old", "New", "Great", "Little", "High", "Low", "North", "South", "East", "West", "Northern", "Southern",
  "Iron", "Black", "White", "Red", "Grey", "Gray", "Dark", "Lost", "First", "Last", "Milestone", "Session", "Party", "Find", "Clear", "Recover", "Pay"]);
const PLACE_NOUNS = new Set(["abbey", "tavern", "inn", "tower", "watchtower", "bridge", "temple", "castle", "keep", "fort", "fortress", "monastery", "market",
  "mine", "mines", "cave", "caves", "crypt", "tomb", "library", "harbor", "harbour", "docks", "manor", "palace", "village", "town", "city", "forest", "woods",
  "swamp", "marsh", "lake", "river", "pass", "ruins", "shrine", "chapel", "cathedral", "academy", "guildhall", "arena", "prison", "lighthouse", "mill"]);
const FACTION_NOUNS = new Set(["order", "court", "guild", "council", "church", "cult", "circle", "company", "brotherhood", "sisterhood", "league", "legion", "clan", "house", "society", "watch", "crew", "band", "syndicate", "covenant"]);
const ITEM_NOUNS = new Set(["crown", "sword", "blade", "key", "medallion", "amulet", "ring", "staff", "map", "book", "tome", "orb", "dagger", "shield", "helm", "cloak", "gem", "stone", "relic", "chalice", "scroll", "mask", "idol", "lantern", "horn", "harp", "mirror", "seal",
  "jar", "potion", "bottle", "flask", "vial", "chest", "box", "letter", "note", "coin", "crystal", "egg", "bow", "axe", "hammer", "spear", "wand", "rod", "tablet", "skull", "heart"]);

type Alias = { text: string; ci: boolean; id: string; full: boolean };

const cleanTitle = (t: string) => {
  const c = t.replace(/\s*\([^)]*\)\s*/g, " ").replace(/^milestone:\s*/i, "").replace(/\s+/g, " ").trim();
  return c.charAt(0).toUpperCase() + c.slice(1);
};
const noThe = (t: string) => t.replace(/^the\s+/i, "");
const words = (t: string) => t.split(/\s+/).map((w) => w.replace(/['’]s$/, "").replace(/[^\p{L}\p{N}-]/gu, "")).filter(Boolean);
const isName = (w: string) => /^\p{Lu}/u.test(w) && w.length >= 3 && !STOP.has(w);

function aliasesFor(id: string, title: string, type: NodeType, lines: Line[]): Alias[] {
  const out: Alias[] = [];
  const add = (text: string, ci = false, full = false) => { const t = text.trim(); if (t.length >= 3) out.push({ text: t, ci, id, full }); };
  const base = cleanTitle(title);
  add(base, false, true);
  add(noThe(base), false, true);
  const ws = words(noThe(base));
  const last = ws[ws.length - 1]?.toLowerCase() ?? "";

  if (type === "npc" || type === "party") {
    const bare = noThe(base).replace(HONORIFIC, "");
    add(bare);
    for (const w of words(bare)) if (isName(w)) add(w);
  } else if (type === "place") {
    if (ws.length > 1 && PLACE_NOUNS.has(last)) {
      if (isName(ws[0]) && !PLACE_NOUNS.has(ws[0].toLowerCase())) add(ws[0]);
      add(`the ${last}`, true);
    }
  } else if (type === "faction") {
    const first = ws[0]?.toLowerCase() ?? "";
    if (FACTION_NOUNS.has(last)) add(`the ${ws[ws.length - 1]}`);
    else if (FACTION_NOUNS.has(first)) add(`the ${ws[0]}`);
  } else if (type === "lore") {
    const owner = base.match(/^(\p{Lu}[\p{L}-]+)['’]s\s+(.+)$/u);
    const rest = owner ? owner[2] : noThe(base);
    if (owner) add(rest);
    if (ITEM_NOUNS.has(last)) {
      add(`the ${last}`, true);
      if (owner) add(`${owner[1]}'s ${last}`, true);
    }
  }
  // "known as "the Fog Lord"" / Aliases: … in the entity's own page
  for (const l of lines) {
    if (l.field && /^(also known as|aliases?|aka|nicknames?)$/i.test(l.field.label)) for (const a of l.field.value.split(/[,;/]/)) add(a.replace(/[“”"]/g, ""));
    for (const m of l.text.matchAll(/(?:known as|called|aka|nicknamed|\bas)\s+[“"]([^”"]{3,40})[”"]/gi)) add(m[1]);
  }
  return out;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/['’]/g, "['’]");

/** Finds every entity named in a piece of text (longest name wins, no overlaps). */
export function makeMatcher(aliases: Alias[]) {
  const cs = aliases.filter((a) => !a.ci).sort((x, y) => y.text.length - x.text.length);
  const ci = aliases.filter((a) => a.ci).sort((x, y) => y.text.length - x.text.length);
  const norm = (s: string) => s.replace(/’/g, "'");
  const csMap = new Map(cs.map((a) => [norm(a.text), a.id]));
  const ciMap = new Map(ci.map((a) => [norm(a.text).toLowerCase(), a.id]));
  const re = (list: Alias[], flags: string) => list.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${list.map((a) => esc(a.text)).join("|")})(?![\\p{L}\\p{N}])`, flags) : null;
  const reCs = re(cs, "gu"), reCi = re(ci, "giu");
  return (text: string): string[] => {
    const hits: { start: number; end: number; id: string }[] = [];
    for (const m of reCs ? text.matchAll(reCs) : []) { const id = csMap.get(norm(m[0])); if (id) hits.push({ start: m.index!, end: m.index! + m[0].length, id }); }
    for (const m of reCi ? text.matchAll(reCi) : []) { const id = ciMap.get(norm(m[0]).toLowerCase()); if (id) hits.push({ start: m.index!, end: m.index! + m[0].length, id }); }
    hits.sort((a, b) => a.start - b.start || b.end - a.end);
    const ids: string[] = [];
    let until = -1;
    for (const h of hits) { if (h.start < until) continue; until = h.end; ids.push(h.id); }
    return ids;
  };
}

// ------------------------------------------------------------------ the reader
const TYPE_OF: Record<string, NodeType> = { npcs: "npc", places: "place", factions: "faction", lore: "lore", goals: "quest", plans: "plan", party: "party" };

// ------------------------------------------------------------------ names with no page yet
const KIN = /^(brother|sister|son|daughter|father|mother|parents?|wife|husband|spouse|uncle|aunt|cousin|nephew|niece|grandfather|grandmother|twin|friend|lover|rival|enemy|mentor|apprentice|master|patron|employer|servant|ward|guardian)s?$/i;
const PLACE_SUFFIX = /^\p{Lu}\p{Ll}{2,}(?:town|ford|burg|bury|ville|port|haven|shire|dale|wick|stead|mouth|holm|gate|falls?|moor|wood|keep|hold|spire|crest|reach|ton|ham|grad|heim)$/u;
const COMMON = new Set(("the a an if when then but and or after before during in on at to he she they it we you his her their its this that these those "
  + "scene session sessions must dm party players player loot rewards reward notes note secret secrets goal goals milestone act chapter part day night "
  + "monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december "
  + "strength dexterity constitution intelligence wisdom charisma arcana perception stealth insight dc hp ac gp sp cp xp new old").split(" "));
const NAME_RE = /(?<![\p{L}\p{N}'’])(\p{Lu}[\p{L}'’-]*(?:\s+(?:(?:of the|of|the|de|du|von|van|del|da)\s+)?\p{Lu}[\p{L}'’-]*)+)/gu;

function guessType(label: string): NodeType {
  const ws = label.split(/\s+/);
  const low = ws.map((w) => w.toLowerCase().replace(/['’]s$/, ""));
  if (HONORIFIC.test(label + " ")) return "npc";
  if (PLACE_SUFFIX.test(ws[ws.length - 1]) || PLACE_NOUNS.has(low[low.length - 1])) return "place";
  if (low.some((w) => FACTION_NOUNS.has(w))) return "faction";
  if (low.some((w) => ITEM_NOUNS.has(w))) return "lore";
  return ws.length <= 3 ? "npc" : "lore";
}

/** Names the DM wrote that have no page yet ("Lord of the Seven Seas", "Milltown", "Jar of confidence"). */
function discover(all: { d: ReaderDoc; lines: Line[] }[], known: (t: string) => string[]) {
  const found = new Map<string, { label: string; count: number; important: boolean }>();
  const add = (raw: string, important: boolean, bullet = false) => {
    let label = raw.trim().replace(/[.,;:!?)]+$/, "");
    const ws = label.split(/\s+/);
    while (ws.length && COMMON.has(ws[0].toLowerCase())) ws.shift();
    label = ws.join(" ");
    if (!label || known(label).length || known(`the ${label}`).length || known(raw).length) return;
    const multi = ws.length >= 2 && ws.filter((w) => /^\p{Lu}/u.test(w) && !COMMON.has(w.toLowerCase())).length >= 2;
    if (!multi && !PLACE_SUFFIX.test(label) && !bullet) return;
    if (/\d/.test(label) || label.length > 48) return;
    const k = label.toLowerCase();
    const f = found.get(k) ?? { label: label.charAt(0).toUpperCase() + label.slice(1), count: 0, important: false };
    f.count++; f.important ||= important;
    found.set(k, f);
  };
  for (const { d, lines } of all) {
    const keyDoc = d.folder === "plans" || d.folder === "goals" || d.folder === "party";
    for (const l of lines) {
      if (l.kind === "h1" || l.kind === "h2" || l.kind === "h3") continue;
      const text = l.field ? l.field.value : l.text;
      // "Sister: Nella Quickfoot", "Mentor: Old Hagen"
      if (l.field && KIN.test(l.field.label)) for (const part of l.field.value.split(/,|;| and /)) {
        const name = part.trim().match(/^(\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+){0,2})/u)?.[1];
        if (name) add(name, true, true);
      }
      for (const m of text.matchAll(NAME_RE)) add(m[1], keyDoc);
      for (const w of text.match(/\p{Lu}\p{Ll}+/gu) ?? []) if (PLACE_SUFFIX.test(w)) add(w, keyDoc);
      // "his brother Warrik", "a smith named Olda": a single name right after a family word or "named"
      for (const m of text.matchAll(/\b(?:brother|sister|son|daughter|father|mother|wife|husband|uncle|aunt|cousin|nephew|niece|grandfather|grandmother|twin|friend|lover|rival|apprentice|mentor|servant|named|called)\s+(\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+)?)/gu)) add(m[1], true, true);
      // a short bullet under "Must happen" that names a thing ("Jar of confidence")
      if (d.folder === "plans" && l.kind === "li" && /must happen|key events|important/i.test(l.section)) {
        const ws = l.text.split(/\s+/);
        const first = ws[0]?.toLowerCase().replace(/['’]s$/, "") ?? "";
        if (ws.length <= 6 && !/[.!?]$/.test(l.text) && (ITEM_NOUNS.has(first) || HONORIFIC.test(l.text + " "))) add(l.text, true, true);
      }
    }
  }
  return [...found.values()].filter((f) => f.important || f.count >= 2);
}
const isNoteTitle = (t: string) => /timeline|recap|session\s*\d|journal|log\b|notes?\b/i.test(t);

const REL: [RegExp, string][] = [
  [/^faction$/i, "member of"], [/^lives in$/i, "lives in"], [/^located in$/i, "located in"], [/^leader$/i, "led by"],
  [/^given by$/i, "given by"], [/owner/i, "held by"], [/allies|enemies/i, "ally / enemy"], [/relationship/i, "relationship"],
  [/^role$/i, "role"], [/^reward$/i, "reward"], [/^goal$/i, "goal"],
];
function relation(l: Line, inValue: boolean): string {
  if (l.field && inValue) {
    for (const [re, label] of REL) if (re.test(l.field.label)) return label;
    if (KIN.test(l.field.label)) return l.field.label.toLowerCase();
  }
  const kin = l.text.match(/\b(brother|sister|son|daughter|father|mother|wife|husband|uncle|aunt|cousin|twin|mentor|apprentice|rival)\b/i);
  if (kin) return kin[1].toLowerCase();
  if (/family|relatives/i.test(l.section)) return "family";
  if (/friends|allies/i.test(l.section)) return "friend";
  if (/enem|rival/i.test(l.section)) return "enemy";
  if (/goals|bonds|ties/i.test(l.section)) return "bond";
  if (/important npcs|who.?s here|people here|lives here/i.test(l.section)) return "found here";
  if (/what needs to happen|steps|scenes?|must happen/i.test(l.section)) return "part of the story";
  return "";
}

function planSummary(lines: Line[]): string {
  const must = lines.filter((l) => l.kind === "li" && /must happen/i.test(l.section)).length;
  const scenes = lines.filter((l) => l.kind === "h3" && /scene/i.test(l.text)).length;
  return ["Session plan", must && `${must} thing${must === 1 ? "" : "s"} that must happen`, scenes && `${scenes} scene${scenes === 1 ? "" : "s"}`].filter(Boolean).join(" · ");
}

function summaryOf(lines: Line[], showSecrets: boolean): string {
  const ok = (l: Line) => showSecrets || !l.secret;
  const parts: string[] = [];
  const role = lines.find((l) => ok(l) && l.field && /^(role|type|goal)$/i.test(l.field.label));
  const desc = lines.find((l) => ok(l) && !l.field && (l.kind === "p" || l.kind === "li") && /description|what it does|^$/i.test(l.section))
    ?? lines.find((l) => ok(l) && !l.field && (l.kind === "p" || l.kind === "li"));
  const rel = lines.find((l) => ok(l) && l.field && /relationship|owner|given by|leader|located in/i.test(l.field.label));
  if (role) parts.push(role.field!.value.replace(/\.?$/, "."));
  if (desc) parts.push(desc.text.replace(/\.?$/, "."));
  if (rel && !parts.some((p) => p.includes(rel.field!.value))) parts.push(`${rel.field!.label}: ${rel.field!.value.replace(/\.?$/, ".")}`);
  const s = parts.join(" ");
  return s.length > 260 ? s.slice(0, 257).trimEnd() + "…" : s;
}

const WHEN = /\b(before|by|after|in|during|around)\s+session\s+(\d+)\b|\bsession\s+(\d+)\b|\b(first|opening|early|middle|final|last|closing)\s+(act|part|chapter)\b|\bmiddle of the campaign\b|\bend of the campaign\b|\bact\s+(\d+|one|two|three|i{1,3})\b/i;
function whenOf(text: string): { when: string; rank: number } | null {
  const m = text.match(WHEN);
  if (!m) return null;
  const s = m[0];
  const n = Number(m[2] ?? m[3]);
  if (n) return { when: s, rank: n + (/after/i.test(s) ? 0.5 : /before|by/i.test(s) ? -0.5 : 0) };
  if (/first|opening|early|act (1|one|i)\b/i.test(s)) return { when: s, rank: 5 };
  if (/middle|act (2|two|ii)\b/i.test(s)) return { when: s, rank: 50 };
  if (/final|last|closing|end|act (3|three|iii)\b/i.test(s)) return { when: s, rank: 100 };
  return { when: s, rank: 60 };
}

const MUST = /\bmust (?:happen|occur|take place|be done|not)\b|\b(?:has|have|needs?) to happen\b|\bdon'?t reveal\b|\bkey moment\b|\bno matter what\b|\bregardless of what\b/i;

export function analyzeSync({ docs, party }: ReaderInput, engine = "smart"): Analysis {
  type Ent = { id: string; label: string; type: NodeType; doc: ReaderDoc | null; lines: Line[]; noPage?: boolean; planId?: string; secret?: boolean };
  const all = docs.map((d) => ({ d, lines: docLines(d.doc) }));
  const ents: Ent[] = [];
  const selfOf = new Map<string, Ent>(); // document id → its box
  // the party first: a page in "Player characters" belongs to the character it's about
  for (const c of party) ents.push({ id: `pc:${c.id}`, label: c.name, type: "party", doc: null, lines: [] });
  const pcFor = (title: string) => {
    const t = ` ${cleanTitle(title).toLowerCase().replace(/[^\p{L}\p{N}' ]/gu, " ")} `;
    return ents.find((e) => e.type === "party" && !e.doc && (t.includes(` ${e.label.toLowerCase()} `) || t.includes(` ${e.label.toLowerCase().split(" ")[0]} `)));
  };
  // every page is on the map, connected or not (pictures aren't pages)
  for (const { d, lines } of all) {
    let type: NodeType = TYPE_OF[d.folder] ?? "note";
    if (type === "lore" && isNoteTitle(d.title)) type = "note";
    if (type === "party") {
      const pc = pcFor(d.title);
      if (pc) { pc.doc = d; pc.lines = lines; selfOf.set(d.id, pc); continue; }
    }
    const e: Ent = { id: `doc:${d.id}`, label: cleanTitle(d.title), type, doc: d, lines };
    ents.push(e);
    selfOf.set(d.id, e);
  }

  // names → entities (a name two entities share is dropped, unless it's someone's full title)
  const raw = ents.flatMap((e) => (e.type === "plan" ? []
    : e.type === "note" ? [{ text: e.label, ci: false, id: e.id, full: true }]   // other pages: only their exact title
    : aliasesFor(e.id, e.label, e.type, e.lines)));
  const owners = new Map<string, Set<string>>();
  for (const a of raw) { const k = a.text.toLowerCase(); owners.set(k, (owners.get(k) ?? new Set()).add(a.id)); }
  const seen = new Set<string>();
  const aliases = raw.filter((a) => {
    const k = a.text.toLowerCase() + "|" + a.id;
    if (seen.has(k)) return false;
    seen.add(k);
    return owners.get(a.text.toLowerCase())!.size === 1 || a.full;
  });
  const pageMatch = makeMatcher(aliases);

  // names written in the notes that have no page yet still get a place on the map
  for (const f of discover(all, pageMatch)) {
    const id = `new:${f.label.toLowerCase()}`;
    ents.push({ id, label: f.label, type: guessType(f.label), doc: null, lines: [], noPage: true });
    aliases.push({ text: f.label, ci: false, id, full: true });
    if (/[a-z]/.test(f.label.slice(1))) aliases.push({ text: f.label, ci: true, id, full: true });
  }
  const match = makeMatcher(aliases);

  // each bullet under "Must happen" in a session plan is an event on the map (unless it is just a name)
  const eventAt = new Map<string, string>(); // "docId:lineIndex" → node id
  for (const { d, lines } of all) {
    if (d.folder !== "plans") continue;
    lines.forEach((l, i) => {
      if (l.kind !== "li" || !/must happen|key events|key moments|important|no matter what/i.test(l.section)) return;
      const hits = match(l.text);
      const exact = hits.length === 1 && aliases.some((a) => a.id === hits[0] && a.text.toLowerCase() === l.text.toLowerCase().replace(/[.!]$/, ""));
      if (exact) { eventAt.set(`${d.id}:${i}`, hits[0]); return; }
      const id = `ev:${d.id}:${i}`;
      ents.push({ id, label: l.text.length > 42 ? l.text.slice(0, 41).trimEnd() + "…" : l.text, type: "event", doc: null, lines: [l], planId: d.id, secret: l.secret || !d.shared });
      eventAt.set(`${d.id}:${i}`, id);
    });
  }

  // connections, each with the lines that prove it
  const edges = new Map<string, MapEdge>();
  const link = (a: string, b: string, label: string, ev: Evidence) => {
    if (a === b) return;
    const key = [a, b].sort().join("~");
    let e = edges.get(key);
    if (!e) { e = { id: key, a, b, label: label || "connected", weight: 0, secret: true, evidence: [] }; edges.set(key, e); }
    else if (label && e.label === "connected") { e.label = label; e.a = a; e.b = b; }
    e.weight++;
    if (!ev.secret) e.secret = false;
    if (e.evidence.length < 6 && !e.evidence.some((x) => x.text === ev.text)) e.evidence.push(ev);
  };
  const mentions = new Map<string, Evidence[]>(); // for party members: where they come up
  let words = 0, secretFacts = 0;
  for (const { d, lines } of all) {
    const self = selfOf.get(d.id);
    lines.forEach((l, li) => {
      words += l.text.split(/\s+/).length;
      if (l.secret && l.kind !== "h1" && l.kind !== "h2" && l.kind !== "h3") secretFacts++;
      if (l.kind === "h1") return;
      const ev: Evidence = { text: l.text, secret: l.secret || !d.shared, docId: d.id, docTitle: d.title };
      const valueHits = l.field ? match(l.field.value) : [];
      const hits = [...new Set(match(l.text))].filter((id) => id !== self?.id);
      for (const id of hits) if (id.startsWith("pc:") || id.startsWith("new:")) { const m = mentions.get(id) ?? []; if (m.length < 8 && !m.some((x) => x.text === l.text)) m.push(ev); mentions.set(id, m); }
      const event = eventAt.get(`${d.id}:${li}`);
      if (self && event) {
        // plan → event (must happen) → what the event is about
        link(self.id, event, "must happen", ev);
        if (event.startsWith("ev:")) for (const id of hits) link(event, id, "involves", ev);
      } else if (self) {
        for (const id of hits) link(self.id, id, self.type === "plan" ? "in this plan" : relation(l, valueHits.includes(id)), ev);
        // timelines and other notes: things named in the same line belong together too
        if (self.type === "note") for (let i = 0; i < hits.length; i++) for (let j = i + 1; j < hits.length; j++) link(hits[i], hits[j], "", ev);
      } else {
        // notes: things named in the same line belong together
        for (let i = 0; i < hits.length; i++) for (let j = i + 1; j < hits.length; j++) link(hits[i], hits[j], "", ev);
      }
    });
  }

  const degree = new Map<string, number>();
  for (const e of edges.values()) { degree.set(e.a, (degree.get(e.a) ?? 0) + 1); degree.set(e.b, (degree.get(e.b) ?? 0) + 1); }

  const nodes: MapNode[] = ents.map((e) => {
    const seenIn = mentions.get(e.id) ?? [];
    const notes = new Set(seenIn.map((m) => m.docId)).size;
    const facts: Fact[] = e.doc
      ? e.lines.filter((l) => l.kind === "p" || l.kind === "li").map((l) => ({ text: l.text, secret: l.secret || !e.doc!.shared }))
      : e.type === "event" ? e.lines.map((l) => ({ text: l.text, secret: !!e.secret }))
      : seenIn.map((m) => ({ text: `${m.text} (${m.docTitle})`, secret: m.secret }));
    const summary = e.doc
      ? (e.type === "plan" ? planSummary(e.lines)
        : (e.type === "party" ? "Player character. " : e.type === "note" ? `${e.doc.folderName ?? "Page"}. ` : "")
          + (summaryOf(e.lines, !e.doc.shared) || summaryOf(e.lines, true)))
      : e.type === "event" ? `Must happen · from ${cleanTitle(all.find((x) => x.d.id === e.planId)?.d.title ?? "a session plan")}`
      : e.noPage ? `No page yet · named in ${notes} note${notes === 1 ? "" : "s"}`
      : "Player character" + (notes ? ` · named in ${notes} notes` : "");
    const secret = e.type === "party" ? false : e.doc ? !e.doc.shared : e.type === "event" ? !!e.secret : e.noPage ? seenIn.length > 0 && seenIn.every((m) => m.secret) : false;
    return {
      id: e.id, label: e.label, type: e.type, docId: e.doc?.id ?? e.planId ?? null, aliases: aliases.filter((a) => a.id === e.id).map((a) => a.text),
      summary, facts, status: e.doc?.status ?? null, degree: degree.get(e.id) ?? 0, secret,
      ...(e.noPage ? { noPage: true } : {}), ...(e.planId ? { planId: e.planId } : {}), ...(e.doc ? { folder: e.doc.folderName ?? e.doc.folder } : {}),
    };
  });

  // milestones and quests (Goals folder)
  const milestones: Milestone[] = [];
  all.filter(({ d }) => d.folder === "goals").forEach(({ d, lines }, i) => {
    const isMilestone = /^milestone\b/i.test(d.title) || lines.some((l) => l.field && /^milestone$/i.test(l.field.label));
    let w: { when: string; rank: number } | null = null;
    for (const l of lines) { w = whenOf(l.text); if (w) break; }
    const stepLines = lines.filter((l) => l.kind === "li" && (/need|steps|happen|todo|to do/i.test(l.section) || !l.section));
    milestones.push({
      id: d.id, docId: d.id, title: cleanTitle(d.title), status: d.status, when: w?.when ?? null, rank: w?.rank ?? 75 + i / 100,
      steps: (stepLines.length ? stepLines : lines.filter((l) => l.kind === "li")).map((l) => ({ text: l.text, secret: l.secret || !d.shared })),
      secret: !d.shared, kind: isMilestone ? "milestone" : "quest",
      givenBy: lines.find((l) => l.field && /given by/i.test(l.field.label))?.field!.value ?? null,
      reward: lines.find((l) => l.field && /reward/i.test(l.field.label))?.field!.value ?? null,
    });
  });
  milestones.sort((a, b) => (a.status === "done" ? 1 : 0) - (b.status === "done" ? 1 : 0) || (a.kind === b.kind ? a.rank - b.rank : a.kind === "milestone" ? -1 : 1));

  // must happen, no matter what the party does
  // the newest plan counts most (last edited; the session number breaks ties)
  const recency = (d: ReaderDoc) => (d.updatedAt ? Date.parse(d.updatedAt) : 0) + Number(d.title.match(/session\s*(\d+)/i)?.[1] ?? 0);
  const plans = all.filter(({ d }) => d.folder === "plans").sort((a, b) => recency(b.d) - recency(a.d));
  const latestPlan = plans[0]?.d.id;
  const points: StoryPoint[] = [];
  const add = (p: StoryPoint) => {
    const k = p.text.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").slice(0, 60);
    const old = points.find((x) => x.text.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").slice(0, 60) === k);
    if (old) { old.score = Math.max(old.score, p.score); return; }
    points.push(p);
  };
  const centrality = (ids: string[]) => ids.reduce((s, id) => s + Math.min(6, degree.get(id) ?? 0), 0) / 6;
  for (const { d, lines } of all) {
    if (d.status === "done") continue;
    const plan = d.folder === "plans";
    for (const l of lines) {
      if (l.kind === "h1" || l.kind === "h2" || l.kind === "h3" || l.field) continue;
      const inMust = /must happen|key events|key moments|has to happen|important|no matter what/i.test(l.section);
      const must = MUST.test(l.text);
      if (!(plan && inMust) && !must) continue;
      const ids = [...new Set(match(l.text))];
      const score = (plan && inMust ? 5 : 0) + (must ? 3 : 0) + (d.id === latestPlan ? 2 : 0) + centrality(ids);
      add({ text: l.text, secret: l.secret || !d.shared, why: plan ? `${cleanTitle(d.title)}${inMust ? " · must happen" : ""}` : cleanTitle(d.title), docId: d.id, nodes: ids, score });
    }
  }
  const next = milestones.find((m) => m.kind === "milestone" && m.status !== "done");
  if (next) {
    for (let i = points.length - 1; i >= 0; i--) if (points[i].docId === next.docId) points.splice(i, 1); // said once, as the milestone
    add({
      text: `Next milestone: ${next.title}${next.when ? ` (${next.when})` : ""}`, secret: next.secret, why: "Goals & milestones", docId: next.docId,
      nodes: [...new Set(next.steps.flatMap((s) => match(s.text)))], score: 6,
    });
  }
  points.sort((a, b) => b.score - a.score);

  return {
    engine,
    nodes, edges: [...edges.values()], mustHappen: points.slice(0, 7), milestones,
    stats: { docs: docs.length, words, secretFacts },
  };
}

export const smartReader: CampaignReader = {
  name: "smart",
  analyze: async (input) => analyzeSync(input),
};
