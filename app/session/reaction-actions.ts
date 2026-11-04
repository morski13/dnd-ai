"use server";
// The reaction pop-up: open windows for the creatures you control, and your answer.
// Using a reaction marks it used for the round. Shield (+5 AC) and Uncanny Dodge (halve the damage) are done
// by the app; Shield can turn the hit into a miss. Rolls (an Opportunity Attack, Counterspell…) the pop-up
// then rolls from your sheet like any other roll.
import { refresh } from "next/cache";
import { cleanEffects, makeEffect, shownConditions } from "@/lib/engine/effects";
import { adjustHp } from "@/lib/moderator/apply";
import { touchCombat } from "@/lib/roll-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { WindowEligible } from "@/lib/reactions-server";
import type { ReactOption } from "@/lib/engine/react";

type Fail = { error: string };

export type OpenWindow = {
  id: string; closesAt: string; text: string;
  mine: (WindowEligible & { answered: boolean })[]; // the creatures you control that can react
};

async function viewer() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub ?? null;
  if (!userId) return null;
  const { data: m } = await supabase.from("campaign_members").select("campaign_id, role").eq("user_id", userId)
    .order("last_active_at", { ascending: false, nullsFirst: false }).order("joined_at", { ascending: true }).limit(1).maybeSingle();
  if (!m) return null;
  return { userId, campaignId: m.campaign_id as string, isDm: m.role === "dm" || m.role === "co_dm" };
}

type Row = { id: string; campaign_id: string; combat_id: string; trigger: Record<string, unknown>; eligible: WindowEligible[]; responses: { combatantId: string; optionId: string | null; at: string }[]; roll_id: string | null; closes_at: string; status: string };

const describe = (t: Record<string, unknown>) =>
  t.kind === "attack" ? `${t.attackerName} ${t.hit ? "hits" : "attacks"}${t.total != null ? ` (${t.total})` : ""}`
  : t.kind === "spell" ? `${t.casterName} casts ${t.spell}`
  : t.kind === "leave" ? `${t.moverName} is leaving reach`
  : t.kind === "damage" ? `${t.sourceName} deals ${(t.types as string[] | undefined)?.join(" + ") || ""} damage`.replace(/\s+damage/, " damage")
  : "Something happens";

/** Which of these creatures does this person control? Players: their own characters; the DM: everything else too. */
async function controls(admin: ReturnType<typeof createAdminClient>, v: { userId: string; isDm: boolean }, e: WindowEligible) {
  if (v.isDm) return true;
  if (!e.characterId) return false;
  const { data } = await admin.from("characters").select("owner_user_id").eq("id", e.characterId).maybeSingle();
  return data?.owner_user_id === v.userId;
}

/** Open windows (not closed, not past their time) with your creatures in them. */
export async function openWindows(): Promise<OpenWindow[]> {
  const v = await viewer();
  if (!v) return [];
  const admin = createAdminClient();
  const { data, error } = await admin.from("reaction_windows").select("*").eq("campaign_id", v.campaignId).eq("status", "open")
    .gt("closes_at", new Date(Date.now() - 500).toISOString()).order("opened_at", { ascending: true }).limit(5);
  if (error) return [];
  const out: OpenWindow[] = [];
  for (const w of (data ?? []) as Row[]) {
    const mine: OpenWindow["mine"] = [];
    for (const e of w.eligible) if (await controls(admin, v, e)) mine.push({ ...e, answered: w.responses.some((r) => r.combatantId === e.combatantId) });
    if (mine.some((m) => !m.answered)) out.push({ id: w.id, closesAt: w.closes_at, text: describe(w.trigger), mine });
  }
  return out;
}

export type Answer = { ok: true; roll: { characterId: string; key: string; target: { characterId?: string | null; monsterId?: string | null } | null } | null; note: string | null };

/** Your answer for one creature: an option, or null to pass. */
export async function respondReaction(windowId: string, combatantId: string, optionId: string | null): Promise<Fail | Answer> {
  const v = await viewer();
  if (!v) return { error: "Log in first." };
  const admin = createAdminClient();
  const { data } = await admin.from("reaction_windows").select("*").eq("id", windowId).eq("campaign_id", v.campaignId).maybeSingle();
  const w = data as Row | null;
  if (!w) return { error: "That moment has passed." };
  // a little grace for a slow phone: two seconds past the timer
  if (w.status !== "open" || Date.parse(w.closes_at) + 2000 < Date.now()) return { error: "Too late: the moment has passed." };
  const e = w.eligible.find((x) => x.combatantId === combatantId);
  if (!e || !(await controls(admin, v, e))) return { error: "That isn't yours." };
  if (w.responses.some((r) => r.combatantId === combatantId)) return { error: "Already answered." };
  const opt: ReactOption | null = optionId ? e.options.find((o) => o.id === optionId) ?? null : null;
  if (optionId && !opt) return { error: "Unknown reaction." };
  const responses = [...w.responses, { combatantId, optionId: opt?.id ?? null, at: new Date().toISOString() }];
  const everyone = w.eligible.every((x) => responses.some((r) => r.combatantId === x.combatantId));
  await admin.from("reaction_windows").update({ responses, ...(everyone ? { status: "closed" } : {}) }).eq("id", w.id);

  let note: string | null = null;
  if (opt) {
    // the reaction is used until the start of its next turn
    const { data: row } = await admin.from("combatants").select("*").eq("id", combatantId).maybeSingle();
    const t = w.trigger;
    let effects = cleanEffects((row as { effects?: unknown } | null)?.effects);
    if (opt.effect === "shield") {
      effects = [...effects, { ...makeEffect({ id: crypto.randomUUID(), name: "Shield", conditions: [], source: null, duration: "start_of_next_turn", turnsOf: combatantId, target: combatantId }), ac: 5 }];
      // the attack that set it off: does it miss now?
      if (t.kind === "attack" && typeof t.total === "number" && typeof t.ac === "number" && t.total < t.ac + 5 && w.roll_id) {
        await admin.from("roll_events").update({ success: false }).eq("id", w.roll_id);
        note = `Shield: ${t.total} doesn't beat AC ${t.ac + 5}. It misses!`;
      } else note = "Shield: +5 AC until the start of your next turn.";
    }
    if (opt.effect === "halve") {
      effects = [...effects, { ...makeEffect({ id: crypto.randomUUID(), name: "Uncanny Dodge", conditions: [], source: null, duration: "end_of_next_turn", turnsOf: combatantId, target: combatantId }), halveNext: true }];
      note = "Uncanny Dodge: the damage of this hit is halved.";
    }
    if (opt.id === "absorb-elements" && typeof t.effectId === "string") {
      const r = await adjustHp(admin, t.effectId, "resist", v.userId);
      note = "error" in r ? "Absorb Elements: resistance against that damage (fix the HP by hand if it didn't change)." : `Absorb Elements: you take ${r.amount} instead.`;
    }
    await admin.from("combatants").update({ reaction_used: true, effects, conditions: shownConditions((row as { conditions?: string[] } | null)?.conditions ?? [], effects) }).eq("id", combatantId);
    await touchCombat(admin, w.combat_id);
  }
  refresh();
  // what to roll now: the reaction's spell or attack, aimed at whoever set it off
  const t = w.trigger;
  const at = (id: unknown) => (typeof id === "string" ? id : null);
  const otherId = t.kind === "attack" ? at(t.attackerId) : t.kind === "spell" ? at(t.casterId) : t.kind === "leave" ? at(t.moverId) : at(t.sourceId);
  let target: { characterId?: string | null; monsterId?: string | null } | null = null;
  if (otherId) {
    const { data: o } = await admin.from("combatants").select("character_id, monster_id").eq("id", otherId).maybeSingle();
    if (o) target = { characterId: o.character_id as string | null, monsterId: o.monster_id as string | null };
  }
  const roll = opt?.key && e.characterId && opt.effect !== "halve" ? { characterId: e.characterId, key: opt.key, target: opt.id === "shield" || opt.id === "absorb-elements" ? null : target } : null;
  if (opt && !roll && !note) note = e.monsterId ? `${e.name}: ${opt.name}. Roll it on its card.` : `${opt.name}: tell the table.`;
  return { ok: true, roll, note };
}

/** For the DM's monster card after an attack: is the window still open, and did a reaction change the hit? */
export async function windowState(windowId: string): Promise<Fail | { open: boolean; closesAt: string; used: string[]; success: boolean | null }> {
  const v = await viewer();
  if (!v) return { error: "Log in first." };
  const admin = createAdminClient();
  const { data } = await admin.from("reaction_windows").select("*").eq("id", windowId).eq("campaign_id", v.campaignId).maybeSingle();
  const w = data as Row | null;
  if (!w) return { error: "Not found." };
  const open = w.status === "open" && Date.parse(w.closes_at) > Date.now();
  const used = w.responses.filter((r) => r.optionId).map((r) => {
    const e = w.eligible.find((x) => x.combatantId === r.combatantId);
    return `${e?.name ?? "?"}: ${e?.options.find((o) => o.id === r.optionId)?.name ?? r.optionId}`;
  });
  let success: boolean | null = null;
  if (w.roll_id) { const { data: r } = await admin.from("roll_events").select("success").eq("id", w.roll_id).maybeSingle(); success = (r?.success as boolean | null) ?? null; }
  return { open, closesAt: w.closes_at, used, success };
}
