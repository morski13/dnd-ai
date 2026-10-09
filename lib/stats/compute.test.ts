// Checks the stats engine against the expected numbers in 06-sample-session-log.json.
import { describe, expect, it } from "vitest";
import log from "../test-fixtures/sample-session-3.json";
import { awards, baseName, computeStats, fightSummaries, monsterType, type StatActor, type StatEffect, type StatRoll } from "./compute";

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

const SPELLS = new Set(["Sacred Flame", "Healing Word", "Shatter", "Fire Bolt", "Magic Missile"]);
const byName = (m: Map<string, ReturnType<typeof computeStats> extends Map<string, infer V> ? V : never>) =>
  Object.fromEntries([...m.values()].map((s) => [s.name, s]));

describe("session 3 stats (expected values from the sample log)", () => {
  const { actors, rolls, effects } = fromLog();
  const s = byName(computeStats(rolls, effects, actors, SPELLS));

  it("Vex", () => {
    expect(s.Vex.attacks).toBe(3);
    expect(s.Vex.hits).toBe(3);
    expect(s.Vex.hitRate).toBe(1);
    expect(s.Vex.damageDealt).toBe(44);
    expect(s.Vex.kills).toBe(2);
    expect(s.Vex.attackD20Avg).toBeCloseTo(14.33, 2);
    expect(s.Vex.mostUsedAttack).toBe("Shortbow");
    expect(s.Vex.checksMade).toBe(1);
  });
  it("Brakka", () => {
    expect(s.Brakka.attacks).toBe(2);
    expect(s.Brakka.hits).toBe(1);
    expect(s.Brakka.crits).toBe(1);
    expect(s.Brakka.nat20).toBe(1);
    expect(s.Brakka.damageDealt).toBe(24);
    expect(s.Brakka.damageTaken).toBe(8);
    expect(s.Brakka.resisted).toBe(8);
    expect(s.Brakka.mostUsedAttack).toBe("Greataxe");
    expect(s.Brakka.biggestHit).toEqual({ amount: 24, source: "Greataxe" });
  });
  it("Lyra", () => {
    expect(s.Lyra.damageDealt).toBe(8);
    expect(s.Lyra.healingDone).toBe(8);
    expect(s.Lyra.slotsUsed).toBe(1);
    expect(Object.keys(s.Lyra.spells).sort()).toEqual(["Healing Word", "Sacred Flame"]);
  });
  it("Orrin", () => {
    expect(s.Orrin.damageDealt).toBe(16);
    expect(s.Orrin.damageTaken).toBe(20);
    expect(s.Orrin.healingReceived).toBe(8);
    expect(s.Orrin.timesDropped).toBe(1);
    expect(s.Orrin.slotsUsed).toBe(1);
    expect(s.Orrin.failedChecks).toEqual(["Arcana"]);
  });
  it("Ogre", () => {
    expect(s.Ogre.damageDealt).toBe(22);
    expect(s.Ogre.damageTaken).toBe(68);
    expect(s.Ogre.savesMade).toBe(1);
    expect(s.Ogre.savesFailed).toBe(0);
    expect(s.Ogre.kills).toBe(1); // dropped Orrin
    expect(s.Ogre.timesDropped).toBe(1);
  });

  it("awards", () => {
    const chars = Object.values(s).filter((x) => x.kind === "character");
    const a = Object.fromEntries(awards(chars).map((x) => [x.id, x]));
    expect(a.mvp.winners).toEqual(["Vex"]);
    expect(a.healer.winners).toEqual(["Lyra"]);
    expect(a.reaper.winners).toEqual(["Vex"]);
    expect(a.crit.winners).toEqual(["Brakka"]);
    expect(a.onepunch.winners).toEqual(["Brakka"]);
    expect(a.bag.winners).toEqual(["Orrin"]);
    expect(a.floor.winners).toEqual(["Orrin"]);
    expect(a.cursed.winners).toEqual(["Orrin"]);
    expect(a.blessed.winners).toEqual(["Vex"]);
    expect(a.slinger.winners.sort()).toEqual(["Lyra", "Orrin"]);
    expect(a.goblin).toBeUndefined(); // nobody rolled a 1
  });

  it("fight summary", () => {
    const [f] = fightSummaries([{ id: "e1", name: "Ogre at the bridge", round: 3 }], rolls, effects, actors, new Map([["Ogre at the bridge", "Medium"]]));
    expect(f).toMatchObject({ rounds: 3, partyDamage: 92, enemyDamage: 28, pcsDropped: 1, enemiesDown: 2, plannedTier: "Medium" });
  });
});

describe("live play (no linked HP changes)", () => {
  const actors: StatActor[] = [
    { key: "c:a", id: "a", kind: "character", name: "Ana", hpMax: 20 },
    { key: "m:g", id: "g", kind: "monster", name: "Goblin Warrior 2", hpMax: 10 },
  ];
  const base = { session_id: "s", combat_id: "k", round: 1, is_crit: false, is_fumble: false, success: null, spell_slot: null, parent_roll_id: null, target_character_id: null, target_monster_id: null, character_id: null, monster_id: null, dice: [] as number[] };
  const rolls: StatRoll[] = [
    { ...base, id: "1", character_id: "a", roll_type: "damage", source: "Longsword", expression: "1d8+3", dice: [5], total: 8, target_monster_id: "g", created_at: "1" },
    { ...base, id: "2", monster_id: "g", roll_type: "damage", source: "Scimitar", expression: "1d6+2", dice: [4], total: 6, target_character_id: "a", created_at: "2" },
    { ...base, id: "3", character_id: "a", roll_type: "damage", source: "Longsword", expression: "1d8+3", dice: [1], total: 4, target_monster_id: "g", created_at: "3" },
  ];
  // Ana took 5 on her HP card (not 6) — the HP card wins.
  const effects: StatEffect[] = [
    { id: "e", session_id: "s", combat_id: "k", roll_event_id: null, actor_character_id: null, actor_monster_id: null, target_character_id: "a", target_monster_id: null, kind: "damage", amount: 5, rolled_amount: 5, dropped_to_zero: false, created_at: "2.5" },
  ];
  const s = byName(computeStats(rolls, effects, actors, new Set()));
  it("HP card is the truth for damage taken", () => expect(s.Ana.damageTaken).toBe(5));
  it("kill worked out from the monster's HP", () => {
    expect(s.Ana.kills).toBe(1);
    expect(s["Goblin Warrior 2"].timesDropped).toBe(1);
  });
  it("without the HP card, the damage rolls count", () => {
    const t = byName(computeStats(rolls, [], actors, new Set()));
    expect(t.Ana.damageTaken).toBe(6);
  });
});

it("names", () => {
  expect(baseName("Greataxe (crit) + Rage")).toBe("Greataxe");
  expect(baseName("Shatter (half)")).toBe("Shatter");
  expect(monsterType("Goblin Warrior 2")).toBe("Goblin Warrior");
  expect(monsterType("Goblin Warrior B")).toBe("Goblin Warrior");
  expect(monsterType("Ogre")).toBe("Ogre");
});
