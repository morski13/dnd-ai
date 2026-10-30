"use server";
import { refresh } from "next/cache";
// Items, coins, homebrew, shops and loot. The database rules decide who may change what;
// these actions add the friendly checks and keep a log of everything that moves.
import { randomInt } from "node:crypto";
import { add, formatCoins, formatCp, fromCp, pay, split, toCoins, total, type Coins } from "@/lib/items/money";
import { friendly, fromItem, fromSrd, ITEM_COLS, lookup, putInBag, SRD_COLS, who, writeLog } from "@/lib/items/server";
import { HOMEBREW_KINDS, parseRef, RARITIES, type ItemInfo, type ItemRef, type LibItem } from "@/lib/items/types";

type Fail = { error: string };
type Ok = { ok: true };
const OK: Ok = { ok: true };

// ------------------------------------------------------------------ library
export async function searchItems(q: string, opts: { rules?: "2014" | "2024" | "both"; kind?: string; custom?: boolean } = {}): Promise<LibItem[]> {
  const { supabase, userId, campaignId } = await who();
  if (!userId) return [];
  const term = (q ?? "").trim().replace(/[%_,()]/g, " ").slice(0, 60);
  const kind = opts.kind && /^[a-z]+$/.test(opts.kind) ? opts.kind : null;
  let s = supabase.from("srd_items").select(SRD_COLS).order("name").limit(40);
  if (term) s = s.ilike("name", `%${term}%`);
  if (opts.rules && opts.rules !== "both") s = s.eq("rules", opts.rules);
  if (kind) s = kind === "magic" ? s.eq("kind", "magic") : s.eq("kind", kind);
  const [srd, own] = await Promise.all([
    s,
    opts.custom === false || !campaignId ? Promise.resolve({ data: [] }) : (() => {
      let c = supabase.from("campaign_items").select(ITEM_COLS).eq("campaign_id", campaignId).eq("status", "approved").order("name").limit(20);
      if (term) c = c.ilike("name", `%${term}%`);
      if (kind) c = c.eq("kind", kind);
      return c;
    })(),
  ]);
  const custom = ((own.data ?? []) as Parameters<typeof fromItem>[0][]).map(fromItem);
  const lib = ((srd.data ?? []) as unknown as Parameters<typeof fromSrd>[0][]).map(fromSrd);
  // the campaign's own items first, then exact/starting matches before the rest
  const low = term.toLowerCase();
  const score = (i: LibItem) => (i.name.toLowerCase() === low ? 0 : i.name.toLowerCase().startsWith(low) ? 1 : 2);
  return [...custom, ...lib.sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name) || (b.rules ?? "").localeCompare(a.rules ?? ""))];
}

export async function itemInfo(ref: ItemRef): Promise<ItemInfo | null> {
  const { supabase, userId } = await who();
  if (!userId) return null;
  return lookup(supabase, ref);
}

// ------------------------------------------------------------------ gear
async function character(characterId: string) {
  const w = await who();
  if (!w.userId) return null;
  const { data } = await w.supabase.from("characters").select("id, campaign_id, name, coins, owner_user_id").eq("id", characterId).maybeSingle();
  if (!data) return null;
  const mine = data.owner_user_id === w.userId;
  const isDm = w.isDm && w.campaignId === data.campaign_id;
  return { ...w, c: data as { id: string; campaign_id: string; name: string; coins: unknown; owner_user_id: string | null }, mine, isDm, canEdit: mine || isDm };
}

export async function addGear(characterId: string, ref: ItemRef | null, name: string, qty: number): Promise<Fail | Ok> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const x = await character(characterId);
  if (!x?.canEdit) return { error: "You can only change your own gear." };
  let label = name.trim().slice(0, 160);
  if (ref) {
    const info = await lookup(x.supabase, ref);
    if (!info) return { error: "Item not found." };
    if (info.custom && info.status !== "approved") return { error: "This homebrew item needs the DM's approval first." };
    label = info.name;
    if (info.bundle && qty === 1) qty = info.bundle;
  }
  if (!label) return { error: "Give the item a name." };
  const r = await putInBag(x.supabase, { campaignId: x.c.campaign_id, characterId, ref, name: label, qty, source: x.isDm && !x.mine ? "dm" : "manual" });
  if ("error" in r) return r;
  if (x.isDm && !x.mine) await writeLog(x.supabase, { campaignId: x.c.campaign_id, characterId, userId: x.userId!, kind: "give", text: `DM gave ${qty > 1 ? qty + "× " : ""}${label}` });
  return OK;
}

async function gearRow(rowId: string) {
  const w = await who();
  if (!w.userId) return null;
  const { data } = await w.supabase.from("character_items").select("id, character_id, campaign_id, name, qty, attuned, srd_id, item_id").eq("id", rowId).maybeSingle();
  return data ? { ...w, row: data } : null;
}

export async function setQty(rowId: string, qty: number): Promise<Fail | Ok> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const x = await gearRow(rowId);
  if (!x) return { error: "Not found." };
  const n = Math.floor(qty);
  if (n <= 0) return dropGear(rowId);
  const { data, error } = await x.supabase.from("character_items").update({ qty: Math.min(99999, n) }).eq("id", rowId).select("id");
  if (error || !data?.length) return { error: error ? friendly(error.message) : "You can only change your own gear." };
  return OK;
}

export async function dropGear(rowId: string): Promise<Fail | Ok> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const x = await gearRow(rowId);
  if (!x) return { error: "Not found." };
  const { data, error } = await x.supabase.from("character_items").delete().eq("id", rowId).select("id");
  if (error || !data?.length) return { error: error ? friendly(error.message) : "You can only change your own gear." };
  await writeLog(x.supabase, { campaignId: x.row.campaign_id, characterId: x.row.character_id, userId: x.userId!, kind: "drop", text: `Removed ${x.row.qty > 1 ? x.row.qty + "× " : ""}${x.row.name}` });
  return OK;
}

export async function setEquipped(rowId: string, on: boolean): Promise<Fail | Ok> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const x = await gearRow(rowId);
  if (!x) return { error: "Not found." };
  const { data } = await x.supabase.from("character_items").update({ equipped: on }).eq("id", rowId).select("id");
  return data?.length ? OK : { error: "You can only change your own gear." };
}

export async function setAttuned(rowId: string, on: boolean): Promise<Fail | Ok> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const x = await gearRow(rowId);
  if (!x) return { error: "Not found." };
  if (on) {
    const { count } = await x.supabase.from("character_items").select("id", { count: "exact", head: true }).eq("character_id", x.row.character_id).eq("attuned", true);
    if ((count ?? 0) >= 3) return { error: "You can be attuned to at most 3 items. End one first." };
  }
  const { data } = await x.supabase.from("character_items").update({ attuned: on }).eq("id", rowId).select("id");
  return data?.length ? OK : { error: "You can only change your own gear." };
}

/** Opens an equipment pack: its contents go in the bag, the pack goes away. */
export async function unpack(rowId: string): Promise<Fail | Ok> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const x = await gearRow(rowId);
  if (!x?.row.srd_id) return { error: "Only packs from the library can be unpacked." };
  const info = await lookup(x.supabase, `srd:${x.row.srd_id}`);
  if (!info?.contents?.length) return { error: "This isn't a pack." };
  const rules = x.row.srd_id.slice(0, 4);
  const { data: lib } = await x.supabase.from("srd_items").select("id, name").eq("rules", rules).in("name", info.contents.map((c) => c.name));
  for (const c of info.contents) {
    const hit = (lib ?? []).find((l) => l.name === c.name);
    const r = await putInBag(x.supabase, { campaignId: x.row.campaign_id, characterId: x.row.character_id, ref: hit ? `srd:${hit.id}` : null, name: c.name, qty: c.qty * x.row.qty, source: "manual" });
    if ("error" in r) return r;
  }
  await x.supabase.from("character_items").delete().eq("id", rowId);
  return OK;
}

export async function setCoins(characterId: string, coins: Coins): Promise<Fail | { coins: Coins }> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const x = await character(characterId);
  if (!x?.canEdit) return { error: "You can only change your own coins." };
  const before = toCoins(x.c.coins), after = toCoins(coins);
  const { error } = await x.supabase.from("characters").update({ coins: after }).eq("id", characterId);
  if (error) return { error: friendly(error.message) };
  const delta = total(after) - total(before);
  if (delta !== 0) {
    await writeLog(x.supabase, {
      campaignId: x.c.campaign_id, characterId, userId: x.userId!, kind: "coins", cpDelta: delta,
      text: `${x.isDm && !x.mine ? "DM changed coins" : "Coins changed"}: ${delta > 0 ? "+" : "−"}${formatCp(Math.abs(delta))} (now ${formatCoins(after)})`,
    });
  }
  return { coins: after };
}

// ------------------------------------------------------------------ homebrew
export type HomebrewForm = {
  name: string; kind: string; rarity: string; attunement: boolean; cost: number | null; summary: string; description: string; basedOn?: string | null;
};

function cleanForm(f: HomebrewForm) {
  const name = (f.name ?? "").trim().slice(0, 120);
  if (!name) return { error: "Give the item a name." } as Fail;
  const description = (f.description ?? "").trim().slice(0, 6000);
  if (!description) return { error: "Describe what the item does." } as Fail;
  const kind = (HOMEBREW_KINDS as readonly string[]).includes(f.kind) ? f.kind : "other";
  const rarity = (RARITIES as readonly string[]).includes(f.rarity) ? f.rarity : null;
  const cost = f.cost == null || !Number.isFinite(f.cost) ? null : Math.max(0, Math.min(1e9, Math.round(f.cost)));
  const based = f.basedOn && parseRef(f.basedOn).srdId ? parseRef(f.basedOn).srdId : null;
  return {
    name, kind, rarity, attunement: !!f.attunement, cost_cp: cost, summary: (f.summary ?? "").trim().slice(0, 200) || null,
    description, based_on: based, category: kind === "magic" ? "Wondrous Item" : null,
  };
}

/** A player asks the DM for a homebrew item. */
export async function requestHomebrew(characterId: string | null, form: HomebrewForm): Promise<Fail | { id: string }> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const { supabase, userId, campaignId } = await who();
  if (!userId || !campaignId) return { error: "Join a campaign first." };
  const v = cleanForm(form);
  if ("error" in v) return v;
  const { data, error } = await supabase.from("campaign_items").insert({
    ...v, campaign_id: campaignId, source: "player", status: "pending", created_by: userId, for_character: characterId,
  }).select("id").single();
  if (error || !data) return { error: friendly(error?.message ?? "Couldn't send it.") };
  await writeLog(supabase, { campaignId, characterId, userId, kind: "homebrew", text: `Asked the DM about “${v.name}”` }).catch(() => {});
  return { id: data.id };
}

/** The player changes a request (it goes back to the DM). */
export async function updateHomebrew(id: string, form: HomebrewForm): Promise<Fail | Ok> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const { supabase, userId, isDm } = await who();
  if (!userId) return { error: "Log in first." };
  const v = cleanForm(form);
  if ("error" in v) return v;
  const patch = isDm ? { ...v, updated_at: new Date().toISOString() } : { ...v, status: "pending", updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from("campaign_items").update(patch).eq("id", id).select("id");
  if (error || !data?.length) return { error: error ? friendly(error.message) : "Approved items can only be changed by the DM." };
  return OK;
}

export async function deleteHomebrew(id: string): Promise<Fail | Ok> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const { supabase, userId } = await who();
  if (!userId) return { error: "Log in first." };
  const { data, error } = await supabase.from("campaign_items").delete().eq("id", id).select("id");
  if (error || !data?.length) return { error: error ? friendly(error.message) : "You can't delete this one." };
  return OK;
}

/** DM: approve (and hand it to the character it was made for) or say no, with a note. */
export async function reviewHomebrew(id: string, decision: "approved" | "rejected", note: string, give = true): Promise<Fail | Ok> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const { supabase, userId, campaignId, isDm } = await who();
  if (!isDm || !campaignId) return { error: "Only the DM decides on homebrew." };
  const { data: it } = await supabase.from("campaign_items").select("id, name, for_character").eq("id", id).eq("campaign_id", campaignId).maybeSingle();
  if (!it) return { error: "Not found." };
  const { error } = await supabase.from("campaign_items").update({ status: decision, dm_note: note.trim().slice(0, 500) || null, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: friendly(error.message) };
  if (decision === "approved" && give && it.for_character) {
    const r = await putInBag(supabase, { campaignId, characterId: it.for_character, ref: `item:${it.id}`, name: it.name, qty: 1, source: "dm" });
    if ("error" in r) return r;
  }
  await writeLog(supabase, { campaignId, characterId: it.for_character, userId: userId!, kind: "homebrew", text: `DM ${decision === "approved" ? "approved" : "said no to"} “${it.name}”${note.trim() ? `: ${note.trim().slice(0, 120)}` : ""}` });
  return OK;
}

/** DM: a custom item for the campaign (secret until given or put in an open shop). */
export async function createCustomItem(form: HomebrewForm): Promise<Fail | { id: string; ref: ItemRef }> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const { supabase, userId, campaignId, isDm } = await who();
  if (!isDm || !campaignId) return { error: "Only the DM makes custom items." };
  const v = cleanForm(form);
  if ("error" in v) return v;
  const { data, error } = await supabase.from("campaign_items").insert({ ...v, campaign_id: campaignId, source: "dm", status: "approved", created_by: userId })
    .select("id").single();
  if (error || !data) return { error: friendly(error?.message ?? "Couldn't make it.") };
  return { id: data.id, ref: `item:${data.id}` };
}

// ------------------------------------------------------------------ giving (DM)
async function dmCampaign() {
  const w = await who();
  if (!w.isDm || !w.campaignId) return null;
  return w as typeof w & { campaignId: string; userId: string };
}

export async function giveItem(characterIds: string[], ref: ItemRef | null, name: string, qty: number): Promise<Fail | Ok> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const d = await dmCampaign();
  if (!d) return { error: "Only the DM gives items." };
  if (!characterIds.length) return { error: "Pick who gets it." };
  let label = name.trim();
  if (ref) {
    const info = await lookup(d.supabase, ref);
    if (!info) return { error: "Item not found." };
    if (info.custom && info.status !== "approved") return { error: "Approve the homebrew item first." };
    label = info.name;
  }
  if (!label) return { error: "Give the item a name." };
  const n = Math.max(1, Math.min(9999, Math.floor(qty) || 1));
  for (const cid of characterIds.slice(0, 12)) {
    const r = await putInBag(d.supabase, { campaignId: d.campaignId, characterId: cid, ref, name: label, qty: n, source: "dm" });
    if ("error" in r) return r;
    await writeLog(d.supabase, { campaignId: d.campaignId, characterId: cid, userId: d.userId, kind: "give", text: `DM gave ${n > 1 ? n + "× " : ""}${label}` });
  }
  return OK;
}

/** Coins to players: everyone gets the amount ("each"), or the amount is shared out ("split"). */
export async function giveCoins(characterIds: string[], cp: number, mode: "each" | "split", why = ""): Promise<Fail | Ok> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const d = await dmCampaign();
  if (!d) return { error: "Only the DM gives coins." };
  const ids = characterIds.slice(0, 12);
  const amount = Math.max(0, Math.min(1e9, Math.round(cp)));
  if (!ids.length || amount <= 0) return { error: "Pick who gets it and how much." };
  const shares = mode === "split" ? split(amount, ids.length) : ids.map(() => amount);
  const { data: chars } = await d.supabase.from("characters").select("id, coins").in("id", ids).eq("campaign_id", d.campaignId);
  for (const [i, id] of ids.entries()) {
    const ch = chars?.find((c) => c.id === id);
    if (!ch || shares[i] <= 0) continue;
    const next = add(toCoins(ch.coins), fromCp(shares[i]));
    await d.supabase.from("characters").update({ coins: next }).eq("id", id);
    await writeLog(d.supabase, { campaignId: d.campaignId, characterId: id, userId: d.userId, kind: "coins", cpDelta: shares[i], text: `DM gave ${formatCp(shares[i])}${why ? ` (${why.slice(0, 80)})` : ""}` });
  }
  return OK;
}

// ------------------------------------------------------------------ shops (DM)
export async function createShop(name: string): Promise<Fail | { id: string }> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const d = await dmCampaign();
  if (!d) return { error: "Only the DM makes shops." };
  const n = name.trim().slice(0, 80);
  if (!n) return { error: "Give the shop a name." };
  const { data, error } = await d.supabase.from("shops").insert({ campaign_id: d.campaignId, name: n }).select("id").single();
  if (error || !data) return { error: friendly(error?.message ?? "Couldn't make it.") };
  return { id: data.id };
}

export async function updateShop(id: string, patch: { name?: string; keeper?: string; blurb?: string; pricePct?: number }): Promise<Fail | Ok> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const d = await dmCampaign();
  if (!d) return { error: "Only the DM changes shops." };
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) { const n = patch.name.trim().slice(0, 80); if (!n) return { error: "Give the shop a name." }; row.name = n; }
  if (patch.keeper !== undefined) row.keeper = patch.keeper.trim().slice(0, 80) || null;
  if (patch.blurb !== undefined) row.blurb = patch.blurb.trim().slice(0, 500) || null;
  if (patch.pricePct !== undefined) row.price_pct = Math.max(10, Math.min(1000, Math.round(patch.pricePct) || 100));
  const { error } = await d.supabase.from("shops").update(row).eq("id", id).eq("campaign_id", d.campaignId);
  return error ? { error: friendly(error.message) } : OK;
}

/** Open = the players can see the shop and buy. Closing hides it again. */
export async function setShopOpen(id: string, open: boolean): Promise<Fail | Ok> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const d = await dmCampaign();
  if (!d) return { error: "Only the DM opens shops." };
  const { data: s } = await d.supabase.from("sessions").select("id").eq("campaign_id", d.campaignId).not("started_at", "is", null).is("ended_at", null).limit(1).maybeSingle();
  const { error } = await d.supabase.from("shops").update({ is_open: open, opened_session: open ? s?.id ?? null : null, updated_at: new Date().toISOString() })
    .eq("id", id).eq("campaign_id", d.campaignId);
  return error ? { error: friendly(error.message) } : OK;
}

export async function deleteShop(id: string): Promise<Fail | Ok> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const d = await dmCampaign();
  if (!d) return { error: "Only the DM deletes shops." };
  await d.supabase.from("shops").delete().eq("id", id).eq("campaign_id", d.campaignId);
  return OK;
}

export async function addStock(shopId: string, ref: ItemRef | null, name: string, priceCp: number | null, qty: number | null): Promise<Fail | Ok> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const d = await dmCampaign();
  if (!d) return { error: "Only the DM stocks shops." };
  const { srdId, itemId } = ref ? parseRef(ref) : { srdId: null, itemId: null };
  let label = name.trim().slice(0, 160), bundle: number | null = null, price = priceCp;
  if (ref) {
    const info = await lookup(d.supabase, ref);
    if (!info) return { error: "Item not found." };
    if (info.custom && info.status !== "approved") return { error: "Approve the homebrew item first." };
    label = info.name; bundle = info.bundle;
    price ??= info.costCp;
  }
  if (!label) return { error: "Give the item a name." };
  if (price == null || price < 0) return { error: "Set a price." };
  const { count } = await d.supabase.from("shop_stock").select("id", { count: "exact", head: true }).eq("shop_id", shopId);
  const { error } = await d.supabase.from("shop_stock").insert({
    shop_id: shopId, campaign_id: d.campaignId, srd_id: srdId, item_id: itemId, name: label, price_cp: Math.round(price),
    qty: qty == null ? null : Math.max(0, Math.floor(qty)), bundle, sort: count ?? 0,
  });
  return error ? { error: friendly(error.message) } : OK;
}

export async function updateStock(id: string, patch: { priceCp?: number; qty?: number | null }): Promise<Fail | Ok> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const d = await dmCampaign();
  if (!d) return { error: "Only the DM changes stock." };
  const row: Record<string, unknown> = {};
  if (patch.priceCp !== undefined) row.price_cp = Math.max(0, Math.round(patch.priceCp));
  if (patch.qty !== undefined) row.qty = patch.qty == null ? null : Math.max(0, Math.floor(patch.qty));
  const { error } = await d.supabase.from("shop_stock").update(row).eq("id", id).eq("campaign_id", d.campaignId);
  return error ? { error: friendly(error.message) } : OK;
}

export async function removeStock(id: string): Promise<Fail | Ok> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const d = await dmCampaign();
  if (!d) return { error: "Only the DM changes stock." };
  await d.supabase.from("shop_stock").delete().eq("id", id).eq("campaign_id", d.campaignId);
  return OK;
}

// ------------------------------------------------------------------ buying
export async function buy(stockId: string, characterId: string, qty: number): Promise<Fail | { coins: Coins; paid: number }> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const x = await character(characterId);
  if (!x?.canEdit) return { error: "You can only buy for your own character." };
  const { data: st } = await x.supabase.from("shop_stock").select("id, price_cp, qty, name, shops(price_pct, is_open)").eq("id", stockId).maybeSingle();
  const shop = st?.shops as unknown as { price_pct: number; is_open: boolean } | null;
  if (!st || !shop?.is_open) return { error: "This shop is closed." };
  const n = Math.max(1, Math.min(999, Math.floor(qty) || 1));
  if (st.qty != null && st.qty < n) return { error: st.qty === 0 ? "Sold out." : `Only ${st.qty} left.` };
  const price = Math.round(st.price_cp * shop.price_pct / 100) * n;
  const before = x.c.coins as Coins;
  const after = pay(toCoins(before), price);
  if (!after) return { error: `Not enough coins: it costs ${formatCp(price)}, you have ${formatCoins(toCoins(before))}.` };
  // the database checks the coins weren't changed meanwhile and the value is exactly the price
  const { error } = await x.supabase.rpc("shop_buy", { p_stock: stockId, p_character: characterId, p_qty: n, p_old: before, p_new: after });
  if (error) return { error: friendly(error.message) };
  return { coins: after, paid: price };
}

// ------------------------------------------------------------------ loot (DM)
export async function createLootTable(name: string): Promise<Fail | { id: string }> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const d = await dmCampaign();
  if (!d) return { error: "Only the DM makes loot tables." };
  const n = name.trim().slice(0, 80);
  if (!n) return { error: "Give it a name." };
  const { data, error } = await d.supabase.from("loot_tables").insert({ campaign_id: d.campaignId, name: n }).select("id").single();
  return error || !data ? { error: friendly(error?.message ?? "Couldn't make it.") } : { id: data.id };
}

export async function updateLootTable(id: string, patch: { name?: string; note?: string; coinsCp?: number }): Promise<Fail | Ok> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const d = await dmCampaign();
  if (!d) return { error: "Only the DM changes loot tables." };
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) { const n = patch.name.trim().slice(0, 80); if (!n) return { error: "Give it a name." }; row.name = n; }
  if (patch.note !== undefined) row.note = patch.note.trim().slice(0, 500) || null;
  if (patch.coinsCp !== undefined) row.coins_cp = Math.max(0, Math.min(1e9, Math.round(patch.coinsCp) || 0));
  const { error } = await d.supabase.from("loot_tables").update(row).eq("id", id).eq("campaign_id", d.campaignId);
  return error ? { error: friendly(error.message) } : OK;
}

export async function deleteLootTable(id: string): Promise<Fail | Ok> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const d = await dmCampaign();
  if (!d) return { error: "Only the DM deletes loot tables." };
  await d.supabase.from("loot_tables").delete().eq("id", id).eq("campaign_id", d.campaignId);
  return OK;
}

export async function addLootRow(tableId: string, ref: ItemRef | null, name: string, qty: number, weight = 1): Promise<Fail | Ok> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const d = await dmCampaign();
  if (!d) return { error: "Only the DM changes loot tables." };
  const { srdId, itemId } = ref ? parseRef(ref) : { srdId: null, itemId: null };
  let label = name.trim().slice(0, 160);
  if (ref) { const info = await lookup(d.supabase, ref); if (!info) return { error: "Item not found." }; label = info.name; }
  if (!label) return { error: "Give the item a name." };
  const { count } = await d.supabase.from("loot_rows").select("id", { count: "exact", head: true }).eq("table_id", tableId);
  const { error } = await d.supabase.from("loot_rows").insert({
    table_id: tableId, campaign_id: d.campaignId, srd_id: srdId, item_id: itemId, name: label,
    qty: Math.max(1, Math.min(9999, Math.floor(qty) || 1)), weight: Math.max(1, Math.min(100, Math.floor(weight) || 1)), sort: count ?? 0,
  });
  return error ? { error: friendly(error.message) } : OK;
}

export async function removeLootRow(id: string): Promise<Fail | Ok> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const d = await dmCampaign();
  if (!d) return { error: "Only the DM changes loot tables." };
  await d.supabase.from("loot_rows").delete().eq("id", id).eq("campaign_id", d.campaignId);
  return OK;
}

type LootRow = { id: string; srd_id: string | null; item_id: string | null; name: string; qty: number; weight: number };

/** Rolls one row from a loot table (rows with a higher chance come up more often). */
export async function rollLoot(tableId: string): Promise<Fail | { rowId: string; name: string; qty: number; roll: number; of: number }> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const d = await dmCampaign();
  if (!d) return { error: "Only the DM rolls loot." };
  const { data } = await d.supabase.from("loot_rows").select("id, srd_id, item_id, name, qty, weight").eq("table_id", tableId).order("sort");
  const rows = (data ?? []) as LootRow[];
  if (!rows.length) return { error: "This table is empty." };
  const of = rows.reduce((s, r) => s + r.weight, 0);
  const roll = randomInt(1, of + 1);
  let acc = 0;
  const hit = rows.find((r) => (acc += r.weight) >= roll)!;
  return { rowId: hit.id, name: hit.name, qty: hit.qty, roll, of };
}

/** Hands out loot. One row to one character, or the whole table (items to one, coins shared by everyone picked). */
export async function giveLoot(a: { rowId?: string; tableId?: string; itemsTo: string; coinsTo?: string[] }): Promise<Fail | Ok> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const d = await dmCampaign();
  if (!d) return { error: "Only the DM gives loot." };
  let rows: LootRow[] = [];
  let coins = 0, tableName = "";
  if (a.rowId) {
    const { data } = await d.supabase.from("loot_rows").select("id, srd_id, item_id, name, qty, weight, loot_tables(name)").eq("id", a.rowId).eq("campaign_id", d.campaignId).maybeSingle();
    if (!data) return { error: "Not found." };
    rows = [data as unknown as LootRow];
    tableName = (data.loot_tables as unknown as { name: string } | null)?.name ?? "";
  } else if (a.tableId) {
    const { data: t } = await d.supabase.from("loot_tables").select("name, coins_cp").eq("id", a.tableId).eq("campaign_id", d.campaignId).maybeSingle();
    if (!t) return { error: "Not found." };
    const { data } = await d.supabase.from("loot_rows").select("id, srd_id, item_id, name, qty, weight").eq("table_id", a.tableId).order("sort");
    rows = (data ?? []) as LootRow[];
    coins = t.coins_cp; tableName = t.name;
  }
  for (const r of rows) {
    const ref = r.item_id ? `item:${r.item_id}` : r.srd_id ? `srd:${r.srd_id}` : null;
    const res = await putInBag(d.supabase, { campaignId: d.campaignId, characterId: a.itemsTo, ref, name: r.name, qty: r.qty, source: "loot" });
    if ("error" in res) return res;
    await writeLog(d.supabase, { campaignId: d.campaignId, characterId: a.itemsTo, userId: d.userId, kind: "loot", text: `Loot${tableName ? ` (${tableName})` : ""}: ${r.qty > 1 ? r.qty + "× " : ""}${r.name}` });
  }
  if (coins > 0) {
    const who = a.coinsTo?.length ? a.coinsTo : [a.itemsTo];
    const r = await giveCoins(who, coins, "split", tableName);
    if ("error" in r) return r;
  }
  return OK;
}
