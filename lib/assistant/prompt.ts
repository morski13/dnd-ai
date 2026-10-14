// Builds what the assistant sends to the AI and reads what comes back (pure, tested).
import type { ChatMessage } from "../ai/client";
import { abilityMod, ABILITIES, attackBonus, damageExpression, profBonus, totalLevel, type Ability, type Attack, type ClassLevel } from "../rules";
import type { Picked } from "./search";
import type { Style } from "./styles";

export type Mode = "rules" | "character" | "session" | "lore";
export type Verdict = "yes" | "no" | "depends" | "info";
export type Reply = { verdict: Verdict; answer: string; sources: string[] };

/** What the assistant knows about the character it's asked about. */
export type SheetLite = {
  name: string; species?: string | null; rule_set?: string | null;
  class_levels: ClassLevel[]; ability_scores: Partial<Record<Ability, number>>;
  proficiencies?: { saves?: Ability[]; skills?: string[]; expertise?: string[] };
  ac?: number | null; hp_max?: number | null; hp_current?: number | null; temp_hp?: number | null; speed?: number | null;
  attacks?: Attack[];
  spells?: { known?: string[]; ability?: Ability; slots?: Record<string, number>; slots_used?: Record<string, number> };
  resources?: { name: string; max: number; used?: number }[];
  features?: (string | { name: string })[];
  concentration?: { spell: string } | null;
  conditions?: string[];
};

const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export function sheetText(c: SheetLite, spellLevels: Record<string, number> = {}): string {
  const lvl = totalLevel(c.class_levels);
  const pb = profBonus(lvl);
  const lines: string[] = [];
  const cls = c.class_levels.map((x) => `${x.class}${x.subclass ? ` (${x.subclass})` : ""} ${x.level}`).join(" / ");
  lines.push(`${c.name}: ${[c.species, cls].filter(Boolean).join(" ")}; level ${lvl}, proficiency bonus +${pb}; ${c.rule_set ?? "2024"} rules.`);
  lines.push(`Abilities: ${ABILITIES.map((a) => `${a} ${c.ability_scores[a] ?? 10} (${sign(abilityMod(c.ability_scores[a] ?? 10))})`).join(", ")}.`);
  const vit = [c.ac != null && `AC ${c.ac}`, c.hp_max != null && `HP ${c.hp_current ?? c.hp_max}/${c.hp_max}${c.temp_hp ? ` +${c.temp_hp} temp` : ""}`, c.speed != null && `speed ${c.speed} ft`].filter(Boolean);
  if (vit.length) lines.push(vit.join(", ") + ".");
  if (c.proficiencies?.saves?.length) lines.push(`Save proficiencies: ${c.proficiencies.saves.join(", ")}.`);
  if (c.proficiencies?.skills?.length) lines.push(`Skills: ${c.proficiencies.skills.join(", ")}${c.proficiencies.expertise?.length ? ` (expertise: ${c.proficiencies.expertise.join(", ")})` : ""}.`);
  const sc = { ability_scores: c.ability_scores, class_levels: c.class_levels, proficiencies: c.proficiencies ?? {}, spells: (c.spells ?? {}) as never, attacks: c.attacks ?? [] };
  const atk = (c.attacks ?? []).slice(0, 10).map((a) => {
    const hit = a.kind === "weapon" || a.kind === "spell_attack" ? ` ${sign(attackBonus(sc, a))} to hit` : "";
    let dmg = "";
    try { dmg = a.damage ? `, ${damageExpression(sc, a)}${a.damage_type ? ` ${a.damage_type}` : ""}` : ""; } catch { dmg = a.damage ? `, ${a.damage}` : ""; }
    return `${a.name}${hit}${dmg}${a.action && a.action !== "action" ? ` (${a.action})` : ""}`;
  });
  if (atk.length) lines.push(`Attacks: ${atk.join("; ")}.`);
  const known = c.spells?.known ?? [];
  if (known.length) {
    const byLvl = new Map<number, string[]>();
    for (const s of known) { const l = spellLevels[s] ?? -1; byLvl.set(l, [...(byLvl.get(l) ?? []), s]); }
    const parts = [...byLvl.entries()].sort((a, b) => a[0] - b[0]).map(([l, xs]) => `${l === 0 ? "cantrips" : l > 0 ? `level ${l}` : "other"}: ${xs.join(", ")}`);
    lines.push(`Spells (${c.spells?.ability ?? "INT"}): ${parts.join("; ")}.`);
  }
  const slots = Object.entries(c.spells?.slots ?? {}).filter(([, n]) => n > 0).map(([l, n]) => `L${l} ${n - (c.spells?.slots_used?.[l] ?? 0)}/${n}`);
  if (slots.length) lines.push(`Spell slots left: ${slots.join(", ")}.`);
  const res = (c.resources ?? []).map((r) => `${r.name} ${r.max - (r.used ?? 0)}/${r.max}`);
  if (res.length) lines.push(`Resources left: ${res.join(", ")}.`);
  const feats = (c.features ?? []).map((f) => (typeof f === "string" ? f : f.name)).filter(Boolean);
  if (feats.length) lines.push(`Features: ${feats.slice(0, 40).join(", ")}.`);
  if (c.concentration?.spell) lines.push(`Concentrating on ${c.concentration.spell} right now.`);
  if (c.conditions?.length) lines.push(`Conditions right now: ${c.conditions.join(", ")}.`);
  return lines.join("\n");
}

const HOUSE: Record<string, (v: unknown) => string | null> = {
  ability_scores: (v) => (v === "4d6_drop_lowest" ? "Ability scores: roll 4d6, drop the lowest." : null),
  hp_on_level_up: (v) => (v === "roll" ? "HP on level up: rolled." : v === "average" ? "HP on level up: average." : null),
  multiclassing: (v) => (v === false ? "Multiclassing is not allowed." : "Multiclassing is allowed."),
  homebrew: (v) => (v === "dm_approval" ? "Homebrew needs DM approval." : null),
  crit: (v) => (v === "double_dice" ? "Critical hits: double the damage dice." : v === "max_plus_roll" ? "Critical hits: max damage plus a roll." : null),
  nat1_attack: (v) => (v === "miss" ? "Natural 1 on an attack: just a miss (no fumble table)." : v ? "Natural 1 on an attack: roll on the fumble table." : null),
  flanking: (v) => (v === "advantage" ? "Flanking gives advantage." : v === false || v === "off" ? "No flanking rule." : null),
  potion_bonus_action: (v) => (v ? "Drinking a potion is a Bonus Action." : "Drinking a potion is an action."),
  potion_healing: (v) => (v === "roll" ? "Healing potions are rolled." : v === "max" ? "Healing potions heal the maximum." : null),
  death_saves: (v) => (v === "secret" ? "Death saves are rolled in secret." : null),
  encumbrance: (v) => (v ? "Encumbrance is tracked." : "Encumbrance is off."),
  ammo_tracking: (v) => (v ? "Ammunition is tracked; recover half after a fight." : null),
  spell_components: (v) => (v ? "Spell components are tracked." : "Spell components aren't tracked."),
};

/** The campaign's house rules as plain sentences (unknown keys are skipped; free-text "other" rules kept). */
export function houseText(house: Record<string, unknown> | null | undefined): string {
  if (!house) return "";
  const out: string[] = [];
  for (const [k, v] of Object.entries(house)) {
    const f = HOUSE[k];
    if (f) { const s = f(v); if (s) out.push(s); }
    else if (k === "other" && Array.isArray(v)) out.push(...v.map(String).filter((x) => x.trim()));
  }
  return out.join("\n");
}

const MODE_TASK: Record<Mode, string> = {
  rules: "Answer rules, combo and build questions.",
  character: "Answer questions about this character: what they can do, combos, best options, how their features work. Use their sheet.",
  session: "This is during a live game turn: answer fast and short (2–4 sentences), yes/no first.",
  lore: "Answer questions about the campaign world from the campaign notes. If the notes don't say, say so: never invent world facts.",
};

export type PromptInput = {
  style: Style; mode: Mode; rules: "2014" | "2024" | "mixed";
  question: string; asker?: string | null; campaign?: string | null;
  sources: Picked[]; checks: string[]; sheet?: string | null; house?: string | null;
  history?: { role: "user" | "assistant"; content: string }[];
};

export function buildMessages(p: PromptInput): ChatMessage[] {
  const ed = p.rules === "mixed" ? "This campaign mixes 2014 and 2024 rules: use the character's own rules when known, otherwise give the 2024 rule and mention the 2014 difference if there is one."
    : `This campaign uses the ${p.rules} rules.${p.rules === "2014" ? " The rules sources are from the 2024 SRD; where the notes say 2014 differs, follow the 2014 notes." : ""}`;
  const system = [
    `You are the D&D helper of this group, speaking as ${p.style.how}.`,
    `Stay in that manner of speaking, but keep every rule, number, dice expression and game term exact and plain. At most one or two flavour phrases; the rules come first.`,
    MODE_TASK[p.mode],
    ed,
    `Base the answer on the SOURCES and the APP CHECKS below. APP CHECKS are certain: never contradict them. If the sources don't cover something, use your general D&D 5e knowledge but say it's general knowledge, and say when the DM has the final word. Never invent campaign facts.`,
    `House rules of this table override the normal rules.`,
    `Keep it short: ${p.mode === "session" ? "under 70 words" : "under 170 words"}. Start with the direct answer.`,
    `Reply with ONE JSON object and nothing else: {"verdict":"yes"|"no"|"depends"|"info","answer":"your answer in your manner of speaking","sources":["S1","S3"]}. verdict: yes/no/depends for "can I…" questions, info for everything else. sources: the ids you actually used.`,
  ].join("\n");

  const ctx: string[] = [];
  if (p.campaign) ctx.push(`CAMPAIGN: ${p.campaign}${p.asker ? ` · asked by ${p.asker}` : ""}`);
  if (p.house) ctx.push(`HOUSE RULES:\n${p.house}`);
  if (p.sheet) ctx.push(`CHARACTER SHEET:\n${p.sheet}`);
  if (p.checks.length) ctx.push(`APP CHECKS:\n${p.checks.map((c) => `- ${c}`).join("\n")}`);
  ctx.push(p.sources.length ? `SOURCES:\n${p.sources.map((s) => `[${s.id}] ${s.title}\n${s.text}`).join("\n\n")}` : "SOURCES: none found.");

  const history = (p.history ?? []).slice(-6).map((m) => ({ role: m.role, content: m.content.slice(0, 700) }));
  return [
    { role: "system", content: system },
    ...history,
    { role: "user", content: `${ctx.join("\n\n")}\n\nQUESTION: ${p.question.slice(0, 800)}` },
  ];
}

/** Read the AI's reply; falls back to plain text when the model ignored the JSON format. */
export function parseReply(text: string, sourceIds: string[]): Reply {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  let j: { verdict?: unknown; answer?: unknown; sources?: unknown } | null = null;
  if (s >= 0 && e > s) { try { j = JSON.parse(text.slice(s, e + 1)); } catch { j = null; } }
  const answer = typeof j?.answer === "string" && j.answer.trim() ? j.answer.trim() : text.replace(/```(json)?/g, "").trim();
  const verdict: Verdict = ["yes", "no", "depends", "info"].includes(String(j?.verdict)) ? (j!.verdict as Verdict) : "info";
  const ids = new Set(sourceIds);
  const sources = Array.isArray(j?.sources) ? [...new Set(j!.sources.map(String).map((x) => x.replace(/[[\]]/g, "").toUpperCase()).filter((x) => ids.has(x)))] : [];
  return { verdict, answer: answer.slice(0, 2500), sources };
}
