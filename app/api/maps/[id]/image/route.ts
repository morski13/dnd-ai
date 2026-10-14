// A battle map picture: for the DM, and for players while the map is in a running fight (database rules decide).
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const { data: m } = await supabase.from("battle_maps").select("image_path").eq("id", id).maybeSingle();
  if (!m?.image_path) return new Response("Not found", { status: 404 });
  const { data, error } = await createAdminClient().storage.from("vault").download(m.image_path);
  if (error || !data) return new Response("Not found", { status: 404 });
  return new Response(data, { headers: { "content-type": data.type || "image/webp", "cache-control": "private, max-age=86400" } });
}
