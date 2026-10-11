// Loads the Campaign page (folders, entries, documents) as the logged-in user.
// The database decides what players may see: only shared entries, and only the secret-free copy.
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { FOLDERS, folderDef } from "@/lib/vault/folders";
import type { DocNode } from "@/lib/vault/doc";
import { listShops, type ShopSummary } from "@/lib/items-data";

export type VaultFolder = { id: string; kind: string; name: string; sort: number; count: number; images: number; shared: number; updatedAt: string | null; covers: string[]; sharedCovers: string[] };
export type VaultEntry = {
  id: string; folderId: string; kind: "doc" | "image"; title: string; shared: boolean; status: string | null;
  hasImage: boolean; imageW: number | null; imageH: number | null; snippet: string; updatedAt: string; parentId: string | null;
};

export async function vaultContext() {
  await connection();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect("/login");
  const { data: m } = await supabase.from("campaign_members").select("role, campaigns(id, name)")
    .eq("user_id", userId).order("last_active_at", { ascending: false, nullsFirst: false }).order("joined_at", { ascending: true }).limit(1).maybeSingle();
  const campaign = m?.campaigns as unknown as { id: string; name: string } | null;
  return { supabase, userId, campaign, isDm: m?.role === "dm" || m?.role === "co_dm" };
}

const ENTRY_COLS = "id, folder_id, parent_id, kind, title, shared, status, image_path, image_w, image_h, public_text, updated_at";
type Row = { id: string; folder_id: string; parent_id: string | null; kind: "doc" | "image"; title: string; shared: boolean; status: string | null; image_path: string | null; image_w: number | null; image_h: number | null; public_text: string | null; updated_at: string };
const toEntry = (r: Row, text?: string | null): VaultEntry => ({
  id: r.id, folderId: r.folder_id, kind: r.kind, title: r.title, shared: r.shared, status: r.status, parentId: r.parent_id,
  hasImage: !!r.image_path, imageW: r.image_w, imageH: r.image_h, updatedAt: r.updated_at,
  snippet: (text ?? r.public_text ?? "").split("\n").slice(1).filter(Boolean).join(" · ").replace(/\s+/g, " ").slice(0, 160),
});

/** The folder overview. The DM's standard folders are created the first time. */
export async function getVault(q?: string) {
  const ctx = await vaultContext();
  const { supabase, campaign, isDm } = ctx;
  if (!campaign) return { ...ctx, folders: [] as VaultFolder[], results: null as VaultEntry[] | null };

  if (isDm) {
    const { data: existing } = await supabase.from("vault_folders").select("kind").eq("campaign_id", campaign.id);
    const have = new Set((existing ?? []).map((f) => f.kind));
    const missing = FOLDERS.filter((f) => !have.has(f.kind)).map((f) => ({ campaign_id: campaign.id, kind: f.kind, name: f.name, sort: FOLDERS.indexOf(f) }));
    if (missing.length) await supabase.from("vault_folders").insert(missing);
  }

  const [{ data: folders }, { data: entries }] = await Promise.all([
    supabase.from("vault_folders").select("id, kind, name, sort").eq("campaign_id", campaign.id).order("sort").order("created_at"),
    supabase.from("vault_entries").select("id, folder_id, kind, image_path, updated_at, parent_id, shared").eq("campaign_id", campaign.id).is("parent_id", null),
  ]);
  const byFolder = new Map<string, { n: number; img: number; sh: number; at: string | null; covers: string[]; shCovers: string[] }>();
  for (const e of entries ?? []) {
    const f = byFolder.get(e.folder_id) ?? { n: 0, img: 0, sh: 0, at: null, covers: [], shCovers: [] };
    f.n++;
    if (e.shared) f.sh++;
    if (e.image_path) { f.img++; if (f.covers.length < 3) f.covers.push(e.id); if (e.shared && f.shCovers.length < 3) f.shCovers.push(e.id); }
    if (!f.at || e.updated_at > f.at) f.at = e.updated_at;
    byFolder.set(e.folder_id, f);
  }
  const list: VaultFolder[] = (folders ?? []).map((f) => {
    const s = byFolder.get(f.id);
    return { id: f.id, kind: f.kind, name: f.name, sort: f.sort, count: s?.n ?? 0, images: s?.img ?? 0, shared: s?.sh ?? 0, updatedAt: s?.at ?? null, covers: s?.covers ?? [], sharedCovers: s?.shCovers ?? [] };
  });

  // Search: titles and text (players only search what was shared, without secrets)
  let results: VaultEntry[] | null = null;
  const term = q?.trim();
  if (term) {
    const like = `%${term.replace(/[%_,()]/g, " ")}%`;
    const { data: hits } = await supabase.from("vault_entries").select(ENTRY_COLS).eq("campaign_id", campaign.id)
      .or(`title.ilike.${like},public_text.ilike.${like}`).order("updated_at", { ascending: false }).limit(40);
    let rows = (hits ?? []) as Row[];
    if (isDm) {
      // the DM also finds words inside secret blocks
      const { data: docHits } = await supabase.from("vault_docs").select("entry_id").eq("campaign_id", campaign.id).ilike("text", like).limit(40);
      const extra = (docHits ?? []).map((d) => d.entry_id).filter((id) => !rows.some((r) => r.id === id));
      if (extra.length) {
        const { data: more } = await supabase.from("vault_entries").select(ENTRY_COLS).in("id", extra);
        rows = [...rows, ...((more ?? []) as Row[])];
      }
    }
    results = rows.map((r) => toEntry(r));
  }
  return { ...ctx, folders: list, results };
}

export async function getFolder(folderId: string) {
  const ctx = await vaultContext();
  const { supabase, campaign } = ctx;
  if (!campaign) return { ...ctx, folder: null, entries: [] as VaultEntry[], fights: [], shops: [] as ShopSummary[] };
  const { data: folder } = await supabase.from("vault_folders").select("id, kind, name").eq("id", folderId).eq("campaign_id", campaign.id).maybeSingle();
  if (!folder) return { ...ctx, folder: null, entries: [] as VaultEntry[], fights: [], shops: [] as ShopSummary[] };
  const { data: rows } = await supabase.from("vault_entries").select(ENTRY_COLS).eq("folder_id", folder.id).is("parent_id", null)
    .order("sort").order("updated_at", { ascending: false });
  let fights: { id: string; name: string; tier: string | null }[] = [];
  if (folder.kind === "fights" && ctx.isDm) {
    const { data: enc } = await supabase.from("encounters").select("id, name, summary").eq("campaign_id", campaign.id).order("updated_at", { ascending: false });
    fights = (enc ?? []).map((e) => ({ id: e.id as string, name: e.name as string, tier: (e.summary as { tier?: string } | null)?.tier ?? null }));
  }
  // the Shops folder lists the real shops too (players only get the open ones)
  const shops = folder.kind === "shops" ? await listShops(supabase, campaign.id) : [];
  return { ...ctx, folder: { ...folder, def: folderDef(folder.kind) }, entries: ((rows ?? []) as Row[]).map((r) => toEntry(r)), fights, shops };
}

export async function getEntry(entryId: string) {
  const ctx = await vaultContext();
  const { supabase, campaign, isDm } = ctx;
  if (!campaign) return { ...ctx, entry: null };
  const { data: row } = await supabase.from("vault_entries").select(`${ENTRY_COLS}, public_doc, vault_folders(id, kind, name)`)
    .eq("id", entryId).eq("campaign_id", campaign.id).maybeSingle();
  if (!row) return { ...ctx, entry: null };
  let doc: DocNode | null = (row.public_doc as DocNode | null) ?? null;
  if (isDm && row.kind === "doc") {
    const { data: full } = await supabase.from("vault_docs").select("doc").eq("entry_id", row.id).maybeSingle();
    doc = (full?.doc as DocNode | null) ?? doc;
  }
  const { data: folders } = isDm
    ? await supabase.from("vault_folders").select("id, name").eq("campaign_id", campaign.id).order("sort")
    : { data: [] as { id: string; name: string }[] };
  const folder = row.vault_folders as unknown as { id: string; kind: string; name: string };
  return {
    ...ctx,
    entry: { ...toEntry(row as Row), doc, publicDoc: (row.public_doc as DocNode | null) ?? null, folder },
    folders: folders ?? [],
  };
}
