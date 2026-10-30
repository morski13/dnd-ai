"use server";
import { rulesDataFor } from "@/lib/books/server";
// Level up / level down a character. The server works out the level again, checks the choices, rolls the hit die and saves.
// Every change keeps a snapshot of the character before it (characters.level_log, last 10), so it can be undone.
import { revalidatePath } from "next/cache";
import { loadCharacter } from "@/lib/character-data";
import { roll } from "@/lib/dice";
import { applyLevelUp, checkAnswers, levelDown, planLevelUp, type LevelChar } from "@/lib/levelup/engine";
import { loadSpellLite } from "@/lib/levelup/server";
import type { Answers } from "@/lib/levelup/types";
import { totalLevel } from "@/lib/rules";

type Fail = { error: string };
export type LogEntry = { at: string; className: string; level: number; kind?: "up" | "down"; summary: string[]; before: Record<string, unknown> };
export type SavedPlan = Answers & { className: string; savedAt: string };
const SNAP = ["class_levels", "ability_scores", "hp_max", "hp_current", "proficiencies", "features", "spells", "resources"] as const;
const sqlHint = (m?: string) => /level_log/.test(m ?? "") ? "Run supabase/20-level-up.sql in Supabase first."
  : /level_plan/.test(m ?? "") ? "Run supabase/21-level-plans.sql in Supabase first." : m ?? "Couldn't save.";
const cleanAnswers = (a: Partial<Answers> | null | undefined): Answers => ({ picks: a?.picks ?? {}, asi: a?.asi ?? {}, hp: a?.hp === "roll" ? "roll" : "average" });

async function editable(characterId: string) {
  const r = await loadCharacter(characterId);
  if (!r.character || !r.canEdit) return null;
  return r as typeof r & { character: NonNullable<typeof r.character> };
}
async function readLog(supabase: Awaited<ReturnType<typeof loadCharacter>>["supabase"], id: string) {
  const { data, error } = await supabase.from("characters").select("level_log").eq("id", id).maybeSingle();
  return { log: ((data?.level_log as LogEntry[] | null) ?? []), error };
}
const snapshot = (character: object) => Object.fromEntries(SNAP.map((k) => [k, (character as Record<string, unknown>)[k]]));

async function planFor(characterId: string, className: string) {
  const r = await editable(characterId);
  if (!r) return { error: "You can only level up your own character." } as Fail;
  if (totalLevel(r.character.class_levels) >= 20) return { error: "Level 20 is the highest level." } as Fail;
  const data = await rulesDataFor(r.character.rule_set);
  if (!data.classes[className]) return { error: "Pick a class." } as Fail;
  const c = r.character as unknown as LevelChar;
  return { ...r, c, data, plan: planLevelUp(c, className, data, await loadSpellLite(r.supabase)) };
}

export async function confirmLevelUp(characterId: string, className: string, answers: Answers): Promise<Fail | { summary: string[]; hpRoll: { die: number; value: number } | null }> {
  const p = await planFor(characterId, className);
  if ("error" in p) return p;
  const clean = cleanAnswers(answers);
  const problem = checkAnswers(p.plan, clean, p.c, p.data);
  if (problem) return { error: problem };
  const hpRoll = clean.hp === "roll" ? roll(`1d${p.plan.hitDie}`).total : null;
  const { patch, summary } = applyLevelUp(p.c, p.plan, clean, hpRoll, p.data);
  const { log } = await readLog(p.supabase, characterId);
  const entry: LogEntry = { at: new Date().toISOString(), className, level: p.plan.toLevel, kind: "up", summary, before: snapshot(p.character) };
  const { error } = await p.supabase.from("characters").update({ ...patch, level_log: [...log, entry].slice(-10) }).eq("id", characterId);
  if (error) return { error: sqlHint(error.message) };
  await p.supabase.from("characters").update({ level_plan: null }).eq("id", characterId); // the plan is used up (fine if SQL 21 isn't run)
  revalidatePath(`/characters/${characterId}`);
  return { summary, hpRoll: hpRoll != null ? { die: p.plan.hitDie, value: hpRoll } : null };
}

/** What the sheet will look like after this level-up (average HP), without saving anything. */
export async function previewLevelUp(characterId: string, className: string, answers: Answers): Promise<Fail | {
  summary: string[]; rows: { label: string; before: string; after: string }[];
}> {
  const p = await planFor(characterId, className);
  if ("error" in p) return p;
  const clean = { ...cleanAnswers(answers), hp: "average" as const };
  const problem = checkAnswers(p.plan, clean, p.c, p.data);
  if (problem) return { error: problem };
  const { patch, summary } = applyLevelUp(p.c, p.plan, clean, null, p.data);
  const c = p.c;
  const classLine = (ls: { class: string; level: number; subclass?: string }[]) => ls.map((l) => `${l.class} ${l.level}${l.subclass ? ` (${l.subclass})` : ""}`).join(" / ");
  const slotLine = (s: Record<string, number> | undefined) => Object.entries(s ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${n}×L${k}`).join(" ") || "none";
  const rows = [
    { label: "Class", before: classLine(c.class_levels), after: classLine(patch.class_levels) },
    { label: "Max HP", before: String(c.hp_max ?? 0), after: `${patch.hp_max} (average)` },
    ...(["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const).filter((a) => (c.ability_scores[a] ?? 10) !== (patch.ability_scores[a] ?? 10))
      .map((a) => ({ label: a, before: String(c.ability_scores[a] ?? 10), after: String(patch.ability_scores[a]) })),
    { label: "Spell slots", before: slotLine(c.spells.slots), after: slotLine(patch.spells.slots) },
    { label: "Spells known", before: String(c.spells.known?.length ?? 0), after: String(patch.spells.known?.length ?? 0) },
    { label: "Features", before: String(c.features.length), after: String(patch.features.length) },
  ].filter((r) => r.before !== r.after || r.label === "Class" || r.label === "Max HP");
  return { summary, rows };
}

/** Save the choices for the next level now and apply them later (for example when the DM says you level up). */
export async function saveLevelPlan(characterId: string, className: string, answers: Answers): Promise<Fail | { savedAt: string }> {
  const r = await editable(characterId);
  if (!r) return { error: "You can only plan for your own character." };
  if (!(await rulesDataFor(r.character.rule_set)).classes[className]) return { error: "Pick a class." };
  const savedAt = new Date().toISOString();
  const plan: SavedPlan = { ...cleanAnswers(answers), className, savedAt };
  const { error } = await r.supabase.from("characters").update({ level_plan: plan }).eq("id", characterId);
  if (error) return { error: sqlHint(error.message) };
  revalidatePath(`/characters/${characterId}`);
  return { savedAt };
}

export async function clearLevelPlan(characterId: string): Promise<Fail | void> {
  const r = await editable(characterId);
  if (!r) return { error: "You can only change your own character." };
  const { error } = await r.supabase.from("characters").update({ level_plan: null }).eq("id", characterId);
  if (error) return { error: sqlHint(error.message) };
  revalidatePath(`/characters/${characterId}`);
}

/** Go back to how the character was before history entry `index` (that change and everything after it are undone). */
export async function goBackTo(characterId: string, index: number): Promise<Fail | { undone: string }> {
  const r = await editable(characterId);
  if (!r) return { error: "You can only change your own character." };
  const { log, error: e1 } = await readLog(r.supabase, characterId);
  if (e1) return { error: sqlHint(e1.message) };
  const entry = log[index];
  if (!entry) return { error: "That level-up isn't in the history any more." };
  const { error } = await r.supabase.from("characters").update({ ...entry.before, level_log: log.slice(0, index) }).eq("id", characterId);
  if (error) return { error: sqlHint(error.message) };
  revalidatePath(`/characters/${characterId}`);
  return { undone: log.slice(index).map((e) => `${e.kind === "down" ? "down from " : ""}${e.className} ${e.level}`).join(", ") };
}

/** Undo the last change. */
export async function undoLevelUp(characterId: string): Promise<Fail | { undone: string }> {
  const r = await editable(characterId);
  if (!r) return { error: "You can only change your own character." };
  const { log, error } = await readLog(r.supabase, characterId);
  if (error) return { error: sqlHint(error.message) };
  if (!log.length) return { error: "There's no level-up to undo." };
  return goBackTo(characterId, log.length - 1);
}

/** Take one level off a class (for characters without a saved history). Kept in the history, so it can be undone too. */
export async function levelDownClass(characterId: string, className: string): Promise<Fail | { notes: string[] }> {
  const r = await editable(characterId);
  if (!r) return { error: "You can only change your own character." };
  const data = await rulesDataFor(r.character.rule_set);
  let res;
  try { res = levelDown(r.character as unknown as LevelChar, className, data); } catch (e) { return { error: (e as Error).message }; }
  const { log } = await readLog(r.supabase, characterId);
  const lvl = r.character.class_levels.find((l) => l.class === className)?.level ?? 0;
  const entry: LogEntry = { at: new Date().toISOString(), className, level: lvl, kind: "down", summary: res.notes, before: snapshot(r.character) };
  const { error } = await r.supabase.from("characters").update({ ...res.patch, level_log: [...log, entry].slice(-10) }).eq("id", characterId);
  if (error) return { error: sqlHint(error.message) };
  revalidatePath(`/characters/${characterId}`);
  return { notes: res.notes };
}
