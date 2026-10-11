// Shows a campaign picture, only to people allowed to see it (the DM, or players once it's shared).
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  // The database's rules decide: no row = not allowed to see it.
  const { data: e } = await supabase.from("vault_entries").select("image_path, thumb_path, updated_at").eq("id", id).maybeSingle();
  const wantThumb = req.nextUrl.searchParams.get("size") === "thumb";
  const path = (wantThumb && e?.thumb_path) || e?.image_path;
  if (!path) return new Response("Not found", { status: 404 });

  const { data, error } = await createAdminClient().storage.from("vault").download(path);
  if (error || !data) return new Response("Not found", { status: 404 });
  return new Response(data, {
    headers: {
      "content-type": data.type || "image/webp",
      "cache-control": "private, max-age=3600",
      "content-disposition": "inline",
    },
  });
}
