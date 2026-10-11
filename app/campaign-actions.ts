"use server";
// Joining a campaign and claiming characters.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string | null };

export async function joinCampaign(_prev: ActionState, formData: FormData): Promise<ActionState> {
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
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_campaign", { p_campaign: campaignId });
  if (error) return { error: error.message };
  redirect("/campaigns");
}

export async function newInviteCode(campaignId: string): Promise<Fail | { code: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("new_invite_code", { p_campaign: campaignId });
  if (error) return { error: error.message };
  return { code: data as string };
}
