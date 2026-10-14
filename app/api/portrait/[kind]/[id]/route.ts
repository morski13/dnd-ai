// Token pictures: a character's (its owner or the DM uploads) or a monster's (the DM uploads).
// Anyone who may see that character / monster may see the picture.
import { NextResponse, type NextRequest } from "next/server";
import { loadCharacter } from "@/lib/character-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const TYPES = new Set(["image/webp", "image/png", "image/jpeg"]);
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const pathOf = (kind: string, id: string, stamp: number) => `portraits/${kind}/${id}-${stamp}.webp`;
type Ctx = { params: Promise<{ kind: string; id: string }> };

async function allowed(kind: string, id: string, write: boolean) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return false;
  if (kind === "character") {
    const { character, canEdit } = await loadCharacter(id);
    return !!character && (!write || canEdit);
  }
  if (kind === "monster") {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getClaims();
    const { data: m } = await createAdminClient().from("monsters").select("campaign_id").eq("id", id).maybeSingle();
    if (!m || !auth?.claims?.sub) return false;
    const { data: mem } = await supabase.from("campaign_members").select("role").eq("campaign_id", m.campaign_id).eq("user_id", auth.claims.sub).maybeSingle();
    return !!mem && (!write || mem.role === "dm" || mem.role === "co_dm");
  }
  return false;
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { kind, id } = await params;
  if (!(await allowed(kind, id, true))) return fail("You can't change that picture.", 403);
  let form: FormData;
  try { form = await req.formData(); } catch { return fail("Couldn't read the upload."); }
  const file = form.get("file");
  if (!(file instanceof Blob) || !TYPES.has(file.type)) return fail("Use a PNG, JPG or WEBP picture.");
  if (file.size > 3 * 1024 * 1024) return fail("That picture is too big (3 MB max).");
  const stamp = Date.now();
  const admin = createAdminClient();
  const { error } = await admin.storage.from("vault").upload(pathOf(kind, id, stamp), Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: true });
  if (error) return fail("Upload failed: " + error.message, 500);
  const table = kind === "character" ? "characters" : "monsters";
  const { data: old } = await admin.from(table).select("portrait").eq("id", id).maybeSingle();
  const { error: e2 } = await admin.from(table).update({ portrait: stamp }).eq("id", id);
  if (e2) return fail(/portrait/.test(e2.message) ? "Run supabase/23-battle-maps.sql in Supabase first." : e2.message, 500);
  if (old?.portrait) await admin.storage.from("vault").remove([pathOf(kind, id, Number(old.portrait))]).then(() => undefined, () => undefined);
  return NextResponse.json({ portrait: stamp });
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { kind, id } = await params;
  const stamp = Number(req.nextUrl.searchParams.get("v"));
  if (!Number.isInteger(stamp) || stamp <= 0 || !(await allowed(kind, id, false))) return new Response("Not found", { status: 404 });
  const { data, error } = await createAdminClient().storage.from("vault").download(pathOf(kind, id, stamp));
  if (error || !data) return new Response("Not found", { status: 404 });
  return new Response(data, { headers: { "content-type": data.type || "image/webp", "cache-control": "private, max-age=86400, immutable" } });
}
