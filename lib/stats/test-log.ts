// The sample session (06-sample-session-log.json) as rolls and HP changes, for the stats and recap tests.
import log from "../test-fixtures/sample-session-3.json";
import type { StatActor, StatEffect, StatRoll } from "./compute";

type LogRoll = (typeof log.roll_events)[number] & Partial<{ target: string; parent: number; applied: number; drops: boolean; success: boolean; is_crit: boolean; spell_slot: number }>;

/** Same rules as 08-example-session-3.sql: every damage/heal with a target gets a linked HP change. */
export function fromLog() {
  const actors: StatActor[] = log.actors.map((a) => ({
    key: `${a.type === "character" ? "c" : "m"}:${a.id}`, id: a.id, kind: a.type as "character" | "monster", name: a.name, hpMax: a.hp_max,
  }));
  const isPc = (id?: string) => !!id && id.startsWith("pc");
  const t = (i: number) => new Date(Date.UTC(2026, 9, 3, 16, 0, i)).toISOString();
  const rolls: StatRoll[] = (log.roll_events as LogRoll[]).map((r) => ({
    id: String(r.id), session_id: "s3", combat_id: r.round === null ? null : "e1", round: r.round,
    character_id: isPc(r.actor) ? r.actor : null, monster_id: isPc(r.actor) ? null : r.actor,
    roll_type: r.roll_type, source: r.source, expression: r.expression, dice: r.dice ?? [], total: r.total ?? null,
    is_crit: !!r.is_crit, is_fumble: false, success: r.success ?? null, spell_slot: r.spell_slot ?? null,
    parent_roll_id: r.parent ? String(r.parent) : null,
    target_character_id: isPc(r.target) ? r.target! : null, target_monster_id: r.target && !isPc(r.target) ? r.target : null,
    created_at: t(r.id),
  }));
  const effects: StatEffect[] = (log.roll_events as LogRoll[])
    .filter((r) => (r.roll_type === "damage" || r.roll_type === "heal") && r.target)
    .map((r) => ({
      id: `e${r.id}`, session_id: "s3", combat_id: "e1", roll_event_id: String(r.id),
      actor_character_id: isPc(r.actor) ? r.actor : null, actor_monster_id: isPc(r.actor) ? null : r.actor,
      target_character_id: isPc(r.target) ? r.target! : null, target_monster_id: isPc(r.target) ? null : r.target!,
      kind: r.roll_type, amount: r.applied ?? r.total ?? 0, rolled_amount: r.total ?? 0, dropped_to_zero: !!r.drops, created_at: t(r.id),
    }));
  return { actors, rolls, effects };
}

