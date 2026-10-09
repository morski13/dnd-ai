// Loads everything the Session screen needs, as the logged-in user.
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadCharacter } from "@/lib/character-data";

export type Combatant = {
  id: string;
  name: string;
  shortName: string;
  characterId: string | null;
  monsterId: string | null;
  initiative: number | null;   // null = not rolled yet (or hidden from you)
  hidden: boolean;             // monster's initiative is secret
  isMine: boolean;
  controllable: boolean;       // you can roll for it (your character, or anything if you're the DM)
  ally: boolean;               // an NPC fighting on the party's side
};

/** A monster's quick actions for the DM's card (from its stat block). */
export type QuickAction = { name: string; kind: string; bonus?: number; damage?: string; dc?: number; save_ability?: string };

export type LogRow = {
  id: string; created_at: string; round: number | null; actor: string; actor_kind: string; roll_type: string;
  source: string | null; expression: string | null; total: number | null; dice: number[] | null; dice_all: number[] | null;
  modifier: number | null; advantage: string; is_crit: boolean; is_fumble: boolean; success: boolean | null;
  dc: number | null; ability: string | null; damage_type: string | null; target: string | null; spell_slot: number | null; masked: boolean;
};

/** focusParam: "c:<characterId>" or "m:<monsterId>" (which card to show; from the URL). */
export async function getSessionData(focusParam?: string | null) {
  await connection(); // depends on who is logged in
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: membership } = await supabase
    .from("campaign_members")
    .select("role, campaigns(id, name, settings)")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const campaign = membership?.campaigns as unknown as
    | { id: string; name: string; settings: { house_rules?: { monster_rolls?: string } } }
    | null;
  if (!membership || !campaign) return { userId, campaign: null } as const;
  const isDm = membership.role === "dm" || membership.role === "co_dm";

  const [{ data: session }, { data: lastSession }, { data: characters }, { data: monsters }, { data: fights }] = await Promise.all([
    supabase.from("sessions").select("id, number, started_at")
      .eq("campaign_id", campaign.id).not("started_at", "is", null).is("ended_at", null)
      .order("number", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("sessions").select("number").eq("campaign_id", campaign.id)
      .order("number", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("characters").select("id, name, owner_user_id, ac").eq("campaign_id", campaign.id).order("name"),
    isDm
      ? supabase.from("monsters").select("id, name, ac, hp_max, hp_current, is_boss, kind, stat_block").eq("campaign_id", campaign.id).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string; ac: number | null; hp_max: number | null; hp_current: number | null; is_boss: boolean; kind: string; stat_block: { actions?: QuickAction[] } | null }[] }),
    isDm
      ? supabase.from("encounters").select("id, name, summary").eq("campaign_id", campaign.id).order("updated_at", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; name: string; summary: { tier?: string } | null }[] }),
  ]);

  const myCharacterIds = (characters ?? []).filter((c) => c.owner_user_id === userId).map((c) => c.id);
  const base = {
    userId, isDm, campaign: { id: campaign.id, name: campaign.name },
    monstersHiddenByDefault: (campaign.settings?.house_rules?.monster_rolls ?? "hidden") === "hidden",
    nextSessionNumber: (lastSession?.number ?? 0) + 1,
    party: (characters ?? []).map((c) => ({ id: c.id, name: c.name, unclaimed: !c.owner_user_id })),
    monsters: (monsters ?? []).map(({ stat_block, ...m }) => ({
      ...m,
      actions: ((stat_block as { actions?: QuickAction[] } | null)?.actions ?? []).filter((a) => a.kind === "attack" || a.kind === "save"),
    })),
    savedFights: (fights ?? []).map((f) => ({ id: f.id as string, name: f.name as string, tier: (f.summary as { tier?: string } | null)?.tier ?? null })),
    myCharacterIds,
  };
  if (!session) return { ...base, session: null, combat: null, combatants: [] as Combatant[], current: null, log: [] as LogRow[], focus: null, focusMonster: null } as const;

  const [{ data: combat }, { data: log }] = await Promise.all([
    supabase.from("combats").select("id, name, round, turn_index")
      .eq("session_id", session.id).is("ended_at", null)
      .order("started_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.rpc("session_log", { p_session_id: session.id, p_limit: 80 }),
  ]);

  let combatants: Combatant[] = [];
  if (combat) {
    const { data: rows } = await supabase
      .from("combatants").select("id, name, character_id, monster_id, initiative, initiative_hidden, dex_mod, monsters(kind)")
      .eq("combat_id", combat.id);
    combatants = sortCombatants(rows ?? []).map((r) => {
      const isMine = !!r.character_id && myCharacterIds.includes(r.character_id);
      const hidden = r.initiative_hidden && !isDm;
      return {
        id: r.id, name: r.name, shortName: shortName(r.name),
        characterId: r.character_id, monsterId: r.monster_id,
        initiative: hidden ? null : r.initiative, hidden: r.initiative_hidden,
        isMine, controllable: isDm || isMine,
        ally: (r.monsters as unknown as { kind?: string } | null)?.kind === "npc",
      };
    });
  }
  const current = combat && combatants.length ? combatants[combat.turn_index % combatants.length] : null;

  // Whose card to show: what you tapped (if you control it), else the current turn (if yours), else your character.
  const wanted = focusParam ?? "";
  const tappedChar = wanted.startsWith("c:") ? wanted.slice(2) : null;
  const tappedMonster = wanted.startsWith("m:") ? wanted.slice(2) : null;
  let focusMonster: { id: string; name: string; actions?: QuickAction[] } | null = null;
  let focusCharId: string | null = null;
  if (tappedMonster && isDm) {
    const m = combatants.find((x) => x.monsterId === tappedMonster) ?? null;
    focusMonster = m ? { id: tappedMonster, name: m.name } : (base.monsters.find((x) => x.id === tappedMonster) ?? null);
  } else if (tappedChar && (isDm || myCharacterIds.includes(tappedChar))) {
    focusCharId = tappedChar;
  } else if (current?.controllable && current.monsterId && isDm) {
    focusMonster = { id: current.monsterId, name: current.name };
  } else if (current?.controllable && current.characterId) {
    focusCharId = current.characterId;
  } else {
    focusCharId = myCharacterIds[0] ?? null;
  }
  const focus = focusCharId ? await loadCharacter(focusCharId) : null;
  if (focusMonster) focusMonster = { ...focusMonster, actions: base.monsters.find((x) => x.id === focusMonster!.id)?.actions ?? [] };

  return {
    ...base,
    session,
    combat,
    combatants,
    current,
    log: (log ?? []) as LogRow[],
    focus: focus?.character ? { character: focus.character, library: focus.library, canEdit: focus.canEdit } : null,
    focusMonster,
  } as const;
}

export type SessionData = Exclude<Awaited<ReturnType<typeof getSessionData>>, { campaign: null }>;

/** "Goblin Warrior 2" → "Goblin 2", "Brakka Stonehew" → "Brakka". */
export function shortName(name: string) {
  const m = name.match(/^(\S+).*?\s(\d+)$/);
  return m ? `${m[1]} ${m[2]}` : name.split(" ")[0];
}

/** Highest initiative first; ties → higher DEX; not rolled yet → last. */
export function sortCombatants<T extends { initiative: number | null; dex_mod: number; name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    (b.initiative ?? -99) - (a.initiative ?? -99) || b.dex_mod - a.dex_mod || a.name.localeCompare(b.name));
}
