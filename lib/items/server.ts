// Server helpers for items: who is asking, looking items up, putting items in a bag, writing the log.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { parseRef, type ItemInfo, type ItemRef, type LibItem } from "./types";

export type DB = SupabaseClient;

/** The logged-in user and their campaign (no redirect, for server actions). */
export async function who() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = (auth?.claims?.sub as string | undefined) ?? null;
  if (!userId) return { supabase, userId: null, campaignId: null, isDm: false };
  const { data: m } = await supabase.from("campaign_members").select("campaign_id, role").eq("user_id", userId)
    .order("last_active_at", { ascending: false, nullsFirst: false }).order("joined_at", { ascending: true }).limit(1).maybeSingle();
  return { supabase, userId, campaignId: (m?.campaign_id as string | undefined) ?? null, isDm: m?.role === "dm" || m?.role === "co_dm" };
}

export const SRD_COLS = "id, rules, name, kind, category, rarity, attunement, cost_cp, weight, bundle, summary";
export const ITEM_COLS = "id, name, kind, category, rarity, attunement, cost_cp, weight, summary, status";

type SrdRow = { id: string; rules: string; name: string; kind: string; category: string | null; rarity: string | null; attunement: boolean; cost_cp: number | null; weight: number | null; bundle: number | null; summary: string | null };
type ItemRow = { id: string; name: string; kind: string; category: string | null; rarity: string | null; attunement: boolean; cost_cp: number | null; weight: number | null; summary: string | null; status: string };

export const fromSrd = (r: SrdRow): LibItem => ({
  ref: `srd:${r.id}`, name: r.name, kind: r.kind, category: r.category, rarity: r.rarity, attunement: r.attunement,
  costCp: r.cost_cp, bundle: r.bundle, weight: r.weight == null ? null : Number(r.weight), summary: r.summary, custom: false, rules: r.rules,
});
export const fromItem = (r: ItemRow): LibItem => ({
  ref: `item:${r.id}`, name: r.name, kind: r.kind, category: r.category, rarity: r.rarity, attunement: r.attunement,
  costCp: r.cost_cp, bundle: null, weight: r.weight == null ? null : Number(r.weight), summary: r.summary, custom: true, rules: null, status: r.status,
});

/** One item, with its full text. Players only get campaign items the database lets them see. */
export async function lookup(db: DB, ref: ItemRef): Promise<ItemInfo | null> {
  const { srdId, itemId } = parseRef(ref);
  if (srdId) {
    const { data } = await db.from("srd_items").select(SRD_COLS + ", description, data").eq("id", srdId).maybeSingle();
    if (!data) return null;
    const d = data as unknown as SrdRow & { description: string; data: { contents?: { name: string; qty: number }[]; variants?: string[] } | null };
    return { ...fromSrd(d), description: d.description, contents: d.data?.contents, variants: d.data?.variants };
  }
  if (itemId) {
    const { data } = await db.from("campaign_items").select(ITEM_COLS + ", description").eq("id", itemId).maybeSingle();
    if (!data) return null;
    const d = data as unknown as ItemRow & { description: string };
    return { ...fromItem(d), description: d.description };
  }
  return null;
}

/** The session going on now, or else the last one played (gifts after a session belong to it). */
export async function currentSession(db: DB, campaignId: string): Promise<string | null> {
  const { data } = await db.from("sessions").select("id").eq("campaign_id", campaignId).not("started_at", "is", null)
    .order("started_at", { ascending: false }).limit(1).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Puts items in a character's bag, stacking with the same unequipped item. */
export async function putInBag(db: DB, a: {
  campaignId: string; characterId: string; ref: ItemRef | null; name: string; qty: number; source: "manual" | "shop" | "dm" | "loot";
}): Promise<{ error: string } | { id: string }> {
  const { srdId, itemId } = a.ref ? parseRef(a.ref) : { srdId: null, itemId: null };
  const qty = Math.max(1, Math.min(9999, Math.floor(a.qty) || 1));
  let q = db.from("character_items").select("id, qty").eq("character_id", a.characterId).eq("equipped", false).is("note", null).eq("name", a.name);
  q = srdId ? q.eq("srd_id", srdId) : q.is("srd_id", null);
  q = itemId ? q.eq("item_id", itemId) : q.is("item_id", null);
  const { data: same } = await q.limit(1).maybeSingle();
  if (same) {
    const { error } = await db.from("character_items").update({ qty: Math.min(99999, same.qty + qty) }).eq("id", same.id);
    return error ? { error: friendly(error.message) } : { id: same.id };
  }
  const { data, error } = await db.from("character_items").insert({
    campaign_id: a.campaignId, character_id: a.characterId, srd_id: srdId, item_id: itemId, name: a.name.slice(0, 160), qty, source: a.source,
  }).select("id").single();
  return error || !data ? { error: friendly(error?.message ?? "Couldn't add it.") } : { id: data.id };
}

export async function writeLog(db: DB, a: {
  campaignId: string; characterId: string | null; userId: string; kind: "buy" | "give" | "loot" | "coins" | "drop" | "homebrew"; text: string; cpDelta?: number | null;
}) {
  const sessionId = await currentSession(db, a.campaignId);
  await db.from("item_log").insert({
    campaign_id: a.campaignId, character_id: a.characterId, session_id: sessionId, kind: a.kind, text: a.text.slice(0, 300),
    cp_delta: a.cpDelta ?? null, created_by: a.userId,
  });
}

/** Database messages people can read. */
export function friendly(msg: string) {
  if (/approval/i.test(msg)) return "This homebrew item needs the DM's approval first.";
  if (/row-level security|permission/i.test(msg)) return "You're not allowed to do that.";
  return msg.replace(/^.*?ERROR:\s*/, "");
}
