"use server";
// Campaign page: documents, folders, sharing. Only the DM writes (the database checks too).
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanDoc, doc as docOf, docText, field, h, p, secret, stripSecrets, ul, type DocNode } from "@/lib/vault/doc";
import { folderDef } from "@/lib/vault/folders";
import { vaultContext } from "@/lib/vault-data";

type Fail = { error: string };

async function dm() {
  const ctx = await vaultContext();
  if (!ctx.campaign || !ctx.isDm) return null;
  return ctx as typeof ctx & { campaign: { id: string; name: string } };
}

/** The two copies of a document: full (DM) and without secrets (players). */
function copies(doc: DocNode) {
  const pub = stripSecrets(doc);
  return { doc, text: docText(doc), publicDoc: pub, publicText: docText(pub) };
}

export async function createDoc(folderId: string, title?: string): Promise<Fail | { id: string }> {
  const c = await dm();
  if (!c) return { error: "Only the DM can add documents." };
  const { data: folder } = await c.supabase.from("vault_folders").select("id, kind").eq("id", folderId).eq("campaign_id", c.campaign.id).maybeSingle();
  if (!folder) return { error: "Folder not found." };
  const def = folderDef(folder.kind);
  const name = (title ?? "").trim().slice(0, 120) || def.newDocLabel.replace(/^New /, "New ");
  const x = copies(def.template(name));
  const { data: e, error } = await c.supabase.from("vault_entries").insert({
    campaign_id: c.campaign.id, folder_id: folder.id, kind: "doc", title: name,
    public_doc: x.publicDoc, public_text: x.publicText, status: folder.kind === "goals" ? "open" : null,
  }).select("id").single();
  if (error || !e) return { error: "Couldn't create it. " + (error?.message ?? "") };
  await c.supabase.from("vault_docs").insert({ entry_id: e.id, campaign_id: c.campaign.id, doc: x.doc, text: x.text });
  revalidatePath("/campaign");
  return { id: e.id };
}

/** Makes a page for a name the mind map found in the notes ("No page yet → Make an NPC page"). */
export async function createDocIn(kind: string, title: string): Promise<Fail | { id: string }> {
  const c = await dm();
  if (!c) return { error: "Only the DM can add documents." };
  const k = ["npcs", "places", "factions", "lore", "goals", "plans"].includes(kind) ? kind : "lore";
  let { data: folder } = await c.supabase.from("vault_folders").select("id").eq("campaign_id", c.campaign.id).eq("kind", k).maybeSingle();
  if (!folder) {
    const def = folderDef(k);
    ({ data: folder } = await c.supabase.from("vault_folders").insert({ campaign_id: c.campaign.id, kind: k, name: def.name }).select("id").single());
  }
  if (!folder) return { error: "Couldn't find the folder." };
  return createDoc(folder.id, title);
}

/** Player characters folder: a page for every character that doesn't have one yet (player, class and species filled in). */
export async function createPartyPages(folderId: string): Promise<Fail | { made: number }> {
  const c = await dm();
  if (!c) return { error: "Only the DM can add documents." };
  const [{ data: folder }, { data: chars }, { data: pages }] = await Promise.all([
    c.supabase.from("vault_folders").select("id").eq("id", folderId).eq("campaign_id", c.campaign.id).eq("kind", "party").maybeSingle(),
    c.supabase.from("characters").select("name, player_name, species, class_levels, owner_user_id, profiles:owner_user_id(display_name)").eq("campaign_id", c.campaign.id).order("name"),
    c.supabase.from("vault_entries").select("title").eq("folder_id", folderId),
  ]);
  if (!folder) return { error: "Folder not found." };
  const titles = (pages ?? []).map((x) => ` ${x.title.toLowerCase()} `);
  let made = 0;
  for (const ch of (chars ?? []) as unknown as { name: string; player_name: string | null; species: string | null; class_levels: { class: string; subclass?: string; level: number }[] | null; profiles: { display_name: string } | null }[]) {
    const first = ch.name.split(" ")[0].toLowerCase();
    if (titles.some((t) => t.includes(` ${ch.name.toLowerCase()} `) || t.includes(` ${first} `))) continue;
    const cls = (ch.class_levels ?? []).map((k) => `${k.class}${k.subclass ? ` (${k.subclass})` : ""} ${k.level}`).join(" / ");
    const d = docOf(h(1, ch.name), field("Player", ch.profiles?.display_name ?? ch.player_name ?? ""), field("Class & species", [cls, ch.species].filter(Boolean).join(", ")),
      h(2, "Backstory"), p(""), h(2, "Family & friends"), ul(""), h(2, "Goals & bonds"), ul(""), secret(h(3, "DM notes & hooks"), p("")));
    const x = copies(d);
    const { data: e } = await c.supabase.from("vault_entries").insert({
      campaign_id: c.campaign.id, folder_id: folderId, kind: "doc", title: ch.name, public_doc: x.publicDoc, public_text: x.publicText,
    }).select("id").single();
    if (!e) continue;
    await c.supabase.from("vault_docs").insert({ entry_id: e.id, campaign_id: c.campaign.id, doc: x.doc, text: x.text });
    made++;
  }
  revalidatePath("/campaign");
  return { made };
}

export async function saveDoc(entryId: string, title: string, json: string): Promise<Fail | { savedAt: string }> {
  const c = await dm();
  if (!c) return { error: "Only the DM can edit documents." };
  if (typeof json !== "string" || json.length > 600_000) return { error: "That document is too big to save." };
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return { error: "Couldn't read the document." }; }
  const doc = cleanDoc(raw);
  if (!doc) return { error: "That document is too big to save." };
  const x = copies(doc);
  const now = new Date().toISOString();
  const name = title.trim().slice(0, 120) || "Untitled";
  const { data: e, error } = await c.supabase.from("vault_entries")
    .update({ title: name, public_doc: x.publicDoc, public_text: x.publicText, updated_at: now })
    .eq("id", entryId).eq("campaign_id", c.campaign.id).select("id").maybeSingle();
  if (error || !e) return { error: "Couldn't save. " + (error?.message ?? "Not found.") };
  await c.supabase.from("vault_docs").upsert({ entry_id: entryId, campaign_id: c.campaign.id, doc: x.doc, text: x.text, updated_at: now });
  return { savedAt: now };
}

export async function setShared(entryId: string, shared: boolean): Promise<Fail | void> {
  const c = await dm();
  if (!c) return { error: "Only the DM can share." };
  const { error } = await c.supabase.from("vault_entries").update({ shared }).eq("id", entryId).eq("campaign_id", c.campaign.id);
  if (error) return { error: error.message };
  revalidatePath("/campaign");
}

export async function setStatus(entryId: string, status: "open" | "done" | "failed" | null): Promise<Fail | void> {
  const c = await dm();
  if (!c) return { error: "Only the DM can change that." };
  await c.supabase.from("vault_entries").update({ status, updated_at: new Date().toISOString() }).eq("id", entryId).eq("campaign_id", c.campaign.id);
  revalidatePath("/campaign");
}

export async function renameEntry(entryId: string, title: string): Promise<Fail | void> {
  const c = await dm();
  if (!c) return { error: "Only the DM can rename." };
  await c.supabase.from("vault_entries").update({ title: title.trim().slice(0, 120) || "Untitled", updated_at: new Date().toISOString() }).eq("id", entryId).eq("campaign_id", c.campaign.id);
  revalidatePath("/campaign");
}

export async function moveEntry(entryId: string, folderId: string): Promise<Fail | void> {
  const c = await dm();
  if (!c) return { error: "Only the DM can move things." };
  const { data: f } = await c.supabase.from("vault_folders").select("id").eq("id", folderId).eq("campaign_id", c.campaign.id).maybeSingle();
  if (!f) return { error: "Folder not found." };
  await c.supabase.from("vault_entries").update({ folder_id: f.id }).eq("id", entryId).eq("campaign_id", c.campaign.id);
  await c.supabase.from("vault_entries").update({ folder_id: f.id }).eq("parent_id", entryId);
  revalidatePath("/campaign");
}

export async function deleteEntry(entryId: string): Promise<Fail | { folderId: string }> {
  const c = await dm();
  if (!c) return { error: "Only the DM can delete." };
  const { data: rows } = await c.supabase.from("vault_entries").select("id, folder_id, image_path, thumb_path, parent_id")
    .eq("campaign_id", c.campaign.id).or(`id.eq.${entryId},parent_id.eq.${entryId}`);
  const me = rows?.find((r) => r.id === entryId);
  if (!me) return { error: "Not found." };
  const files = (rows ?? []).flatMap((r) => [r.image_path, r.thumb_path]).filter((x): x is string => !!x);
  await c.supabase.from("vault_entries").delete().eq("id", entryId).eq("campaign_id", c.campaign.id);
  if (files.length) await createAdminClient().storage.from("vault").remove(files);
  revalidatePath("/campaign");
  return { folderId: me.folder_id };
}

export async function createFolder(name: string): Promise<Fail | { id: string }> {
  const c = await dm();
  if (!c) return { error: "Only the DM can add folders." };
  const n = name.trim().slice(0, 60);
  if (!n) return { error: "Give the folder a name." };
  const { data, error } = await c.supabase.from("vault_folders").insert({ campaign_id: c.campaign.id, kind: "custom", name: n, sort: 100 }).select("id").single();
  if (error || !data) return { error: "Couldn't create it. " + (error?.message ?? "") };
  revalidatePath("/campaign");
  return { id: data.id };
}

export async function renameFolder(folderId: string, name: string): Promise<Fail | void> {
  const c = await dm();
  if (!c) return { error: "Only the DM can rename folders." };
  const n = name.trim().slice(0, 60);
  if (!n) return { error: "Give the folder a name." };
  await c.supabase.from("vault_folders").update({ name: n }).eq("id", folderId).eq("campaign_id", c.campaign.id);
  revalidatePath("/campaign");
}

export async function deleteFolder(folderId: string): Promise<Fail | void> {
  const c = await dm();
  if (!c) return { error: "Only the DM can delete folders." };
  const { data: f } = await c.supabase.from("vault_folders").select("kind").eq("id", folderId).eq("campaign_id", c.campaign.id).maybeSingle();
  if (!f) return { error: "Folder not found." };
  if (f.kind !== "custom") return { error: "Standard folders can't be deleted, only your own." };
  const { count } = await c.supabase.from("vault_entries").select("id", { count: "exact", head: true }).eq("folder_id", folderId);
  if (count) return { error: "Move or delete what's inside first." };
  await c.supabase.from("vault_folders").delete().eq("id", folderId);
  revalidatePath("/campaign");
}
