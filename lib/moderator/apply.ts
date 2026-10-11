// The fight moderator, server side: changes HP, death saves, monster health and conditions
// in one place, and records it as an "effect" that can be fixed or undone.
// Uses the secret-key client: callers must check permissions first. Only import from server actions.
import type { Admin, Target } from "@/lib/roll-service";
import { touchCombat } from "@/lib/roll-service";
import { checkConcentration, type ConcentrationCheck } from "./concentration";
import { adjusted, applyDamage, applyHeal, healthOf, NO_SAVES, type DeathSaves, type Factor, type Health, type HpState } from "./hp";

export type Applied = {
  effectId: string;
  kind: "damage" | "heal";
  target: { characterId: string | null; monsterId: string | null; name: string };
  rolled: number;          // the number on the dice (after crits)
  amount: number;          // after save / resistance
  factor: Factor;
  hpBefore: number | null; // null = hidden from this viewer (a player looking at a monster)
  hpAfter: number | null;
  hpMax: number | null;
  tempLost: number;
  dropped: boolean;
  dead: boolean;
  instantDeath: boolean;
  deathFails: number;
  revived: boolean;
  health: Health;          // what players see for monsters
  canAdjust: boolean;      // filled in by the caller for the viewer
  undone?: boolean;
  concentration?: ConcentrationCheck | null; // the CON save to keep a spell going
};

type Loaded = { kind: "character" | "monster"; id: string; campaignId: string; name: string; state: HpState };

async function loadTarget(admin: Admin, campaignId: string, t: Target): Promise<Loaded | null> {
  if (t.characterId) {
    const [{ data: c }, { data: ds }] = await Promise.all([
      admin.from("characters").select("id, campaign_id, name, hp_current, hp_max, temp_hp").eq("id", t.characterId).eq("campaign_id", campaignId).maybeSingle(),
      admin.from("death_saves").select("successes, failures, stable, dead").eq("character_id", t.characterId).maybeSingle(),
    ]);
    if (!c) return null;
    const max = c.hp_max ?? 0;
    return {
      kind: "character", id: c.id, campaignId, name: c.name,
      state: { hp: c.hp_current ?? max, max, temp: c.temp_hp ?? 0, saves: (ds as DeathSaves | null) ?? NO_SAVES },
    };
  }
  if (t.monsterId) {
    const { data: m } = await admin.from("monsters").select("id, campaign_id, name, hp_current, hp_max").eq("id", t.monsterId).eq("campaign_id", campaignId).maybeSingle();
    if (!m) return null;
    const max = m.hp_max ?? 0;
    const hp = m.hp_current ?? max;
    return { kind: "monster", id: m.id, campaignId, name: m.name, state: { hp, max, temp: 0, saves: { ...NO_SAVES, dead: max > 0 && hp <= 0 } } };
  }
  return null;
}

/** Writes a new HP state for a character or monster (+ death saves, health, Unconscious). */
async function saveState(admin: Admin, t: Loaded, next: HpState) {
  if (t.kind === "character") {
    await admin.from("characters").update({ hp_current: next.hp, temp_hp: next.temp }).eq("id", t.id);
    await admin.from("death_saves").upsert({
      character_id: t.id, campaign_id: t.campaignId, ...next.saves, updated_at: new Date().toISOString(),
    });
    // Unconscious while at 0 HP (unless dead), in any running fight
    const { data: rows } = await admin.from("combatants").select("id, conditions, combat_id, combats!inner(ended_at)")
      .eq("character_id", t.id).is("combats.ended_at", null);
    for (const r of rows ?? []) {
      const set = new Set<string>(r.conditions ?? []);
      if (next.hp === 0 && !next.saves.dead) set.add("Unconscious"); else set.delete("Unconscious");
      await admin.from("combatants").update({ conditions: [...set] }).eq("id", r.id);
    }
  } else {
    await admin.from("monsters").update({ hp_current: next.hp }).eq("id", t.id);
    await admin.from("combatants").update({ health: healthOf(next.hp, next.max || null) }).eq("monster_id", t.id);
  }
}

export type ApplyArgs = {
  campaignId: string;
  sessionId: string | null;
  combatId: string | null;
  round: number | null;
  kind: "damage" | "heal";
  total: number;
  crit?: boolean;
  factor?: Factor;
  rollId?: string | null;
  actor?: Target | null;
  target: Target;
  createdBy: string;
  hidden?: boolean;
};

/** Apply damage or healing to a target and record it. Returns null if the target isn't found. */
export async function applyHp(admin: Admin, a: ApplyArgs): Promise<Applied | null> {
  const t = await loadTarget(admin, a.campaignId, a.target);
  if (!t) return null;
  const factor: Factor = a.kind === "damage" ? (a.factor ?? "full") : "full";
  const amount = a.kind === "damage" ? adjusted(a.total, factor) : Math.max(0, Math.floor(a.total));
  const change = a.kind === "damage"
    ? applyDamage(t.state, amount, { isCharacter: t.kind === "character", crit: a.crit })
    : applyHeal(t.state, amount);
  await saveState(admin, t, change.next);

  const { data: eff } = await admin.from("effects").insert({
    campaign_id: a.campaignId, session_id: a.sessionId, combat_id: a.combatId, round: a.round,
    roll_event_id: a.rollId ?? null,
    actor_character_id: a.actor?.characterId ?? null, actor_monster_id: a.actor?.monsterId ?? null,
    target_character_id: t.kind === "character" ? t.id : null, target_monster_id: t.kind === "monster" ? t.id : null,
    kind: a.kind,
    amount: a.kind === "damage" ? amount : change.healed,
    rolled_amount: Math.floor(a.total),
    factor,
    dropped_to_zero: change.dropped,
    hidden: !!a.hidden,
    created_by: a.createdBy,
    undo: { hp: t.state.hp, temp: t.state.temp, saves: t.state.saves, crit: !!a.crit },
  }).select("id").single();
  if (a.combatId) await touchCombat(admin, a.combatId);
  const concentration = a.kind === "damage" && amount > 0
    ? await checkConcentration(admin, {
      campaignId: a.campaignId, target: { characterId: t.kind === "character" ? t.id : null, monsterId: t.kind === "monster" ? t.id : null },
      damage: amount, down: change.next.hp === 0, sessionId: a.sessionId, combatId: a.combatId, round: a.round, createdBy: a.createdBy,
    })
    : null;

  return {
    effectId: eff?.id ?? "",
    kind: a.kind,
    target: { characterId: t.kind === "character" ? t.id : null, monsterId: t.kind === "monster" ? t.id : null, name: t.name },
    rolled: Math.floor(a.total), amount, factor,
    hpBefore: t.state.hp, hpAfter: change.next.hp, hpMax: t.state.max || null, tempLost: change.tempLost,
    dropped: change.dropped, dead: change.next.saves.dead, instantDeath: change.instantDeath,
    deathFails: change.deathFails, revived: change.revived,
    health: healthOf(change.next.hp, t.state.max || null),
    canAdjust: false,
    concentration,
  };
}

/**
 * Fix an HP change: apply it again with a different factor, or undo it.
 * Only the newest change on that target can be fixed (otherwise later changes would be wrong).
 */
export async function adjustHp(admin: Admin, effectId: string, to: Factor | "undo", byUser: string): Promise<Applied | { error: string }> {
  const { data: e } = await admin.from("effects")
    .select("id, campaign_id, session_id, combat_id, round, roll_event_id, actor_character_id, actor_monster_id, target_character_id, target_monster_id, kind, rolled_amount, undo, undone, hidden, created_at")
    .eq("id", effectId).maybeSingle();
  if (!e || !e.undo) return { error: "That change can't be fixed." };
  if (e.undone) return { error: "Already undone." };
  const targetCol = e.target_character_id ? "target_character_id" : "target_monster_id";
  const targetId = e.target_character_id ?? e.target_monster_id;
  const { count } = await admin.from("effects").select("id", { count: "exact", head: true })
    .eq(targetCol, targetId).eq("undone", false).gt("created_at", e.created_at).in("kind", ["damage", "heal", "temp_hp"]);
  if (count) return { error: "Their HP changed again since then. Fix the newest change first." };

  const t = await loadTarget(admin, e.campaign_id, { characterId: e.target_character_id, monsterId: e.target_monster_id });
  if (!t) return { error: "Target not found." };
  const before = e.undo as { hp: number; temp: number; saves: DeathSaves; crit?: boolean };
  const restored: HpState = { ...t.state, hp: before.hp, temp: before.temp, saves: before.saves ?? NO_SAVES };
  const kind = e.kind as "damage" | "heal";

  if (to === "undo") {
    await saveState(admin, t, restored);
    await admin.from("effects").update({ undone: true, amount: 0, dropped_to_zero: false }).eq("id", e.id);
    if (e.combat_id) await touchCombat(admin, e.combat_id);
    return {
      effectId: e.id, kind, target: { characterId: e.target_character_id, monsterId: e.target_monster_id, name: t.name },
      rolled: e.rolled_amount ?? 0, amount: 0, factor: "full", hpBefore: t.state.hp, hpAfter: restored.hp, hpMax: t.state.max || null,
      tempLost: 0, dropped: false, dead: restored.saves.dead, instantDeath: false, deathFails: 0, revived: false,
      health: healthOf(restored.hp, t.state.max || null), canAdjust: false, undone: true,
    };
  }

  const amount = kind === "damage" ? adjusted(e.rolled_amount ?? 0, to) : (e.rolled_amount ?? 0);
  const change = kind === "damage"
    ? applyDamage(restored, amount, { isCharacter: t.kind === "character", crit: before.crit })
    : applyHeal(restored, amount);
  await saveState(admin, t, change.next);
  await admin.from("effects").update({
    factor: to, amount: kind === "damage" ? amount : change.healed, dropped_to_zero: change.dropped, created_by: byUser,
  }).eq("id", e.id);
  if (e.combat_id) await touchCombat(admin, e.combat_id);
  return {
    effectId: e.id, kind, target: { characterId: e.target_character_id, monsterId: e.target_monster_id, name: t.name },
    rolled: e.rolled_amount ?? 0, amount, factor: to, hpBefore: restored.hp, hpAfter: change.next.hp, hpMax: t.state.max || null,
    tempLost: change.tempLost, dropped: change.dropped, dead: change.next.saves.dead, instantDeath: change.instantDeath,
    deathFails: change.deathFails, revived: change.revived, health: healthOf(change.next.hp, t.state.max || null), canAdjust: false,
  };
}

/** Players don't get to see a monster's exact HP. */
export function maskFor(a: Applied, viewerIsDm: boolean): Applied {
  if (viewerIsDm || !a.target.monsterId) return a;
  return { ...a, hpBefore: null, hpAfter: null, hpMax: null, concentration: null }; // monster saves stay secret
}

/** Is this user the DM (or co-DM) of the campaign? */
export async function isCampaignDm(admin: Admin, campaignId: string, userId: string) {
  const { data } = await admin.from("campaign_members").select("role").eq("campaign_id", campaignId).eq("user_id", userId).maybeSingle();
  return data?.role === "dm" || data?.role === "co_dm";
}

/** Set a character's death saves / HP directly (death save rolls, stabilize). */
export async function setDying(admin: Admin, campaignId: string, characterId: string, next: { hp?: number; saves: DeathSaves }) {
  const t = await loadTarget(admin, campaignId, { characterId });
  if (!t) return null;
  await saveState(admin, t, { ...t.state, hp: next.hp ?? t.state.hp, saves: next.saves });
  return t;
}

export async function campaignAutoApply(admin: Admin, campaignId: string): Promise<boolean> {
  const { data } = await admin.from("campaigns").select("settings").eq("id", campaignId).maybeSingle();
  return (data?.settings as { house_rules?: { auto_apply_damage?: boolean } } | null)?.house_rules?.auto_apply_damage !== false;
}
