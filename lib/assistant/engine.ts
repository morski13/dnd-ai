// The Tavern assistant: finds what the question is about (rules, spells, features, the character's sheet,
// house rules, campaign notes), runs the app's own rule checks, then asks the AI to answer in the asker's
// chosen manner of speaking. The AI only words the answer: the facts come from here.
// Server only. Works with any AI set up in .env.local; later our own model plugs in the same way.
import type { SupabaseClient } from "@supabase/supabase-js";
import { chatWith } from "../ai/client";
import { label } from "../ai/providers";
import { getReader } from "../reader/engine";
import { readerInput } from "../reader-data";
import { comboChecks, expandQuery, type NamedThing } from "./checks";
import { loreDocs } from "./docs";
import { library, type Edition } from "./knowledge";
import { buildMessages, houseText, parseReply, sheetText, type Mode, type Reply, type SheetLite } from "./prompt";
import { buildIndex, pick, primaryName, search, type Hit, type Picked } from "./search";
import { styleOf } from "./styles";

export type Ask = {
  supabase: SupabaseClient;
  userId: string;
  campaign: { id: string; name: string } | null;
  isDm: boolean;
  mode: Mode;
  question: string;
  characterId?: string | null;
  styleId?: string | null;
  /** DM in lore mode: may use DM-only notes */
  withSecrets?: boolean;
  history?: { role: "user" | "assistant"; content: string }[];
  askerName?: string | null;
};

export type Answer = Reply & {
  by: string;
  style: string;
  sourcesUsed: Picked[];
  sourcesAll: Picked[];
  checks: string[];
  hasSecrets: boolean;
  /** exactly what the AI was sent: kept for training our own model */
  prompt: { role: string; content: string }[];
};

const SHEET_COLS = "id, name, species, rule_set, class_levels, ability_scores, proficiencies, ac, hp_max, hp_current, temp_hp, speed, attacks, spells, resources, features, concentration";

export async function answer(a: Ask): Promise<Answer> {
  const { supabase, campaign } = a;
  // the campaign: rules edition, house rules, name
  const camp = campaign
    ? (await supabase.from("campaigns").select("rule_set, settings").eq("id", campaign.id).maybeSingle()).data as { rule_set: Edition; settings: { house_rules?: Record<string, unknown> } | null } | null
    : null;

  // the character (only if this user may see it: the database rules decide)
  let sheet: SheetLite | null = null;
  let conditions: string[] = [];
  if (a.characterId) {
    const { data } = await supabase.from("characters").select(SHEET_COLS).eq("id", a.characterId).maybeSingle();
    sheet = data as unknown as SheetLite | null;
    if (sheet) {
      const { data: cb } = await supabase.from("combatants").select("conditions, combats!inner(ended_at)").eq("character_id", a.characterId).is("combats.ended_at", null).limit(1).maybeSingle();
      conditions = ((cb as { conditions?: string[] } | null)?.conditions ?? []).filter(Boolean);
      sheet.conditions = conditions;
    }
  }
  const edition: Edition = (sheet?.rule_set as Edition | undefined) ?? camp?.rule_set ?? "2024";
  const rulesFor: "2014" | "2024" = edition === "2014" ? "2014" : "2024";
  const lib = await library(supabase, camp?.rule_set === "mixed" && !sheet ? "mixed" : edition);

  // campaign notes as searchable pieces: players only ever get shared pages; DM secrets only when asked for
  const secretsOk = a.isDm && a.mode === "lore" && !!a.withSecrets;
  let lore: Hit[] = [];
  if (campaign) {
    try {
      const ctx = { supabase, userId: a.userId, campaign, isDm: a.isDm };
      const input = await readerInput(ctx, !secretsOk);
      const analysis = await getReader().analyze(input);
      const lix = buildIndex(loreDocs(analysis, secretsOk).map((d) => ({ ...d, boost: a.mode === "lore" ? 1 : 0 })));
      lore = search(lix, a.question, { allowSecret: secretsOk, limit: a.mode === "lore" ? 8 : 3 });
    } catch { /* no notes yet */ }
  }

  // first pass: what does the question name? (spells, features, feats)
  const first = search(lib.index, a.question, { limit: 16 });
  const things: NamedThing[] = [];
  for (const h of first.filter((x) => x.named)) {
    const n = primaryName(h.doc);
    if (h.doc.kind === "spell") {
      const s = lib.spells.get(n.toLowerCase());
      if (s) things.push({ name: s.name, kind: "spell", level: s.level, castingTime: s.casting_time, concentration: s.concentration });
    } else if (h.doc.kind === "feature" || h.doc.kind === "feat") {
      if (!things.some((t) => t.name.toLowerCase() === n.toLowerCase())) things.push({ name: n, kind: h.doc.kind, text: h.doc.text });
    }
  }
  const checks = comboChecks(things, rulesFor, { raging: conditions.some((c) => /rag/i.test(c)) });

  // second pass with the rule words those things need (two spells → the spell-slot rule…)
  const q2 = expandQuery(a.question, things);
  let hits = q2 === a.question ? first : search(lib.index, q2, { limit: 16, namesFrom: a.question });
  if (sheet) {
    // their own class features (up to their level) count more; features of levels they don't have yet count less
    hits = hits.map((h) => {
      if (h.doc.kind !== "feature" || h.named) return h;
      const m = h.doc.title.match(/^(\w+)(?: \(([^)]+)\))? (\d+):/);
      const cl = m && sheet!.class_levels.find((c) => c.class.toLowerCase() === m[1].toLowerCase());
      if (!cl) return h;
      if (m![2] && cl.subclass && m![2].toLowerCase() !== cl.subclass.toLowerCase()) return { ...h, score: h.score * 0.3 };
      return { ...h, score: h.score * (Number(m![3]) <= cl.level ? 1.4 : 0.3) };
    }).sort((x, y) => y.score - x.score);
  }
  const merged = [...lore, ...hits].sort((x, y) => y.score - x.score);
  const sources = pick(merged, a.mode === "session" ? 5000 : 7500, 1400);

  const spellLevels = Object.fromEntries((sheet?.spells?.known ?? []).map((n) => [n, lib.spells.get(n.toLowerCase())?.level ?? -1]));
  const style = styleOf(a.styleId);
  const messages = buildMessages({
    style, mode: a.mode, rules: edition, question: a.question, asker: a.askerName, campaign: campaign?.name,
    sources, checks, sheet: sheet ? sheetText(sheet, spellLevels) : null, house: houseText(camp?.settings?.house_rules), history: a.history,
  });
  const hasSecrets = sources.some((s) => s.secret);
  const { text, by } = await chatWith(messages, { json: true, maxTokens: a.mode === "session" ? 500 : 1000, timeoutMs: 45_000, secrets: hasSecrets, temperature: style.id === "plain" ? 0.2 : 0.7 });
  const reply = parseReply(text, sources.map((s) => s.id));
  return {
    ...reply, by: label(by), style: style.id, checks, hasSecrets, sourcesAll: sources, prompt: messages,
    sourcesUsed: reply.sources.length ? sources.filter((s) => reply.sources.includes(s.id)) : sources.slice(0, 3),
  };
}
