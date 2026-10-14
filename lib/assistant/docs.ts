// Turns the app's data into searchable pieces for the assistant (pure, tested).
import type { RulesData } from "../levelup/types";
import type { Analysis } from "../reader/types";
import type { KDoc } from "./search";

export type SpellRow = {
  name: string; level: number; school: string | null; classes: string[] | null; casting_time: string | null; ritual: boolean;
  range: string | null; components: string | null; duration: string | null; concentration: boolean; description: string; higher_levels: string | null;
};
export type ItemRow = { id: string; rules: string; name: string; kind: string; category: string | null; rarity: string | null; attunement: boolean; summary: string | null; description: string };
export type MonsterRow = { name: string; cr: string | null; ac: number | null; hp: number | null; data: Record<string, unknown> };

export function spellDocs(rows: SpellRow[]): KDoc[] {
  return rows.map((s) => ({
    id: `spell:${s.name}`, kind: "spell", title: `Spell: ${s.name}`, names: [s.name],
    text: [
      `${s.level ? `Level ${s.level}` : "Cantrip"} ${s.school ?? ""}${s.ritual ? " (ritual)" : ""}. Casting time: ${s.casting_time ?? "?"}. Range: ${s.range ?? "?"}. Components: ${s.components ?? "?"}. Duration: ${s.concentration ? "Concentration, " : ""}${s.duration ?? "?"}.${s.classes?.length ? ` Classes: ${s.classes.join(", ")}.` : ""}`,
      s.description,
      s.higher_levels ? `At higher levels: ${s.higher_levels}` : "",
    ].filter(Boolean).join("\n"),
  }));
}

/** Class features, subclass features, feats and options (invocations, metamagic, fighting styles…) of one rule set. */
export function rulesDataDocs(d: RulesData): KDoc[] {
  const ed = d.rules;
  const out: KDoc[] = [];
  for (const [cls, c] of Object.entries(d.classes)) {
    for (const [lvl, row] of Object.entries(c.levels)) {
      for (const f of row.features) {
        if (/^ability score improvement$/i.test(f.name) && f.text.length < 400) continue;
        out.push({ id: `feature:${ed}:${cls}:${lvl}:${f.name}`, kind: "feature", title: `${cls} ${lvl}: ${f.name} (${ed})`, names: [f.name], text: f.text });
      }
    }
    for (const sc of c.subclasses ?? []) {
      for (const [lvl, fs] of Object.entries(sc.levels)) {
        for (const f of fs) out.push({ id: `feature:${ed}:${sc.name}:${lvl}:${f.name}`, kind: "feature", title: `${cls} (${sc.name}) ${lvl}: ${f.name} (${ed})`, names: [f.name], text: f.text });
      }
    }
  }
  for (const [list, opts] of Object.entries(d.options ?? {})) {
    for (const o of opts) out.push({ id: `option:${ed}:${list}:${o.name}`, kind: "feature", title: `${list.replace(/-/g, " ")}: ${o.name} (${ed})`, names: [o.name], text: `${o.prereq ? `Prerequisite: ${o.prereq}. ` : ""}${o.text}` });
  }
  for (const f of d.feats ?? []) {
    out.push({ id: `feat:${ed}:${f.name}`, kind: "feat", title: `Feat: ${f.name} (${ed})`, names: [f.name], text: `${f.category ? `${f.category} feat. ` : ""}${f.prereq ? `Prerequisite: ${f.prereq}. ` : ""}${f.text}` });
  }
  return out;
}

export function itemDocs(rows: ItemRow[]): KDoc[] {
  return rows.map((i) => ({
    id: `item:${i.id}`, kind: "item", title: `Item: ${i.name} (${i.rules})`, names: [i.name],
    text: [[i.kind, i.category, i.rarity, i.attunement ? "requires attunement" : ""].filter(Boolean).join(", ") + ".", i.summary ?? "", i.description].filter(Boolean).join("\n"),
  }));
}

export function monsterDocs(rows: MonsterRow[]): KDoc[] {
  return rows.map((m) => {
    const d = m.data as { size_type?: string; speed?: string; senses?: string; skills?: string; sections?: Record<string, string[]> };
    const secs = Object.entries(d.sections ?? {}).map(([k, v]) => `${k}: ${v.join(" ")}`).join("\n");
    return {
      id: `monster:${m.name}`, kind: "monster", title: `Monster: ${m.name}`, names: [m.name],
      text: `${d.size_type ?? ""}. CR ${m.cr ?? "?"}, AC ${m.ac ?? "?"}, HP ${m.hp ?? "?"}, speed ${d.speed ?? "?"}.${d.senses ? ` Senses: ${d.senses}.` : ""}${d.skills ? ` Skills: ${d.skills}.` : ""}\n${secs}`,
    };
  });
}

/** Campaign notes as searchable pieces: one per box on the mind map, with its facts and links. */
export function loreDocs(a: Analysis, withSecrets: boolean): KDoc[] {
  const ok = (x: { secret: boolean }) => withSecrets || !x.secret;
  const label = new Map(a.nodes.map((n) => [n.id, n.label]));
  const links = new Map<string, string[]>();
  for (const e of a.edges.filter(ok)) {
    const ev = e.evidence.filter(ok)[0]?.text;
    const line = `${label.get(e.a)} —${e.label}→ ${label.get(e.b)}${ev ? ` ("${ev.slice(0, 160)}")` : ""}`;
    for (const id of [e.a, e.b]) links.set(id, [...(links.get(id) ?? []), line]);
  }
  return a.nodes.filter(ok).map((n) => {
    const facts = n.facts.filter(ok).map((f) => f.text);
    if (n.aiSummary && ok(n.aiSummary)) facts.unshift(n.aiSummary.text);
    const secret = n.secret || n.facts.some((f) => f.secret && withSecrets);
    return {
      id: `lore:${n.id}`, kind: "lore" as const, title: `${n.type === "note" ? n.folder ?? "Note" : n.type === "npc" ? "NPC" : n.type[0].toUpperCase() + n.type.slice(1)}: ${n.label}`,
      names: [n.label, ...n.aliases], secret,
      text: [n.summary, ...facts, ...(links.get(n.id) ?? []).slice(0, 8)].filter(Boolean).join("\n"),
    };
  }).filter((d) => d.text.trim());
}
