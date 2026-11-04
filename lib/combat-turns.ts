// Server-only (secret key): whose turn it is, and moving the turn on. Callers check permissions first.
// Used by the DM's "Next turn" and by a player's "End turn" on their sheet (fights played at the table).
import { sortCombatants, shortName } from "@/lib/session-data";
import type { Admin } from "@/lib/roll-service";

type Row = { id: string; name: string; initiative: number | null; initiative_hidden?: boolean; dex_mod: number; character_id: string | null; monster_id: string | null; health: string | null };

/** The fight's turn order (highest initiative first), and who's up. */
export async function turnOrder(admin: Admin, combatId: string) {
  const [{ data: combat }, { data: rows }] = await Promise.all([
    admin.from("combats").select("*").eq("id", combatId).maybeSingle(),
    admin.from("combatants").select("id, name, initiative, initiative_hidden, dex_mod, character_id, monster_id, health").eq("combat_id", combatId),
  ]);
  const order = sortCombatants((rows ?? []) as Row[]);
  const c = combat as { id: string; round: number; turn_index: number; name: string | null; mode?: string; ended_at: string | null } | null;
  const current = c && order.length ? order[c.turn_index % order.length] : null;
  return { combat: c, order, current };
}

/** Next creature's turn: skips monsters at 0 HP and dead characters (dying characters still roll death saves). */
export async function advanceTurn(admin: Admin, combatId: string): Promise<{ error: string } | { round: number; turnIndex: number }> {
  const { combat, order } = await turnOrder(admin, combatId);
  if (!combat || !order.length) return { error: "No one is in this fight." };
  const charIds = order.filter((r) => r.character_id).map((r) => r.character_id!);
  const { data: dead } = charIds.length
    ? await admin.from("death_saves").select("character_id").in("character_id", charIds).eq("dead", true)
    : { data: [] as { character_id: string }[] };
  const deadSet = new Set((dead ?? []).map((d) => d.character_id as string));
  const skip = (r: Row) => (!!r.monster_id && r.health === "down") || (!!r.character_id && deadSet.has(r.character_id));
  let index = combat.turn_index;
  let round = combat.round;
  for (let k = 0; k < order.length; k++) {
    index += 1;
    if (index >= order.length) { index = 0; round += 1; }
    if (!skip(order[index])) break;
  }
  await admin.from("combats").update({ turn_index: index, round }).eq("id", combatId);
  // a new turn: that creature's movement on the battle map starts fresh (fine if there's no map)
  await admin.from("map_tokens").update({ moved_ft: 0, dashes: 0 }).eq("combatant_id", order[index].id).then(() => undefined, () => undefined);
  return { round, turnIndex: index };
}

/** One chip in the turn order on the sheet. Players don't see a monster's secret initiative. */
export type OrderChip = { id: string; name: string; initiative: number | null; hidden: boolean; me: boolean; enemy: boolean; current: boolean; out: boolean };

export function chipsFor(order: Row[], current: Row | null, characterId: string, viewerIsDm: boolean, npcIds: Set<string>): OrderChip[] {
  return order.map((r) => ({
    id: r.id, name: shortName(r.name),
    initiative: r.initiative_hidden && !viewerIsDm ? null : r.initiative,
    hidden: !!r.initiative_hidden && !viewerIsDm,
    me: r.character_id === characterId,
    enemy: !!r.monster_id && !npcIds.has(r.monster_id),
    current: current?.id === r.id,
    out: !!r.monster_id && r.health === "down",
  }));
}
