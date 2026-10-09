"use server";
// Saving, picking and deleting your dice sets.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSkin, type DiceSkin } from "@/lib/dice3d/skin";

type Fail = { error: string };

async function me() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, userId: data?.claims?.sub as string | undefined };
}

/** Save a set (new when id is null). Also makes it the set you roll with. */
export async function saveSkin(id: string | null, input: DiceSkin): Promise<Fail | { id: string; skin: DiceSkin }> {
  const { supabase, userId } = await me();
  if (!userId) return { error: "Log in first." };
  const skin = sanitizeSkin(input);
  if (!skin) return { error: "Those dice are too big to save. Use smaller pictures." };

  let savedId = id;
  if (id) {
    const { data, error } = await supabase.from("dice_skins")
      .update({ name: skin.name, data: skin, updated_at: new Date().toISOString() })
      .eq("id", id).eq("user_id", userId).select("id").maybeSingle();
    if (error || !data) return { error: "Couldn't save. " + (error?.message ?? "Set not found.") };
  } else {
    const { data, error } = await supabase.from("dice_skins")
      .insert({ user_id: userId, name: skin.name, data: skin }).select("id").single();
    if (error || !data) return { error: error?.message.includes("12 dice sets") ? "You can keep up to 12 dice sets. Delete one first." : "Couldn't save. " + (error?.message ?? "") };
    savedId = data.id;
  }
  const act = await activateSkin(savedId!);
  if ("error" in act) return act;
  return { id: savedId!, skin };
}

/** Roll with this set from now on. */
export async function activateSkin(id: string): Promise<Fail | { ok: true }> {
  const { supabase, userId } = await me();
  if (!userId) return { error: "Log in first." };
  await supabase.from("dice_skins").update({ is_active: false }).eq("user_id", userId).eq("is_active", true);
  const { error } = await supabase.from("dice_skins").update({ is_active: true }).eq("id", id).eq("user_id", userId);
  if (error) return { error: "Couldn't pick that set. " + error.message };
  revalidatePath("/dice");
  return { ok: true };
}

export async function deleteSkin(id: string): Promise<Fail | { ok: true }> {
  const { supabase, userId } = await me();
  if (!userId) return { error: "Log in first." };
  const { error } = await supabase.from("dice_skins").delete().eq("id", id).eq("user_id", userId);
  if (error) return { error: "Couldn't delete. " + error.message };
  revalidatePath("/dice");
  return { ok: true };
}
