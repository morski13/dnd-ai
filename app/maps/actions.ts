"use server";
// The DM's battle maps: a plain grid, changing a map's grid or name, deleting one.
import { revalidatePath } from "next/cache";
import { cleanFit, plainGrid, type GridFit } from "@/lib/maps/grid";
import { who } from "@/lib/maps/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Fail = { error: string };
const hint = (m?: string) => (/battle_maps/.test(m ?? "") ? "Run supabase/23-battle-maps.sql in Supabase first." : m ?? "Something went wrong.");

export async function createPlainMap(name: string, cols: number, rows: number): Promise<Fail | { id: string }> {
  const me = await who();
  if (!me.campaignId || !me.isDm) return { error: "Only the DM can make battle maps." };
  const c = Math.round(cols), r = Math.round(rows);
  if (!(c >= 2 && c <= 100 && r >= 2 && r <= 100)) return { error: "A map is 2 to 100 squares each way." };
  const fit = plainGrid(c, r);
  const { data, error } = await me.supabase.from("battle_maps").insert({ campaign_id: me.campaignId, name: name.trim().slice(0, 80) || "Plain grid", cols: c, rows: r, crop: fit.crop }).select("id").single();
  if (error || !data) return { error: hint(error?.message) };
  revalidatePath("/maps");
  return { id: data.id };
}

export async function updateMap(mapId: string, change: { name?: string; fit?: GridFit; feet?: number }): Promise<Fail | void> {
  const me = await who();
  if (!me.campaignId || !me.isDm) return { error: "Only the DM can change battle maps." };
  const { data: m } = await me.supabase.from("battle_maps").select("id, image_w, image_h, cols, rows").eq("id", mapId).eq("campaign_id", me.campaignId).maybeSingle();
  if (!m) return { error: "Map not found." };
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (change.name !== undefined) patch.name = change.name.trim().slice(0, 80) || "Battle map";
  if (change.feet !== undefined) patch.feet = Math.max(1, Math.min(100, Math.round(change.feet)));
  if (change.fit) {
    let fit: GridFit;
    try { fit = m.image_w ? cleanFit(change.fit, m.image_w, m.image_h!) : plainGrid(Math.round(change.fit.cols), Math.round(change.fit.rows)); }
    catch { return { error: "The grid settings aren't valid." }; }
    if (!(fit.cols >= 2 && fit.cols <= 100 && fit.rows >= 2 && fit.rows <= 100)) return { error: "A map is 2 to 100 squares each way." };
    Object.assign(patch, { cols: fit.cols, rows: fit.rows, crop: fit.crop, stretch: fit.stretch });
  }
  const { error } = await me.supabase.from("battle_maps").update(patch).eq("id", mapId);
  if (error) return { error: hint(error.message) };
  // tokens that would now be off the map come back inside it
  if (change.fit) {
    const admin = createAdminClient();
    const { data: fights } = await admin.from("combats").select("id").eq("map_id", mapId).is("ended_at", null);
    for (const f of fights ?? []) {
      const { data: toks } = await admin.from("map_tokens").select("id, x, y, size").eq("combat_id", f.id);
      for (const t of toks ?? []) {
        const x = Math.min(t.x, Number(patch.cols) - t.size), y = Math.min(t.y, Number(patch.rows) - t.size);
        if (x !== t.x || y !== t.y) await admin.from("map_tokens").update({ x: Math.max(0, x), y: Math.max(0, y) }).eq("id", t.id);
      }
    }
  }
  revalidatePath("/maps");
}

export async function deleteMap(mapId: string): Promise<Fail | void> {
  const me = await who();
  if (!me.campaignId || !me.isDm) return { error: "Only the DM can delete battle maps." };
  const { data: m } = await me.supabase.from("battle_maps").select("id, image_path").eq("id", mapId).eq("campaign_id", me.campaignId).maybeSingle();
  if (!m) return { error: "Map not found." };
  const { error } = await me.supabase.from("battle_maps").delete().eq("id", mapId);
  if (error) return { error: hint(error.message) };
  if (m.image_path) await createAdminClient().storage.from("vault").remove([m.image_path]).then(() => undefined, () => undefined);
  revalidatePath("/maps");
}
