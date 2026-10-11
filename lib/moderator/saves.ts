// Saving throws against a player's spell (Fireball, Sacred Flame…). The app rolls each target's save.
// Monster saves are DM secrets: hidden rolls that only the DM sees until the fight ends or the DM reveals them.
import { roll } from "../dice";
import type { Admin, Target } from "../roll-service";
import { saveBonus, type Ability, type SheetCharacter } from "../rules";
import { monsterSave } from "./concentration";

export type TargetSave = { target: Target; name: string; success: boolean | null; total: number | null; dc: number; secret: boolean; rollId: string | null }; // null = secret from you

export async function rollTargetSaves(admin: Admin, a: {
  campaignId: string; sessionId: string | null; combatId: string | null; round: number | null; createdBy: string;
  parentRollId: string; ability: Ability; dc: number; spell: string; targets: Target[];
}): Promise<TargetSave[]> {
  const out: TargetSave[] = [];
  for (const t of a.targets.slice(0, 12)) {
    let name = "", bonus = 0, secret = false;
    if (t.monsterId) {
      const { data: m } = await admin.from("monsters").select("id, name, stat_block").eq("id", t.monsterId).eq("campaign_id", a.campaignId).maybeSingle();
      if (!m) continue;
      name = m.name; bonus = monsterSave(m.stat_block, a.ability); secret = true;
    } else if (t.characterId) {
      const { data: c } = await admin.from("characters").select("id, name, ability_scores, class_levels, proficiencies").eq("id", t.characterId).eq("campaign_id", a.campaignId).maybeSingle();
      if (!c) continue;
      name = c.name;
      bonus = saveBonus({ ability_scores: c.ability_scores ?? {}, class_levels: c.class_levels ?? [], proficiencies: c.proficiencies ?? {}, spells: {}, attacks: [] } as SheetCharacter, a.ability);
    } else continue;
    const r = roll(`1d20${bonus >= 0 ? "+" : ""}${bonus}`);
    const success = r.total >= a.dc;
    const { data: saved } = await admin.from("roll_events").insert({
      campaign_id: a.campaignId, session_id: a.sessionId, combat_id: a.combatId, round: a.round, rolled_by: a.createdBy,
      monster_id: t.monsterId ?? null, character_id: t.monsterId ? null : t.characterId ?? null,
      roll_type: "save", source: `${a.spell} save`, expression: r.expression, dice: r.dice, dice_all: r.diceAll, modifier: r.modifier,
      total: r.total, dc: a.dc, ability: a.ability, success, parent_roll_id: a.parentRollId, hidden: secret,
    }).select("id").single();
    out.push({ target: t, name, success, total: r.total, dc: a.dc, secret, rollId: saved?.id ?? null });
  }
  return out;
}

/** What players may know about the saves: their own side's results, but never a monster's. */
export function maskSaves(saves: TargetSave[], viewerIsDm: boolean): TargetSave[] {
  return viewerIsDm ? saves : saves.map((s) => (s.secret ? { ...s, success: null, total: null, rollId: null } : s));
}
