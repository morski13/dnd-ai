// Loads the characters in your campaign, as the logged-in user.
import { toConfirm } from "./sheet-confirm";
import { charactersOnList } from "./character-visibility";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type ClassLevel = { class: string; subclass?: string; level: number };

export type CharacterCard = {
  id: string;
  name: string;
  species: string | null;
  classLevels: ClassLevel[];
  hpMax: number | null;
  ac: number | null;
  speed: number | null;
  playerName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  /** numbers from the paper sheet still to confirm ("2 to confirm") */
  toConfirm: number;
};

export async function getCharactersData() {
  await connection(); // depends on who is logged in
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: membership } = await supabase
    .from("campaign_members")
    .select("role, campaign_id")
    .eq("user_id", userId)
    .order("last_active_at", { ascending: false, nullsFirst: false }).order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) return { userId, isDm: false, characters: [] as CharacterCard[], inCampaign: false };

  const { data: rows } = await supabase
    .from("characters")
    .select("id, name, species, class_levels, hp_max, ac, speed, sheet_values, player_name, owner_user_id, owner:profiles(display_name)")
    .eq("campaign_id", membership.campaign_id)
    .order("name");

  const characters: CharacterCard[] = (rows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    species: r.species,
    classLevels: (r.class_levels ?? []) as ClassLevel[],
    hpMax: r.hp_max,
    ac: r.ac,
    speed: r.speed,
    playerName: r.player_name,
    ownerId: r.owner_user_id,
    ownerName: (r.owner as unknown as { display_name: string } | null)?.display_name ?? null,
    toConfirm: toConfirm({ ac: r.ac, speed: r.speed, hp_max: r.hp_max, sheet_values: r.sheet_values as Record<string, number> | null }).length,
  }));

  // players only get their own characters (and ones the DM made for them to claim) sent to the browser
  const isDm = membership.role === "dm" || membership.role === "co_dm";
  return {
    userId,
    isDm,
    characters: charactersOnList(characters, userId, isDm).all,
    inCampaign: true,
  };
}
