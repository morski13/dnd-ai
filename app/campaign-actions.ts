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
