"use server";
// Who the character sheet can aim at right now: the party (players' characters only, unless you're the DM),
// and, while a fight is running, everyone in it. Players see monsters' health ("bloodied"), never their HP,
// and creatures hidden on the battle map stay out of the list.
import { loadCharacter } from "@/lib/character-data";
import { healthOf } from "@/lib/moderator/hp";
import { isCampaignDm } from "@/lib/moderator/apply";
import { liveState } from "@/lib/roll-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { visibleParty, type AimChoice } from "@/lib/targets";

export async function aimChoices(characterId: string): Promise<{ inFight: boolean; choices: AimChoice[] } | { error: string }> {
  const { userId, character: c, canEdit } = await loadCharacter(characterId);
  if (!c || !canEdit || !userId) return { error: "You can only aim your own character's spells." };
  const admin = createAdminClient();
  const [{ combat }, viewerIsDm, { data: chars }, { data: members }] = await Promise.all([
    liveState(admin, c.campaign_id),
    isCampaignDm(admin, c.campaign_id, userId),
    admin.from("characters").select("id, name, owner_user_id, hp_current, hp_max, temp_hp").eq("campaign_id", c.campaign_id).order("name"),
    admin.from("campaign_members").select("user_id, role").eq("campaign_id", c.campaign_id),
  ]);
  const roles: Record<string, string> = Object.fromEntries((members ?? []).map((m) => [m.user_id as string, m.role as string]));
  type Row = { id: string; name: string; owner_user_id: string | null; hp_current: number | null; hp_max: number | null; temp_hp: number | null };
  const all = (chars ?? []) as Row[];
  const shown = new Map(visibleParty(all, roles, userId, viewerIsDm).map((r) => [r.id, r]));
  shown.set(c.id, all.find((r) => r.id === c.id) ?? { id: c.id, name: c.name, owner_user_id: userId, hp_current: c.hp_current ?? null, hp_max: c.hp_max ?? null, temp_hp: c.temp_hp ?? 0 });
  const friend = (r: Row): AimChoice => ({
    key: `c:${r.id}`, name: r.name, side: "party", me: r.id === c.id,
    hp: r.hp_current ?? r.hp_max, max: r.hp_max, temp: r.temp_hp ?? 0, health: healthOf(r.hp_current ?? r.hp_max, r.hp_max),
  });
  if (!combat) return { inFight: false, choices: [...shown.values()].map(friend) };

  // In a fight: everyone fighting (the DM put them there), plus the party
  const [{ data: rows }, { data: hid }] = await Promise.all([
    admin.from("combatants").select("character_id, monster_id, name, health, monsters(kind, hp_current, hp_max)").eq("combat_id", combat.id),
    admin.from("map_tokens").select("combatant_id, combatants(character_id, monster_id)").eq("combat_id", combat.id).eq("hidden", true),
  ]);
  const hidden = new Set((hid ?? []).map((h) => {
    const x = h.combatants as unknown as { character_id: string | null; monster_id: string | null } | null;
    return x?.monster_id ? `m:${x.monster_id}` : x?.character_id ? `c:${x.character_id}` : "";
  }));
  const out = new Map<string, AimChoice>();
  for (const r of shown.values()) out.set(`c:${r.id}`, friend(r));
  for (const r of rows ?? []) {
    if (r.character_id) {
      const ch = all.find((x) => x.id === r.character_id);
      if (ch && !out.has(`c:${ch.id}`) && (viewerIsDm || !hidden.has(`c:${ch.id}`))) out.set(`c:${ch.id}`, { ...friend(ch), inFight: true });
      const got = out.get(`c:${r.character_id}`);
      if (got) out.set(`c:${r.character_id}`, { ...got, inFight: true });
      continue;
    }
    if (!r.monster_id || (!viewerIsDm && hidden.has(`m:${r.monster_id}`))) continue;
    const m = r.monsters as unknown as { kind?: string; hp_current: number | null; hp_max: number | null } | null;
    const ally = m?.kind === "npc";
    out.set(`m:${r.monster_id}`, {
      key: `m:${r.monster_id}`, name: r.name, side: ally ? "party" : "enemy", inFight: true,
      // players learn how hurt a monster looks, not its HP
      hp: viewerIsDm ? m?.hp_current ?? m?.hp_max ?? null : null, max: viewerIsDm ? m?.hp_max ?? null : null, temp: 0,
      health: (r.health as AimChoice["health"]) ?? "unhurt",
    });
  }
  return { inFight: true, choices: [...out.values()] };
}
