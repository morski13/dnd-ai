"use server";
// The character sheet in a fight: whose turn it is, ending your own turn, and conditions that outlast the fight.
import { refresh } from "next/cache";
import { loadCharacter } from "@/lib/character-data";
import { advanceTurn, chipsFor, turnOrder, type OrderChip } from "@/lib/combat-turns";
import { isCampaignDm } from "@/lib/moderator/apply";
import { CONDITIONS } from "@/lib/moderator/hp";
import { liveState, touchCombat } from "@/lib/roll-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Fail = { error: string };

/** What the sheet needs to know about the running fight. */
export type SheetCombat = {
  id: string;
  mode: "app" | "table";     // app = the DM runs it in Session mode; table = played at the table, the app counts turns
  name: string | null;
  round: number;
  turnKey: string;           // changes every time the turn moves on
  order: OrderChip[];
  current: { name: string; me: boolean } | null;
  meIn: boolean;             // this character is fighting
  myInitiative: number | null;
  waiting: number;           // characters who haven't rolled initiative yet
  isDm: boolean;
} | null;

export async function sheetCombat(characterId: string): Promise<Fail | { combat: SheetCombat; conditions: string[] }> {
  // asked every few seconds by an open sheet: a light look-up (the database's rules decide who may see the character)
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub ?? null;
  const { data: c } = userId ? await supabase.from("characters").select("id, campaign_id").eq("id", characterId).maybeSingle() : { data: null };
  if (!c || !userId) return { error: "Character not found." };
  const admin = createAdminClient();
  const [{ combat: live }, isDm, conditions] = await Promise.all([liveState(admin, c.campaign_id as string), isCampaignDm(admin, c.campaign_id as string, userId), conditionsOf(admin, c.id as string)]);
  if (!live) return { combat: null, conditions };
  const { combat, order, current } = await turnOrder(admin, live.id as string);
  if (!combat) return { combat: null, conditions };
  const monsterIds = order.filter((r) => r.monster_id).map((r) => r.monster_id!);
  const { data: npcs } = monsterIds.length ? await admin.from("monsters").select("id").in("id", monsterIds).eq("kind", "npc") : { data: [] };
  const mine = order.find((r) => r.character_id === c.id) ?? null;
  return {
    conditions,
    combat: {
      id: combat.id, mode: combat.mode === "table" ? "table" : "app", name: combat.name, round: combat.round,
      turnKey: `${combat.round}:${combat.turn_index}`,
      order: chipsFor(order, current, c.id as string, isDm, new Set((npcs ?? []).map((n) => n.id as string))),
      current: current ? { name: current.name, me: current.character_id === c.id } : null,
      meIn: !!mine, myInitiative: mine?.initiative ?? null,
      waiting: order.filter((r) => r.character_id && r.initiative == null).length,
      isDm,
    },
  };
}

/** "End turn" on the sheet: the turn passes to the next one in the initiative order (only on your own turn). */
export async function endMyTurn(characterId: string, turnKey: string): Promise<Fail | { turnKey: string }> {
  const { userId, character: c, canEdit } = await loadCharacter(characterId);
  if (!c || !canEdit || !userId) return { error: "You can only end your own turn." };
  const admin = createAdminClient();
  const { combat: live } = await liveState(admin, c.campaign_id);
  if (!live) return { error: "The fight is over." };
  const { combat, current } = await turnOrder(admin, live.id as string);
  if (!combat || !current) return { error: "No one is in this fight." };
  const nowKey = `${combat.round}:${combat.turn_index}`;
  if (nowKey !== turnKey) return { turnKey: nowKey }; // tapped twice, or the DM already moved it on
  if (current.character_id !== c.id && !(await isCampaignDm(admin, c.campaign_id, userId))) return { error: `It's ${current.name}'s turn, not yours.` };
  const r = await advanceTurn(admin, combat.id);
  if ("error" in r) return r;
  refresh();
  return { turnKey: `${r.round}:${r.turnIndex}` };
}

/** Conditions on your character: they stay after the fight, until you take them off or take a long rest. */
export async function setMyConditions(characterId: string, conditions: string[]): Promise<Fail | { conditions: string[] }> {
  const { userId, character: c, canEdit } = await loadCharacter(characterId);
  if (!c || !canEdit || !userId) return { error: "You can only change your own character." };
  const allowed = new Set<string>(CONDITIONS);
  const clean = [...new Set(conditions.filter((x) => allowed.has(x)))].slice(0, 20);
  const admin = createAdminClient();
  const { error } = await admin.from("characters").update({ conditions: clean }).eq("id", c.id);
  if (error) return { error: /conditions/.test(error.message) ? "Run 34-table-combat.sql in Supabase to keep conditions on the sheet." : error.message };
  // in a fight, the initiative chips show them too
  const { combat } = await liveState(admin, c.campaign_id);
  if (combat) {
    await admin.from("combatants").update({ conditions: clean }).eq("combat_id", combat.id).eq("character_id", c.id);
    await touchCombat(admin, combat.id as string);
  }
  refresh();
  return { conditions: clean };
}

async function conditionsOf(admin: ReturnType<typeof createAdminClient>, characterId: string): Promise<string[]> {
  const { data, error } = await admin.from("characters").select("conditions").eq("id", characterId).maybeSingle();
  if (error) return [];
  return ((data as { conditions?: string[] } | null)?.conditions ?? []).filter((x) => typeof x === "string");
}

/** Ends the running fight from a sheet: anyone at a table the players run themselves, or the DM. */
export async function endFightFromSheet(characterId: string): Promise<Fail | { ok: true }> {
  const { userId, character: c, canEdit } = await loadCharacter(characterId);
  if (!c || !canEdit || !userId) return { error: "Only for your own character." };
  const admin = createAdminClient();
  const { session, combat } = await liveState(admin, c.campaign_id);
  if (!combat) return { ok: true };
  const dm = await isCampaignDm(admin, c.campaign_id, userId);
  if (!dm && (session as { kind?: string } | null)?.kind !== "table") return { error: "The DM runs this fight; the DM ends it." };
  await admin.from("combats").update({ ended_at: new Date().toISOString() }).eq("id", combat.id);
  await admin.from("roll_events").update({ hidden: false }).eq("combat_id", combat.id);
  await admin.from("effects").update({ hidden: false }).eq("combat_id", combat.id);
  refresh();
  return { ok: true };
}
