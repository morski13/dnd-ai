// "Not in the rules": after reading a sheet, tell the player plainly which parts of their character the app
// doesn't know from the free rules (SRD), and what that means. Nothing is blocked; it's information.
// Pure: the caller passes the rules data, the builder data and which spells / items the libraries found.
import type { BuilderData } from "../builder/types";
import type { RulesData } from "../levelup/types";
import type { Ability } from "../rules";
import type { ImportedSheet } from "./types";

export type ReportItem = {
  kind: "class" | "subclass" | "species" | "background" | "spells" | "items" | "multiclass" | "edition" | "level";
  title: string;      // "Leonin (species)"
  what: string;       // what it means in the app
  severity: "info" | "warn";
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const words = (s: string) => new Set(norm(s).split(" ").filter((w) => w.length > 2 && !["path", "the", "of", "college", "circle", "oath", "domain", "school", "way", "tradition", "patron", "archetype", "conclave", "origin"].includes(w)));

/** Does this subclass name match one in the rules ("Path of the Berserker" ↔ "Berserker")? */
const sameSubclass = (a: string, b: string) => {
  const x = words(a), y = words(b);
  return [...x].some((w) => y.has(w));
};

export function rulesReport(s: ImportedSheet, o: {
  rules: "2014" | "2024"; data: RulesData; other: RulesData; builder: BuilderData;
  unknownSpells: string[]; unknownItems: string[];
}): ReportItem[] {
  const out: ReportItem[] = [];
  const ed = o.rules;

  for (const u of s.unknownClasses) {
    out.push({ kind: "class", severity: "warn", title: `${u} (class)`,
      what: "Not one of the 12 classes in the free rules. Pick the closest class for hit points, saves and slots; this class's features from your sheet are kept as text, and the app can't roll them by itself (add them under Features → own rules)." });
  }

  for (const c of s.classes) {
    const cls = o.data.classes[c.class];
    if (!cls || !c.subclass?.trim()) continue;
    const known = cls.subclasses.map((x) => x.name);
    if (known.some((k) => sameSubclass(c.subclass, k))) continue;
    out.push({ kind: "subclass", severity: "info", title: `${c.subclass} (${c.class} subclass)`,
      what: `Not in the free rules (they have ${known.join(", ") || "none"}). The name is kept; its features come only from your sheet as text${/wild soul/i.test(c.subclass) ? ". There's a ready Wild Soul preset under Features → own rules" : ", and you can add its rolls under Features → own rules"}.` });
  }

  if (s.species.trim()) {
    const sp = norm(s.species);
    const found = o.builder.species.some((x) => sp.includes(norm(x.name)) || (x.subs ?? []).some((sub) => sp.includes(norm(sub.name.replace(/^.*?:\s*/, "")))));
    if (!found) {
      out.push({ kind: "species", severity: "info", title: `${s.species} (species)`,
        what: `Not in the free ${ed} rules. Its traits aren't added by the app; the ones on your sheet are kept as features, and speed and darkvision aren't checked.` });
    }
  }

  if (s.background.trim()) {
    const bg = norm(s.background);
    if (!o.builder.backgrounds.some((b) => norm(b.name) === bg)) {
      out.push({ kind: "background", severity: "info", title: `${s.background} (background)`,
        what: `Not in the free ${ed} rules (they have ${o.builder.backgrounds.map((b) => b.name).join(", ")}). Kept as a name; your skills and features come from your sheet.` });
    }
  }

  if (o.unknownSpells.length) {
    out.push({ kind: "spells", severity: "info", title: `${o.unknownSpells.length} spell${o.unknownSpells.length === 1 ? "" : "s"}: ${o.unknownSpells.slice(0, 6).join(", ")}${o.unknownSpells.length > 6 ? "…" : ""}`,
      what: "Not in the app's spell library. They're kept as a note, without rolls or slot spending. Add any you roll often as your own actions." });
  }
  if (o.unknownItems.length) {
    out.push({ kind: "items", severity: "info", title: `${o.unknownItems.length} item${o.unknownItems.length === 1 ? "" : "s"}: ${o.unknownItems.slice(0, 6).join(", ")}${o.unknownItems.length > 6 ? "…" : ""}`,
      what: "Not in the item library. They go in your bag as plain items, without rules text, damage or AC." });
  }

  // multiclassing: every class after the first needs its ability scores (and so does the first one)
  if (s.classes.length > 1) {
    for (const c of s.classes) {
      const need = o.data.classes[c.class]?.mcPrereq ?? [];
      const missing = need.filter((group) => !group.some(([a, n]) => (s.scores[a as Ability] ?? 0) >= n));
      if (!missing.length) continue;
      const text = missing.map((g) => g.map(([a, n]) => `${a} ${n}`).join(" or ")).join(" and ");
      const have = [...new Set(missing.flat().map(([a]) => a))].map((a) => `${a} ${s.scores[a as Ability] ?? "?"}`).join(", ");
      out.push({ kind: "multiclass", severity: "warn", title: `Multiclass: ${c.class}`,
        what: `Multiclassing with ${c.class} needs ${text}; your sheet has ${have}. The app still builds the character; check it with your DM.` });
    }
  }

  const level = s.classes.reduce((n, c) => n + c.level, 0);
  if (level > 20) out.push({ kind: "level", severity: "warn", title: `Level ${level}`, what: "Above 20, the highest level in the rules. The app keeps the first class only; fix the levels above." });

  // features from the other edition's class rules (Brutal Critical in a 2024 game)
  const mine = new Set<string>(), theirs = new Map<string, string>();
  for (const c of s.classes) {
    for (const row of Object.values(o.data.classes[c.class]?.levels ?? {})) for (const f of row.features) mine.add(norm(f.name.replace(/\s*\(.*\)$/, "")));
    for (const row of Object.values(o.other.classes[c.class]?.levels ?? {})) for (const f of row.features) theirs.set(norm(f.name.replace(/\s*\(.*\)$/, "")), f.name.replace(/\s*\(.*\)$/, ""));
  }
  const otherEd = ed === "2024" ? "2014" : "2024";
  const fromOther = s.features.map((f) => norm(f.name.replace(/\s*\(.*\)$/, ""))).filter((n) => theirs.has(n) && !mine.has(n));
  if (fromOther.length) {
    const names = [...new Set(fromOther)].map((n) => theirs.get(n)!);
    out.push({ kind: "edition", severity: "info", title: `${names.join(", ")} (${otherEd} rules)`,
      what: `${names.length === 1 ? "This is a" : "These are"} ${otherEd} class feature${names.length === 1 ? "" : "s"}, but the campaign uses ${ed}. The app keeps ${names.length === 1 ? "it" : "them"} from your sheet${names.some((n) => /brutal critical/i.test(n)) ? " (Brutal Critical still adds its dice on a crit)" : ""}; check with your DM.` });
  }
  return out;
}
