// Server-only rest helpers (secret key). Callers must check permissions first. Not a server action.
import { applyHp } from "@/lib/moderator/apply";
import { longRest, type RestState } from "@/lib/rests";
import { liveState } from "@/lib/roll-service";
import { createAdminClient } from "@/lib/supabase/admin";

export type RestResult = {
  kind: "short" | "long"; healed: number; hp_current: number; temp_hp: number;
  rolls: { die: number; dice: number[]; total: number; expression: string }[];
  hit_dice_used: Record<string, number>; resources: RestState["resources"]; spells: RestState["spells"]; ended: string | null;
};

/** Shared with the DM's "the party rests". */
export async function longRestFor(characterId: string, userId: string): Promise<RestResult | null> {
  const admin = createAdminClient();
  const { data: c } = await admin.from("characters").select("id, campaign_id, class_levels, hp_max, hp_current, temp_hp, resources, spells, hit_dice_used, rule_set, concentration").eq("id", characterId).maybeSingle();
  if (!c) return null;
  const st = { ...c, resources: c.resources ?? [], spells: c.spells ?? {}, hit_dice_used: c.hit_dice_used ?? {} } as RestState;
  const res = longRest(st);
  const { session, combat } = await liveState(admin, c.campaign_id);
  const missing = (c.hp_max ?? 0) - (c.hp_current ?? 0);
  if (missing > 0) {
    await applyHp(admin, { campaignId: c.campaign_id, sessionId: session?.id ?? null, combatId: combat?.id ?? null, round: combat?.round ?? null,
      kind: "heal", total: missing, target: { characterId: c.id }, createdBy: userId });
  }
  await admin.from("death_saves").delete().eq("character_id", c.id);
  await admin.from("characters").update({
    hp_current: res.hp_current, temp_hp: 0, hit_dice_used: res.hit_dice_used, resources: res.resources, spells: res.spells, concentration: null,
  }).eq("id", c.id);
  const ended = (c.concentration as { spell?: string } | null)?.spell ?? null;
  return { kind: "long", healed: Math.max(0, missing), hp_current: res.hp_current, temp_hp: 0, rolls: [], hit_dice_used: res.hit_dice_used,
    resources: res.resources, spells: res.spells, ended };
}
