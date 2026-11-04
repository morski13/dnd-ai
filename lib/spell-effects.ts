// What a spell does in the fight beyond its dice (server, secret key): conditions on a failed save,
// buffs on the creatures picked, a mark on a hit. Rules from lib/engine/spells.ts. Callers check permissions.
import type { Admin, Target } from "@/lib/roll-service";
import { makeEffect, type TimedEffect } from "@/lib/engine/effects";
import { putEffect, whoIs } from "@/lib/engine/server";
import { durationRounds, spellRule } from "@/lib/engine/spells";
import type { SpellInfo } from "@/lib/rules";

export async function applySpellRules(admin: Admin, a: {
  campaignId: string; combatId: string; caster: Target; casterName: string; spell: SpellInfo; dc: number;
  failed: Target[]; buffed: Target[] | null; hit: Target | null; // buffed null: not the casting roll (no buff)
}): Promise<string[]> {
  const rule = spellRule(a.spell);
  if (!rule) return [];
  const me = await whoIs(admin, a.campaignId, a.combatId, a.caster);
  if (!me?.combatantId) return [];
  const rounds = durationRounds(a.spell.duration);
  const source = { combatantId: me.combatantId, name: a.casterName };
  const conc = !!a.spell.concentration;
  const out: string[] = [];
  const put = async (t: Target, e: TimedEffect) => {
    const r = await putEffect(admin, a.campaignId, a.combatId, t, e);
    if (!r) return;
    if (r.added.length) out.push(`${r.name}: ${r.added.join(" and ")} (${a.spell.name})`);
    else if (e.ac || e.bonusDice || e.fly) out.push(`${r.name}: ${a.spell.name}${e.ac ? ` ${e.ac > 0 ? "+" : ""}${e.ac} AC` : ""}${e.bonusDice ? ` ${e.bonusDice.startsWith("-") ? "" : "+"}${e.bonusDice}` : ""}${e.fly ? ` fly ${e.fly} ft` : ""}`);
    if (r.immune.length) out.push(`${r.name} is immune to ${r.immune.join(", ")} (immune)`);
  };
  const id = () => crypto.randomUUID();
  // a failed save
  if (rule.onFail) {
    for (const t of a.failed) {
      const who = await whoIs(admin, a.campaignId, a.combatId, t);
      if (!who?.combatantId) continue;
      const f = rule.onFail;
      const base = f.saveEnds
        ? makeEffect({ id: id(), name: a.spell.name, conditions: f.conditions, source, duration: "save_ends", rounds: rounds ?? 10, turnsOf: me.combatantId, target: who.combatantId, save: { ability: rule.save ?? a.spell.roll?.save_ability ?? "WIS", dc: a.dc }, concentration: conc })
        : f.untilEndOfNextTurn
          ? makeEffect({ id: id(), name: a.spell.name, conditions: f.conditions, source, duration: "end_of_next_turn", turnsOf: who.combatantId, target: who.combatantId, concentration: conc })
          : makeEffect({ id: id(), name: a.spell.name, conditions: f.conditions, source, duration: rounds ? "rounds" : "removed", rounds: rounds ?? undefined, turnsOf: me.combatantId, target: who.combatantId, concentration: conc });
      await put(t, { ...base, ...(f.ac ? { ac: f.ac } : {}), ...(f.bonusDice ? { bonusDice: f.bonusDice } : {}) });
    }
  }
  // buffs on the creatures picked (Bless, Shield of Faith, Haste, Fly…)
  if (rule.buff && a.buffed) {
    // nobody picked (Blur, Self spells, or the picker skipped): the caster gets it
    for (const t of a.buffed.length ? a.buffed : [a.caster]) {
      const who = await whoIs(admin, a.campaignId, a.combatId, t);
      if (!who?.combatantId) continue;
      const b = rule.buff;
      const base = makeEffect({ id: id(), name: a.spell.name, conditions: b.conditions ?? [], source, duration: rounds ? "rounds" : "removed", rounds: rounds ?? undefined, turnsOf: me.combatantId, target: who.combatantId, concentration: conc });
      await put(t, { ...base, ...(b.ac ? { ac: b.ac } : {}), ...(b.bonusDice ? { bonusDice: b.bonusDice } : {}), ...(b.fly ? { fly: b.fly } : {}) });
    }
  }
  // a mark on a hit (Guiding Bolt): until the end of the caster's next turn
  if (rule.onHit && a.hit) {
    const who = await whoIs(admin, a.campaignId, a.combatId, a.hit);
    if (who?.combatantId) await put(a.hit, makeEffect({ id: id(), name: a.spell.name, conditions: rule.onHit.conditions, source, duration: "end_of_next_turn", turnsOf: me.combatantId, target: who.combatantId }));
  }
  return out;
}
