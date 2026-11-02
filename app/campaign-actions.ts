"use server";
import { refresh } from "next/cache";
// Joining a campaign and claiming characters.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string | null };

export async function joinCampaign(_prev: ActionState, formData: FormData): Promise<ActionState> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Enter the invite code from your DM." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("join_campaign", { p_code: code });
  if (error) {
    return {
      error: error.message.includes("No campaign")
        ? "That code doesn't match any campaign. Check it with your DM."
        : error.message,
    };
  }
  redirect("/");
}

export async function claimCharacter(_prev: ActionState, formData: FormData): Promise<ActionState> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const id = String(formData.get("characterId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("claim_character", { p_character_id: id });
  if (error) return { error: error.message };
  redirect("/characters");
}

// ------------------------------------------------------------------ your campaigns
type Fail = { error: string };

/** Open another of your campaigns: every screen follows it. */
export async function switchCampaign(campaignId: string): Promise<Fail | void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_active_campaign", { p_campaign: campaignId });
  if (error) return { error: error.message };
  redirect("/");
}

/** Start a new campaign. You become its DM, and it opens right away. */
export async function createCampaign(_prev: ActionState, formData: FormData): Promise<ActionState> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give your campaign a name." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_campaign", {
    p_name: name, p_rule_set: String(formData.get("rules") ?? "2024"), p_home_base: String(formData.get("home") ?? ""),
  });
  if (error) return { error: error.message };
  redirect("/");
}

export async function leaveCampaign(campaignId: string): Promise<Fail | void> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_campaign", { p_campaign: campaignId });
  if (error) return { error: error.message };
  redirect("/campaigns");
}

export async function newInviteCode(campaignId: string): Promise<Fail | { code: string }> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("new_invite_code", { p_campaign: campaignId });
  if (error) return { error: error.message };
  return { code: data as string };
}

/**
 * DM: "the party levels up". Sets the party level and tells every player: their Home and sheet show
 * "Level up to N" (with their saved plan filled in) until their character reaches it.
 */
export async function partyLevelUp(campaignId: string, to: number): Promise<Fail | { to: number }> {
  refresh(); // other screens show this change at once, not after the 30 s client cache
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return { error: "Log in first." };
  const { data: me } = await supabase.from("campaign_members").select("role").eq("campaign_id", campaignId).eq("user_id", userId).maybeSingle();
  if (me?.role !== "dm" && me?.role !== "co_dm") return { error: "Only the DM can level up the party." };
  const level = Math.max(1, Math.min(20, Math.floor(Number(to)) || 1));
  const { data: camp } = await supabase.from("campaigns").select("settings").eq("id", campaignId).maybeSingle();
  const settings = (camp?.settings ?? {}) as Record<string, unknown>;
  const { error } = await supabase.from("campaigns")
    .update({ settings: { ...settings, party_level: level, level_up: { to: level, at: new Date().toISOString() } } }).eq("id", campaignId);
  if (error) return { error: error.message };
  return { to: level };
}
