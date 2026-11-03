"use server";
// DM: build a fight on the spot in Session mode. Monsters come from the SRD search, the campaign's homebrew
// monsters and NPCs, and the DM's own characters; the odds preview plays the planned fight before it starts.
import { refresh } from "next/cache";
import type { CharacterForSim, MonsterStats } from "@/lib/encounter/build";
import type { LiveFoe, OddsInput } from "@/lib/encounter/live";
import { cleanPlan, copyNames, type FightPlan, type PlanPick } from "@/lib/fight-plan";
import { loadHistory, requireDm } from "@/lib/fights-data";
import { touchCombat } from "@/lib/roll-service";
import type { SpellInfo } from "@/lib/rules";
import { spellsNamed } from "@/lib/srd-cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { fightOddsInput } from "./odds-actions";

type Fail = { error: string };
type Db = Awaited<ReturnType<typeof requireDm>>["supabase"];
const CHAR_COLUMNS = "id, name, class_levels, ability_scores, proficiencies, spells, attacks, resources, features, hp_max, hp_current, ac";
type MonsterRow = { id: string; name: string; kind: string; ac: number | null; hp_max: number | null; hp_current: number | null; stat_block: unknown };

async function dmCtx() {
  const ctx = await requireDm();
  if (!ctx.campaignId || !ctx.isDm) return null;
  return { supabase: ctx.supabase, campaignId: ctx.campaignId as string };
}

/** A stat block the simulator can play (a quick monster without actions can't be simulated). */
function statsOf(m: { name: string; ac: number | null; hp_max: number | null; stat_block: unknown }): MonsterStats | null {
  const sb = m.stat_block as (MonsterStats & { sections?: unknown }) | null;
  if (!sb || !Array.isArray(sb.actions)) return null;
  const { sections: _s, ...rest } = sb;
  void _s;
  return { ...rest, name: m.name, ac: m.ac ?? sb.ac, hp: m.hp_max ?? sb.hp, init: sb.init ?? 0 } as MonsterStats;
}

/** The creatures a plan asks for, with their stat blocks (SRD from the library, the rest from the campaign). */
async function resolvePicks(supabase: Db, campaignId: string, plan: FightPlan) {
  const srdNames = [...new Set(plan.picks.filter((k) => k.source === "srd").map((k) => k.ref))];
  const campIds = [...new Set(plan.picks.filter((k) => k.source === "campaign").map((k) => k.ref))];
  const [{ data: srd }, { data: camp }] = await Promise.all([
    srdNames.length ? supabase.from("srd_monsters").select("name, data").in("name", srdNames) : Promise.resolve({ data: [] as { name: string; data: unknown }[] }),
    campIds.length ? supabase.from("monsters").select("id, name, kind, ac, hp_max, hp_current, stat_block").eq("campaign_id", campaignId).in("id", campIds) : Promise.resolve({ data: [] as MonsterRow[] }),
  ]);
  const srdStats = new Map((srd ?? []).map((r) => {
    const { sections: _s, ...st } = r.data as MonsterStats & { sections?: unknown };
    void _s;
    return [r.name as string, st as MonsterStats];
  }));
  const campRows = new Map(((camp ?? []) as MonsterRow[]).map((r) => [r.id, r]));
  type Resolved = { pick: PlanPick; stats: MonsterStats | null; row: MonsterRow | null; template: boolean };
  return plan.picks.flatMap((k): Resolved[] => {
    if (k.source === "srd") {
      const st = srdStats.get(k.ref);
      return st ? [{ pick: k, stats: st, row: null as MonsterRow | null, template: true }] : [];
    }
    const row = campRows.get(k.ref);
    if (!row) return [];
    // homebrew monsters are templates (copied for each fight); the DM's NPCs and leftover monsters join as themselves
    const template = !!(row.stat_block as { homebrew?: boolean } | null)?.homebrew;
    return [{ pick: k, stats: statsOf(row), row, template }];
  });
}

async function simCharacters(supabase: Db, ids: string[]) {
  if (!ids.length) return [] as CharacterForSim[];
  const { data } = await supabase.from("characters").select(CHAR_COLUMNS).in("id", ids);
  return ((data ?? []) as Record<string, unknown>[]).map((c) => ({
    ...c, class_levels: c.class_levels ?? [], ability_scores: c.ability_scores ?? {}, proficiencies: c.proficiencies ?? {},
    spells: c.spells ?? {}, attacks: c.attacks ?? [], resources: c.resources ?? [], features: c.features ?? [],
  })) as unknown as CharacterForSim[];
}

/**
 * The planned fight for the odds preview (DM only). With a running fight (`combatId`), it's that fight
 * plus what the DM is about to add. `notCounted` = creatures without a stat block the simulator can't play.
 */
export async function planOddsInput(raw: FightPlan, combatId?: string | null): Promise<Fail | { input: OddsInput; notCounted: string[] }> {
  const ctx = await dmCtx();
  if (!ctx) return { error: "Only the DM sees the odds." };
  const { supabase, campaignId } = ctx;
  const plan = cleanPlan(raw);
  const base = combatId ? await fightOddsInput(combatId) : null;
  if (base && "error" in base) return base;
  const have = new Set((base?.characters ?? []).map((c) => c.id));
  const newIds = [...plan.players, ...plan.dmCharacters].filter((id) => !have.has(id));
  const [chars, picks] = await Promise.all([simCharacters(supabase, newIds), resolvePicks(supabase, campaignId, plan)]);
  const characters = [...(base?.characters ?? []), ...chars];
  const known = [...new Set(characters.flatMap((c) => c.spells?.known ?? []))];
  const [library, history] = await Promise.all([
    known.length ? spellsNamed(known) : Promise.resolve([]),
    loadHistory(supabase, campaignId, characters.map((c) => c.id)),
  ]);
  const notCounted: string[] = [];
  const foes: LiveFoe[] = [...(base?.foes ?? [])];
  for (const r of picks) {
    if (!r.stats) { notCounted.push(r.pick.name); continue; }
    for (let i = 0; i < (r.template ? r.pick.count : 1); i++) {
      foes.push({ key: `plan:${r.pick.ref}:${i}`, monsterId: r.row?.id ?? "", name: r.stats.name, stats: r.stats, hp: r.template ? r.stats.hp : r.row?.hp_current ?? r.stats.hp, ally: r.pick.side === "ally" });
    }
  }
  return { input: { characters, library: library as SpellInfo[], foes, extra: [], history }, notCounted };
}

/** Create the plan's creatures (copies of templates) and put them, and the chosen characters, into the fight. */
async function fill(supabase: Db, campaignId: string, combatId: string, plan: FightPlan): Promise<Fail | { added: number }> {
  const picks = await resolvePicks(supabase, campaignId, plan);
  const { data: there } = await supabase.from("combatants").select("name, character_id, monster_id").eq("combat_id", combatId);
  const taken = (there ?? []).map((t) => t.name as string);
  const inFight = new Set((there ?? []).flatMap((t) => [t.character_id, t.monster_id].filter(Boolean) as string[]));

  const newRows: Record<string, unknown>[] = [];
  const existing: MonsterRow[] = [];
  for (const r of picks) {
    const ally = r.pick.side === "ally";
    // an NPC or monster of the campaign joins as itself when it's on its usual side
    if (!r.template && r.row && (r.row.kind === "npc") === ally) { if (!inFight.has(r.row.id)) existing.push(r.row); continue; }
    // otherwise a copy: a template (SRD, homebrew) at full HP, or an NPC turned enemy (or a monster turned ally) as it is now
    const sb = (r.row?.stat_block ?? {}) as Record<string, unknown>;
    const st = r.stats;
    const base = st?.name ?? r.row?.name ?? r.pick.name;
    const hpMax = st?.hp ?? r.row?.hp_max ?? null;
    const hpNow = r.template ? hpMax : r.row?.hp_current ?? hpMax;
    const names = copyNames(base, r.template ? r.pick.count : 1, [...taken, ...newRows.map((x) => x.name as string)]);
    for (const name of names) newRows.push({
      campaign_id: campaignId, name, kind: ally ? "npc" : "monster",
      ac: st?.ac ?? r.row?.ac ?? null, hp_max: hpMax, hp_current: hpNow,
      stat_block: { ...sb, ...(st ?? {}), init_bonus: st?.init ?? (sb.init_bonus as number | undefined) ?? 0, homebrew: undefined, copied_from: r.pick.source === "srd" ? `srd:${base}` : r.row?.id },
      visibility: ally ? "party" : "dm",
    });
  }
  const { data: created, error } = newRows.length
    ? await supabase.from("monsters").insert(newRows).select("id, name, stat_block")
    : { data: [] as { id: string; name: string; stat_block: unknown }[], error: null };
  if (error) return { error: "Couldn't create the monsters. " + error.message } as Fail;

  const charIds = [...plan.players, ...plan.dmCharacters].filter((id) => !inFight.has(id));
  const { data: chars } = charIds.length
    ? await supabase.from("characters").select("id, name, ability_scores").eq("campaign_id", campaignId).in("id", charIds)
    : { data: [] as { id: string; name: string; ability_scores: Record<string, number> | null }[] };
  const init = (sb: unknown) => (sb as { init_bonus?: number; init?: number } | null)?.init_bonus ?? (sb as { init?: number } | null)?.init ?? 0;
  const rows = [
    ...(chars ?? []).map((c) => ({ combat_id: combatId, campaign_id: campaignId, character_id: c.id, name: c.name, dex_mod: Math.floor((((c.ability_scores as Record<string, number> | null)?.DEX ?? 10) - 10) / 2) })),
    ...[...(created ?? []), ...existing].map((m) => ({ combat_id: combatId, campaign_id: campaignId, monster_id: m.id, name: m.name, dex_mod: init(m.stat_block) })),
  ];
  if (rows.length) {
    const { error: cErr } = await supabase.from("combatants").insert(rows);
    if (cErr) return { error: "Couldn't add them to the fight. " + cErr.message } as Fail;
  }
  return { added: rows.length } as { added: number };
}

/** DM: start a fight built on the spot. */
export async function startQuickFight(sessionId: string, raw: FightPlan, name?: string): Promise<Fail | { combatId: string }> {
  refresh();
  const ctx = await dmCtx();
  if (!ctx) return { error: "Only the DM can start a fight." };
  const { supabase, campaignId } = ctx;
  const plan = cleanPlan(raw);
  if (!plan.picks.length) return { error: "Add at least one monster first." };
  const { data: s } = await supabase.from("sessions").select("id").eq("id", sessionId).eq("campaign_id", campaignId).is("ended_at", null).maybeSingle();
  if (!s) return { error: "That session isn't running any more." };
  const { data: combat, error } = await supabase.from("combats")
    .insert({ campaign_id: campaignId, session_id: sessionId, name: name?.trim().slice(0, 80) || "Combat", round: 1, turn_index: 0 })
    .select("id").single();
  if (error || !combat) return { error: "Couldn't start the fight. " + (error?.message ?? "") };
  const res = await fill(supabase, campaignId, combat.id, plan);
  if ("error" in res) return res;
  return { combatId: combat.id as string };
}

/** DM: add more creatures (or characters) to the running fight. */
export async function addToFight(combatId: string, raw: FightPlan): Promise<Fail | { added: number }> {
  refresh();
  const ctx = await dmCtx();
  if (!ctx) return { error: "Only the DM can add to the fight." };
  const { supabase, campaignId } = ctx;
  const { data: combat } = await supabase.from("combats").select("id, campaign_id").eq("id", combatId).is("ended_at", null).maybeSingle();
  if (!combat || combat.campaign_id !== campaignId) return { error: "That fight is over." };
  const res = await fill(supabase, campaignId, combatId, cleanPlan(raw));
  if ("error" in res) return res;
  await touchCombat(createAdminClient(), combatId);
  return res;
}
