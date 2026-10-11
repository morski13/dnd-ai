// Concentration: when someone who is concentrating takes damage, they make a CON save
// (DC 10 or half the damage, whichever is higher, at most 30). Fail, or drop to 0 HP, and the spell ends.
// Monster saves are secret (only the DM sees them) until the DM reveals them.
import { roll } from "../dice";
import type { Admin } from "../roll-service";
import { saveBonus, type Ability, type SheetCharacter } from "../rules";

export type ConcentrationCheck = { spell: string; dc: number; total: number | null; dice: number[]; kept: boolean; reason: "save" | "down" };

export const concentrationDc = (damage: number) => Math.min(30, Math.max(10, Math.floor(damage / 2)));

/** A monster's saving throw bonus from its stat block (SRD blocks have abilities.X.save). */
export function monsterSave(statBlock: unknown, a: Ability): number {
  const sb = (statBlock ?? {}) as { abilities?: Partial<Record<Ability, { mod?: number; save?: number }>>; saves?: Partial<Record<Ability, number>> };
  return sb.saves?.[a] ?? sb.abilities?.[a]?.save ?? sb.abilities?.[a]?.mod ?? 0;
}

export async function checkConcentration(admin: Admin, a: {
  campaignId: string; target: { characterId?: string | null; monsterId?: string | null }; damage: number; down: boolean;
  sessionId: string | null; combatId: string | null; round: number | null; createdBy: string;
}): Promise<ConcentrationCheck | null> {
  if (a.damage <= 0) return null;
  let spell: string | null = null, bonus = 0, isMonster = false;
  if (a.target.characterId) {
    const { data: c } = await admin.from("characters").select("concentration, ability_scores, class_levels, proficiencies").eq("id", a.target.characterId).maybeSingle();
    spell = (c?.concentration as { spell?: string } | null)?.spell ?? null;
    if (!spell) return null;
    bonus = saveBonus({ ability_scores: c!.ability_scores ?? {}, class_levels: c!.class_levels ?? [], proficiencies: c!.proficiencies ?? {}, spells: {}, attacks: [] } as SheetCharacter, "CON");
  } else if (a.target.monsterId) {
    const { data: m } = await admin.from("monsters").select("concentration, stat_block").eq("id", a.target.monsterId).maybeSingle();
    spell = (m?.concentration as { spell?: string } | null)?.spell ?? null;
    if (!spell) return null;
    bonus = monsterSave(m!.stat_block, "CON");
    isMonster = true;
  } else return null;

  const table = a.target.characterId ? "characters" : "monsters";
  const id = (a.target.characterId ?? a.target.monsterId)!;
  if (a.down) {
    await admin.from(table).update({ concentration: null }).eq("id", id);
    return { spell, dc: 0, total: null, dice: [], kept: false, reason: "down" };
  }
  const dc = concentrationDc(a.damage);
  const r = roll(`1d20${bonus >= 0 ? "+" : ""}${bonus}`);
  const kept = r.total >= dc;
  await admin.from("roll_events").insert({
    campaign_id: a.campaignId, session_id: a.sessionId, combat_id: a.combatId, round: a.round, rolled_by: a.createdBy,
    character_id: a.target.characterId ?? null, monster_id: a.target.monsterId ?? null,
    roll_type: "save", source: `Concentration (${spell})`, expression: r.expression, dice: r.dice, dice_all: r.diceAll, modifier: r.modifier,
    total: r.total, dc, ability: "CON", success: kept, hidden: isMonster,
  });
  if (!kept) await admin.from(table).update({ concentration: null }).eq("id", id);
  return { spell, dc, total: r.total, dice: r.dice, kept, reason: "save" };
}
