// DM uploads a picture (already shrunk in the browser): a new picture, a cover for a document,
// or a picture placed inside a document. Stored in the private "vault" bucket.
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const TYPES = new Set(["image/webp", "image/png", "image/jpeg"]);
const MAX = 6 * 1024 * 1024;
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return fail("Log in first.", 401);

  let form: FormData;
  try { form = await req.formData(); } catch { return fail("Couldn't read the upload."); }
  const file = form.get("file");
  const thumb = form.get("thumb");
  const folderId = String(form.get("folderId") ?? "");
  const coverFor = String(form.get("coverFor") ?? "") || null;   // set as a document's cover
  const parentId = String(form.get("parentId") ?? "") || null;   // picture inside a document
  const title = String(form.get("title") ?? "").trim().slice(0, 120) || "Picture";
  const w = Number(form.get("w")) || null;
  const h = Number(form.get("h")) || null;
  if (!(file instanceof Blob) || !TYPES.has(file.type)) return fail("Use a PNG, JPG or WEBP picture.");
  if (file.size > MAX || (thumb instanceof Blob && thumb.size > MAX)) return fail("That picture is too big (6 MB max).");

  // Only the DM of this campaign (the folder check goes through the database's own rules)
  const { data: folder } = await supabase.from("vault_folders").select("id, campaign_id").eq("id", folderId).maybeSingle();
  if (!folder) return fail("Folder not found.", 404);
  const { data: member } = await supabase.from("campaign_members").select("role").eq("campaign_id", folder.campaign_id).eq("user_id", userId).maybeSingle();
  if (member?.role !== "dm" && member?.role !== "co_dm") return fail("Only the DM can add pictures.", 403);

  const admin = createAdminClient();
  const ext = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : "webp";
  const put = async (path: string, blob: Blob) => {
    const { error } = await admin.storage.from("vault").upload(path, Buffer.from(await blob.arrayBuffer()), { contentType: blob.type, upsert: true });
    if (error) throw new Error(error.message);
  };

  try {
    if (coverFor) {
      const { data: e } = await supabase.from("vault_entries").select("id, image_path, thumb_path").eq("id", coverFor).eq("campaign_id", folder.campaign_id).maybeSingle();
      if (!e) return fail("Document not found.", 404);
      const stamp = Date.now();
      const path = `${folder.campaign_id}/${e.id}-cover-${stamp}.${ext}`;
      const tpath = thumb instanceof Blob ? `${folder.campaign_id}/${e.id}-cover-${stamp}-thumb.webp` : null;
      await put(path, file);
      if (tpath && thumb instanceof Blob) await put(tpath, thumb);
      await supabase.from("vault_entries").update({ image_path: path, thumb_path: tpath, image_w: w, image_h: h, updated_at: new Date().toISOString() }).eq("id", e.id);
      const old = [e.image_path, e.thumb_path].filter((x): x is string => !!x);
      if (old.length) await admin.storage.from("vault").remove(old);
      return NextResponse.json({ id: e.id });
    }

    const { data: e, error } = await supabase.from("vault_entries").insert({
      campaign_id: folder.campaign_id, folder_id: folder.id, parent_id: parentId, kind: "image", title, image_w: w, image_h: h,
    }).select("id").single();
    if (error || !e) return fail("Couldn't save the picture. " + (error?.message ?? ""));
    const path = `${folder.campaign_id}/${e.id}.${ext}`;
    const tpath = thumb instanceof Blob ? `${folder.campaign_id}/${e.id}-thumb.webp` : null;
    try {
      await put(path, file);
      if (tpath && thumb instanceof Blob) await put(tpath, thumb);
    } catch (err) {
      await supabase.from("vault_entries").delete().eq("id", e.id);
      throw err;
    }
    await supabase.from("vault_entries").update({ image_path: path, thumb_path: tpath }).eq("id", e.id);
    return NextResponse.json({ id: e.id });
  } catch (err) {
    return fail("Upload failed: " + (err as Error).message, 500);
  }
}
