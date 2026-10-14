// DM uploads a battle map picture (already shrunk in the browser) with its grid. Stored in the private "vault" bucket.
import { NextResponse, type NextRequest } from "next/server";
import { cleanFit } from "@/lib/maps/grid";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const TYPES = new Set(["image/webp", "image/png", "image/jpeg"]);
const MAX = 8 * 1024 * 1024;
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return fail("Log in first.", 401);
  const { data: m } = await supabase.from("campaign_members").select("campaign_id, role").eq("user_id", userId)
    .order("last_active_at", { ascending: false, nullsFirst: false }).order("joined_at", { ascending: true }).limit(1).maybeSingle();
  if (!m || (m.role !== "dm" && m.role !== "co_dm")) return fail("Only the DM can add battle maps.", 403);

  let form: FormData;
  try { form = await req.formData(); } catch { return fail("Couldn't read the upload."); }
  const file = form.get("file");
  if (!(file instanceof Blob) || !TYPES.has(file.type)) return fail("Use a PNG, JPG or WEBP picture.");
  if (file.size > MAX) return fail("That picture is too big (8 MB max).");
  const w = Math.round(Number(form.get("w"))), h = Math.round(Number(form.get("h")));
  if (!(w > 0 && h > 0)) return fail("Missing the picture's size.");
  let fit;
  try { fit = cleanFit(JSON.parse(String(form.get("fit") ?? "{}")), w, h); } catch { return fail("The grid settings aren't valid."); }
  const name = String(form.get("name") ?? "").trim().slice(0, 80) || "Battle map";
  const feet = Math.max(1, Math.min(100, Math.round(Number(form.get("feet")) || 5)));

  const { data: row, error } = await supabase.from("battle_maps").insert({
    campaign_id: m.campaign_id, name, image_w: w, image_h: h, cols: fit.cols, rows: fit.rows, crop: fit.crop, stretch: fit.stretch, feet,
  }).select("id").single();
  if (error || !row) return fail(/battle_maps/.test(error?.message ?? "") ? "Run supabase/23-battle-maps.sql in Supabase first." : "Couldn't save the map. " + (error?.message ?? ""), 500);
  const path = `maps/${m.campaign_id}/${row.id}.webp`;
  const admin = createAdminClient();
  const { error: upErr } = await admin.storage.from("vault").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: true });
  if (upErr) { await supabase.from("battle_maps").delete().eq("id", row.id); return fail("Upload failed: " + upErr.message, 500); }
  await supabase.from("battle_maps").update({ image_path: path }).eq("id", row.id);
  return NextResponse.json({ id: row.id });
}
