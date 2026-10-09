// Loads everything the Statistics screen needs, as the logged-in user.
// Only rolls made during a session count. The database hides secret DM rolls from players.
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  awards, computeStats, fightSummaries, monsterType,
  type ActorStats, type Award, type FightSummary, type StatActor, type StatEffect, type StatRoll,
} from "@/lib/stats/compute";

/** One color per character, always the same one (checked for color-blind safety on the dark theme). */
export const CHARACTER_COLORS = ["#d95926", "#199e70", "#3987e5", "#d55181", "#c98500", "#9085e9"];

const ROLL_COLUMNS =
  "id, session_id, combat_id, round, character_id, monster_id, roll_type, source, expression, dice, total, is_crit, is_fumble, success, spell_slot, parent_roll_id, target_character_id, target_monster_id, created_at";
const EFFECT_COLUMNS =
  "id, session_id, combat_id, roll_event_id, actor_character_id, actor_monster_id, target_character_id, target_monster_id, kind, amount, rolled_amount, dropped_to_zero, created_at";

export type CharacterInfo = { key: string; id: string; name: string; short: string; color: string; mine: boolean };
export type TrendPoint = { session: string } & Record<string, number | string | null>;
export type MonsterRow = { type: string; count: number; damageDealt: number; downs: number; hitRate: number | null; damageTaken: number };

export type StatsView = {
  campaignName: string;
  isDm: boolean;
  sessions: { id: string; number: number; title: string | null; live: boolean }[];
  scope: "session" | "campaign";
  session: { id: string; number: number; title: string | null; live: boolean } | null;
  characters: CharacterInfo[];
  focus: CharacterInfo | null; // null = whole party
  stats: Record<string, ActorStats>; // by character key, current scope
  awards: Award[];
  party: { damage: number; healing: number; kills: number; rolls: number; nat20: number; nat1: number; dropped: number; d20Avg: number | null };
  trends: { damage: TrendPoint[]; healing: TrendPoint[]; d20Avg: TrendPoint[]; hitRate: TrendPoint[]; damageTaken: TrendPoint[] } | null;
  dm: {
    monsterDamage: number; pcsDropped: number; monsterHitRate: number | null; monsterD20Avg: number | null; monstersDown: number;
    monsters: MonsterRow[]; fights: (FightSummary & { sessionNumber: number | null })[];
  } | null;
};

// Supabase hands back at most 1,000 rows per request, so read in pages.
async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error || !data) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

const shortName = (name: string) => name.split(" ")[0];

export async function getStatsData(params: { scope?: string; s?: string; c?: string }): Promise<StatsView | { campaignName: null }> {
  await connection();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: membership } = await supabase
    .from("campaign_members")
    .select("role, campaigns(id, name)")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const campaign = membership?.campaigns as unknown as { id: string; name: string } | null;
  if (!membership || !campaign) return { campaignName: null };
  const isDm = membership.role === "dm" || membership.role === "co_dm";
  const cid = campaign.id;

  const [sessionsRes, charsRes, monstersRes, combatsRes, spellsRes, encountersRes, rolls, effects] = await Promise.all([
    supabase.from("sessions").select("id, number, title, started_at, ended_at").eq("campaign_id", cid).order("number"),
    supabase.from("characters").select("id, name, hp_max, owner_user_id, created_at").eq("campaign_id", cid).order("created_at").order("name"),
    supabase.from("monsters").select("id, name, kind, hp_max").eq("campaign_id", cid),
    supabase.from("combats").select("id, session_id, name, round").eq("campaign_id", cid).not("session_id", "is", null).order("started_at"),
    supabase.from("srd_spells").select("name"),
    isDm ? supabase.from("encounters").select("name, summary").eq("campaign_id", cid) : Promise.resolve({ data: [] as { name: string; summary: { tier?: string } | null }[] }),
    readAll<StatRoll>((a, b) => supabase.from("roll_events").select(ROLL_COLUMNS).eq("campaign_id", cid).not("session_id", "is", null).order("created_at").order("id").range(a, b)),
    readAll<StatEffect>((a, b) => supabase.from("effects").select(EFFECT_COLUMNS).eq("campaign_id", cid).not("session_id", "is", null).order("created_at").order("id").range(a, b)),
  ]);

  const chars = charsRes.data ?? [];
  const characters: CharacterInfo[] = chars.map((c, i) => ({
    key: `c:${c.id}`, id: c.id, name: c.name, short: shortName(c.name),
    color: CHARACTER_COLORS[i % CHARACTER_COLORS.length], mine: c.owner_user_id === userId,
  }));
  const actors: StatActor[] = [
    ...chars.map((c) => ({ key: `c:${c.id}`, id: c.id, kind: "character" as const, name: c.name, hpMax: c.hp_max })),
    ...(monstersRes.data ?? []).map((m) => ({ key: `m:${m.id}`, id: m.id, kind: "monster" as const, name: m.name, hpMax: m.hp_max, ally: m.kind === "npc" })),
  ];
  const spellNames = new Set((spellsRes.data ?? []).map((s) => s.name as string));

  // Sessions that have something to show
  const withRolls = new Set(rolls.map((r) => r.session_id));
  const sessions = (sessionsRes.data ?? [])
    .filter((s) => withRolls.has(s.id))
    .map((s) => ({ id: s.id, number: s.number, title: s.title, live: !!s.started_at && !s.ended_at }));

  const scope: "session" | "campaign" = params.scope === "campaign" || !sessions.length ? "campaign" : "session";
  const session = scope === "session" ? sessions.find((s) => String(s.number) === params.s) ?? sessions[sessions.length - 1] : null;
  const inScope = <T extends { session_id: string | null }>(xs: T[]) => (session ? xs.filter((x) => x.session_id === session.id) : xs);
  const scopedRolls = inScope(rolls);
  const scopedEffects = inScope(effects);

  const all = computeStats(scopedRolls, scopedEffects, actors, spellNames);
  const stats: Record<string, ActorStats> = {};
  for (const c of characters) { const s = all.get(c.key); if (s) stats[c.key] = s; }
  const charStats = Object.values(stats);

  const focus = characters.find((c) => c.id === params.c) ?? null;

  const sum = (f: (s: ActorStats) => number) => charStats.reduce((n, s) => n + f(s), 0);
  const d20Count = sum((s) => s.d20Count);
  const party = {
    damage: sum((s) => s.damageDealt), healing: sum((s) => s.healingDone), kills: sum((s) => s.kills),
    rolls: sum((s) => s.rolls), nat20: sum((s) => s.nat20), nat1: sum((s) => s.nat1), dropped: sum((s) => s.timesDropped),
    d20Avg: d20Count ? sum((s) => s.d20Sum) / d20Count : null,
  };

  // Trends: one point per session, one line per character
  let trends: StatsView["trends"] = null;
  if (scope === "campaign" && sessions.length) {
    const t = { damage: [] as TrendPoint[], healing: [] as TrendPoint[], d20Avg: [] as TrendPoint[], hitRate: [] as TrendPoint[], damageTaken: [] as TrendPoint[] };
    for (const s of sessions) {
      const per = computeStats(rolls.filter((r) => r.session_id === s.id), effects.filter((e) => e.session_id === s.id), actors, spellNames);
      const row = (f: (x: ActorStats) => number | null) => {
        const p: TrendPoint = { session: `S${s.number}` };
        for (const c of characters) { const x = per.get(c.key); p[c.key] = x ? f(x) : null; }
        return p;
      };
      t.damage.push(row((x) => x.damageDealt));
      t.healing.push(row((x) => x.healingDone));
      t.d20Avg.push(row((x) => (x.d20Avg === null ? null : Math.round(x.d20Avg * 10) / 10)));
      t.hitRate.push(row((x) => (x.hitRate === null ? null : Math.round(x.hitRate * 100))));
      t.damageTaken.push(row((x) => x.damageTaken));
    }
    trends = t;
  }

  // Behind the DM screen
  let dm: StatsView["dm"] = null;
  if (isDm) {
    const enemies = [...all.values()].filter((s) => s.kind === "monster" && !actors.find((a) => a.key === s.key)?.ally);
    const byType = new Map<string, MonsterRow & { hits: number; misses: number }>();
    for (const s of enemies) {
      const type = monsterType(s.name);
      const row = byType.get(type) ?? { type, count: 0, damageDealt: 0, downs: 0, hitRate: null, damageTaken: 0, hits: 0, misses: 0 };
      row.count++; row.damageDealt += s.damageDealt; row.downs += s.kills; row.damageTaken += s.damageTaken;
      row.hits += s.hits; row.misses += s.misses;
      byType.set(type, row);
    }
    const monsters = [...byType.values()]
      .map(({ hits, misses, ...r }) => ({ ...r, hitRate: hits + misses ? hits / (hits + misses) : null }))
      .sort((a, b) => b.damageDealt - a.damageDealt || b.downs - a.downs);
    const hits = enemies.reduce((n, s) => n + s.hits, 0), misses = enemies.reduce((n, s) => n + s.misses, 0);
    const mD20 = enemies.reduce((n, s) => n + s.d20Count, 0);
    const tiers = new Map<string, string>();
    for (const e of encountersRes.data ?? []) if (e.summary?.tier) tiers.set(e.name, e.summary.tier);
    const sessionNo = new Map((sessionsRes.data ?? []).map((s) => [s.id, s.number]));
    const combats = inScope(combatsRes.data ?? []);
    dm = {
      monsterDamage: enemies.reduce((n, s) => n + s.damageDealt, 0),
      pcsDropped: party.dropped,
      monstersDown: enemies.reduce((n, s) => n + s.timesDropped, 0),
      monsterHitRate: hits + misses ? hits / (hits + misses) : null,
      monsterD20Avg: mD20 ? enemies.reduce((n, s) => n + s.d20Sum, 0) / mD20 : null,
      monsters,
      fights: fightSummaries(combats, scopedRolls, scopedEffects, actors, tiers)
        .map((f) => ({ ...f, sessionNumber: sessionNo.get(combats.find((c) => c.id === f.combatId)?.session_id ?? "") ?? null }))
        .reverse(),
    };
  }

  return {
    campaignName: campaign.name, isDm, sessions, scope, session, characters, focus, stats,
    awards: awards(charStats), party, trends, dm,
  };
}
