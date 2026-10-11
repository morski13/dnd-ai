"use server";
// Short and long rests for one character. Hit dice are rolled here on the server and saved like any roll.
import { loadCharacter } from "@/lib/character-data";
import { roll } from "@/lib/dice";
import { applyHp } from "@/lib/moderator/apply";
import { longRestFor, type RestResult } from "@/lib/rest-service";
import { hitDiceLeft, shortRest, type RestState } from "@/lib/rests";
import { abilityMod } from "@/lib/rules";
import { createAdminClient } from "@/lib/supabase/admin";
import { liveState } from "@/lib/roll-service";

type Fail = { error: string };

async function load(characterId: string) {
  const x = await loadCharacter(characterId);
  if (!x.character || !x.userId) return { error: "Character not found." } as Fail;
  if (!x.canEdit) return { error: "You can only rest your own character." } as Fail;
  return x as typeof x & { userId: string; character: NonNullable<typeof x.character> };
}

/** Short rest: spend the chosen hit dice, e.g. { 12: 2 } = two d12s. */
export async function takeShortRest(characterId: string, spend: Record<string, number>): Promise<Fail | RestResult> {
  const x = await load(characterId);
  if ("error" in x) return x;
  const c = x.character;
  const st = { ...c, hit_dice_used: c.hit_dice_used ?? {} } as unknown as RestState;
  const left = hitDiceLeft(st);
  const con = abilityMod(c.ability_scores.CON ?? 10);
  const rolls: RestResult["rolls"] = [];
  const each: { die: number; roll: number }[] = [];
  for (const { die, left: n } of left) {
    const want = Math.max(0, Math.min(n, Math.floor(spend[String(die)] ?? 0)));
    if (!want) continue;
    const r = roll(`${want}d${die}`);
    r.dice.forEach((v) => each.push({ die, roll: v }));
    rolls.push({ die, dice: r.dice, total: r.dice.reduce((a, b) => a + Math.max(1, b + con), 0), expression: `${want}d${die}${con ? (con > 0 ? `+${con * want}` : `${con * want}`) : ""}` });
  }
  const res = shortRest(st, each, con);
  const admin = createAdminClient();
  const { session, combat } = await liveState(admin, c.campaign_id);
  for (const r of rolls) {
    await admin.from("roll_events").insert({
      campaign_id: c.campaign_id, session_id: session?.id ?? null, combat_id: combat?.id ?? null, rolled_by: x.userId, character_id: c.id,
      roll_type: "hit_dice", source: "Short rest", expression: r.expression, dice: r.dice, modifier: con * r.dice.length, total: r.total,
    });
  }
  if (res.healed > 0 && (c.hp_current ?? 0) < (c.hp_max ?? 0)) {
    await applyHp(admin, { campaignId: c.campaign_id, sessionId: session?.id ?? null, combatId: combat?.id ?? null, round: combat?.round ?? null,
      kind: "heal", total: res.healed, target: { characterId: c.id }, createdBy: x.userId });
  }
  await admin.from("characters").update({ hit_dice_used: res.hit_dice_used, resources: res.resources, spells: res.spells }).eq("id", c.id);
  const { data: now } = await admin.from("characters").select("hp_current, temp_hp").eq("id", c.id).single();
  return { kind: "short", healed: res.healed, hp_current: now?.hp_current ?? res.hp_current, temp_hp: now?.temp_hp ?? c.temp_hp, rolls,
    hit_dice_used: res.hit_dice_used, resources: res.resources, spells: res.spells, ended: null };
}

/** Long rest: everything back, death saves cleared, concentration ends. */
export async function takeLongRest(characterId: string): Promise<Fail | RestResult> {
  const x = await load(characterId);
  if ("error" in x) return x;
  return (await longRestFor(x.character.id, x.userId)) ?? { error: "Character not found." };
}
