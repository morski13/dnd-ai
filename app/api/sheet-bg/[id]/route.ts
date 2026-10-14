// A character sheet's own background picture. Stored in the private "vault" bucket under sheets/<character id>/.
// POST: the owner (or DM) uploads one (already shrunk in the browser). GET: anyone who may see the character.
import { NextResponse, type NextRequest } from "next/server";
import { loadCharacter } from "@/lib/character-data";
import { createAdminClient } from "@/lib/supabase/admin";

const TYPES = new Set(["image/webp", "image/png", "image/jpeg"]);
const MAX = 6 * 1024 * 1024;
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const pathOf = (id: string, stamp: number) => `sheets/${id}/bg-${stamp}.webp`;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return fail("Not found.", 404);
  const { userId, character, canEdit } = await loadCharacter(id);
  if (!userId) return fail("Log in first.", 401);
  if (!character || !canEdit) return fail("You can only change your own sheet.", 403);
  let form: FormData;
  try { form = await req.formData(); } catch { return fail("Couldn't read the upload."); }
  const file = form.get("file");
  if (!(file instanceof Blob) || !TYPES.has(file.type)) return fail("Use a PNG, JPG or WEBP picture.");
  if (file.size > MAX) return fail("That picture is too big (6 MB max).");
  const stamp = Date.now();
  const { error } = await createAdminClient().storage.from("vault")
    .upload(pathOf(id, stamp), Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: true });
  if (error) return fail("Upload failed: " + error.message, 500);
  return NextResponse.json({ image: stamp }); // shown as a preview; kept once the look is saved
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const stamp = Number(req.nextUrl.searchParams.get("v"));
  if (!/^[0-9a-f-]{36}$/.test(id) || !Number.isInteger(stamp) || stamp <= 0) return new Response("Not found", { status: 404 });
  const { character } = await loadCharacter(id); // the database's rules decide who may see this character
  if (!character) return new Response("Not found", { status: 404 });
  const { data, error } = await createAdminClient().storage.from("vault").download(pathOf(id, stamp));
  if (error || !data) return new Response("Not found", { status: 404 });
  return new Response(data, { headers: { "content-type": data.type || "image/webp", "cache-control": "private, max-age=86400, immutable" } });
}
