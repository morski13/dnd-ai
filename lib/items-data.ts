// Loads gear, shops and the items hub as the logged-in user (the database hides what they may not see).
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { toCoins, type Coins } from "@/lib/items/money";
import { fromItem, fromSrd, ITEM_COLS, SRD_COLS, who, type DB } from "@/lib/items/server";
import { refOf, type GearRow, type Homebrew, type LibItem, type LogRow } from "@/lib/items/types";

async function ctx() {
  await connection();
  const w = await who();
  if (!w.userId) redirect("/login");
  return w as typeof w & { userId: string };
}

/** Library info for a set of inventory/stock/loot rows. */
async function infoFor(db: DB, rows: { srd_id: string | null; item_id: string | null }[]) {
  const srdIds = [...new Set(rows.map((r) => r.srd_id).filter((x): x is string => !!x))];
  const itemIds = [...new Set(rows.map((r) => r.item_id).filter((x): x is string => !!x))];
  const [{ data: s }, { data: i }] = await Promise.all([
    srdIds.length ? db.from("srd_items").select(SRD_COLS).in("id", srdIds) : Promise.resolve({ data: [] }),
    itemIds.length ? db.from("campaign_items").select(ITEM_COLS).in("id", itemIds) : Promise.resolve({ data: [] }),
  ]);
  const map = new Map<string, LibItem>();
  for (const r of (s ?? []) as Parameters<typeof fromSrd>[0][]) map.set(`srd:${r.id}`, fromSrd(r));
  for (const r of (i ?? []) as Parameters<typeof fromItem>[0][]) map.set(`item:${r.id}`, fromItem(r));
  return map;
}

type LogDb = { id: string; kind: string; text: string; cp_delta: number | null; created_at: string; characters?: { name: string } | null };
const toLog = (r: LogDb): LogRow => ({ id: r.id, kind: r.kind, text: r.text, cpDelta: r.cp_delta, at: r.created_at, character: r.characters?.name ?? null });

type HbDb = { id: string; name: string; kind: string; rarity: string | null; attunement: boolean; cost_cp: number | null; summary: string | null; description: string; status: Homebrew["status"]; dm_note: string | null; source: Homebrew["source"]; for_character: string | null; created_at: string; profiles?: { display_name: string | null } | null };
const HB_COLS = "id, name, kind, rarity, attunement, cost_cp, summary, description, status, dm_note, source, for_character, created_at";
const toHb = (r: HbDb): Homebrew => ({
  id: r.id, name: r.name, kind: r.kind, rarity: r.rarity, attunement: r.attunement, costCp: r.cost_cp, summary: r.summary, description: r.description,
  status: r.status, dmNote: r.dm_note, source: r.source, forCharacter: r.for_character, createdAt: r.created_at, by: r.profiles?.display_name ?? null,
});

export type Gear = { rows: GearRow[]; coins: Coins; log: LogRow[]; homebrew: Homebrew[]; openShops: { id: string; name: string }[] };

/** Everything the Gear tab needs for one character. */
export async function getGear(db: DB, characterId: string, userId: string, canEdit: boolean): Promise<Gear> {
  const [{ data: ch }, { data: items }, { data: log }, { data: hb }, { data: shops }] = await Promise.all([
    db.from("characters").select("coins").eq("id", characterId).maybeSingle(),
    db.from("character_items").select("id, name, qty, equipped, attuned, note, source, srd_id, item_id, sort, created_at").eq("character_id", characterId)
      .order("equipped", { ascending: false }).order("sort").order("created_at"),
    canEdit ? db.from("item_log").select("id, kind, text, cp_delta, created_at").eq("character_id", characterId).order("created_at", { ascending: false }).limit(12) : Promise.resolve({ data: [] }),
    canEdit ? db.from("campaign_items").select(HB_COLS).eq("created_by", userId).eq("source", "player").order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    db.from("shops").select("id, name").eq("is_open", true).order("name"),
  ]);
  const rows = (items ?? []) as { id: string; name: string; qty: number; equipped: boolean; attuned: boolean; note: string | null; source: string; srd_id: string | null; item_id: string | null }[];
  const info = await infoFor(db, rows);
  return {
    coins: toCoins(ch?.coins),
    rows: rows.map((r) => {
      const ref = refOf(r), i = ref ? info.get(ref) : undefined;
      return {
        id: r.id, name: r.name, qty: r.qty, equipped: r.equipped, attuned: r.attuned, note: r.note, source: r.source, ref,
        kind: i?.kind ?? "gear", summary: i?.summary ?? null, rarity: i?.rarity ?? null, needsAttunement: !!i?.attunement, custom: !!i?.custom,
      };
    }),
    log: ((log ?? []) as LogDb[]).map(toLog),
    homebrew: ((hb ?? []) as HbDb[]).filter((h) => !h.for_character || h.for_character === characterId).map(toHb),
    openShops: (shops ?? []) as { id: string; name: string }[],
  };
}

export type ShopSummary = { id: string; name: string; keeper: string | null; isOpen: boolean; stock: number; pricePct: number };

export async function listShops(db: DB, campaignId: string): Promise<ShopSummary[]> {
  const { data } = await db.from("shops").select("id, name, keeper, is_open, price_pct, shop_stock(count)").eq("campaign_id", campaignId).order("is_open", { ascending: false }).order("name");
  return ((data ?? []) as unknown as { id: string; name: string; keeper: string | null; is_open: boolean; price_pct: number; shop_stock: { count: number }[] }[])
    .map((s) => ({ id: s.id, name: s.name, keeper: s.keeper, isOpen: s.is_open, pricePct: s.price_pct, stock: s.shop_stock?.[0]?.count ?? 0 }));
}

export type StockRow = { id: string; name: string; priceCp: number; qty: number | null; bundle: number | null; ref: string | null; item: LibItem | null };

export async function getShop(id: string) {
  const w = await ctx();
  const { data: shop } = await w.supabase.from("shops").select("id, campaign_id, name, keeper, blurb, is_open, price_pct").eq("id", id).maybeSingle();
  if (!shop) notFound();
  const { data: stock } = await w.supabase.from("shop_stock").select("id, name, price_cp, qty, bundle, srd_id, item_id").eq("shop_id", id).order("sort").order("created_at");
  const rows = (stock ?? []) as { id: string; name: string; price_cp: number; qty: number | null; bundle: number | null; srd_id: string | null; item_id: string | null }[];
  const info = await infoFor(w.supabase, rows);
  const isDm = w.isDm && w.campaignId === shop.campaign_id;
  const { data: chars } = await w.supabase.from("characters").select("id, name, coins, owner_user_id").eq("campaign_id", shop.campaign_id).order("name");
  const buyers = ((chars ?? []) as { id: string; name: string; coins: unknown; owner_user_id: string | null }[])
    .filter((c) => c.owner_user_id === w.userId || isDm)
    .map((c) => ({ id: c.id, name: c.name, coins: toCoins(c.coins), mine: c.owner_user_id === w.userId }));
  return {
    isDm,
    shop: { id: shop.id, name: shop.name, keeper: shop.keeper as string | null, blurb: shop.blurb as string | null, isOpen: shop.is_open as boolean, pricePct: shop.price_pct as number },
    stock: rows.map((r): StockRow => {
      const ref = refOf(r);
      return { id: r.id, name: r.name, priceCp: r.price_cp, qty: r.qty, bundle: r.bundle, ref, item: ref ? info.get(ref) ?? null : null };
    }),
    buyers,
  };
}

export type LootTable = { id: string; name: string; note: string | null; coinsCp: number; rows: { id: string; name: string; qty: number; weight: number; ref: string | null; item: LibItem | null }[] };

/** The DM's items hub, or a player's homebrew page. */
export async function getItemsHub() {
  const w = await ctx();
  if (!w.campaignId) return { ...w, campaignId: null, characters: [], requests: [], custom: [], loot: [] as LootTable[], log: [] as LogRow[], shops: [] as ShopSummary[] };
  const { data: chars } = await w.supabase.from("characters").select("id, name, owner_user_id, coins").eq("campaign_id", w.campaignId).order("name");
  const characters = ((chars ?? []) as { id: string; name: string; owner_user_id: string | null; coins: unknown }[])
    .map((c) => ({ id: c.id, name: c.name, mine: c.owner_user_id === w.userId, claimed: !!c.owner_user_id, coins: toCoins(c.coins) }));

  if (!w.isDm) {
    const { data: hb } = await w.supabase.from("campaign_items").select(HB_COLS).eq("campaign_id", w.campaignId).eq("created_by", w.userId).eq("source", "player").order("created_at", { ascending: false });
    return { ...w, characters: characters.filter((c) => c.mine), requests: ((hb ?? []) as HbDb[]).map(toHb), custom: [] as Homebrew[], loot: [] as LootTable[], log: [] as LogRow[], shops: [] as ShopSummary[] };
  }

  const [{ data: items }, { data: tables }, { data: rows }, { data: log }, shops] = await Promise.all([
    w.supabase.from("campaign_items").select(HB_COLS + ", profiles:created_by(display_name)").eq("campaign_id", w.campaignId).order("created_at", { ascending: false }),
    w.supabase.from("loot_tables").select("id, name, note, coins_cp").eq("campaign_id", w.campaignId).order("created_at"),
    w.supabase.from("loot_rows").select("id, table_id, name, qty, weight, srd_id, item_id, sort").eq("campaign_id", w.campaignId).order("sort"),
    w.supabase.from("item_log").select("id, kind, text, cp_delta, created_at, characters(name)").eq("campaign_id", w.campaignId).order("created_at", { ascending: false }).limit(40),
    listShops(w.supabase, w.campaignId),
  ]);
  const all = ((items ?? []) as unknown as HbDb[]).map(toHb);
  const lr = (rows ?? []) as { id: string; table_id: string; name: string; qty: number; weight: number; srd_id: string | null; item_id: string | null }[];
  const info = await infoFor(w.supabase, lr);
  const loot: LootTable[] = ((tables ?? []) as { id: string; name: string; note: string | null; coins_cp: number }[]).map((t) => ({
    id: t.id, name: t.name, note: t.note, coinsCp: t.coins_cp,
    rows: lr.filter((r) => r.table_id === t.id).map((r) => { const ref = refOf(r); return { id: r.id, name: r.name, qty: r.qty, weight: r.weight, ref, item: ref ? info.get(ref) ?? null : null }; }),
  }));
  return {
    ...w, characters,
    requests: all.filter((h) => h.source === "player" && h.status === "pending"),
    custom: all.filter((h) => !(h.source === "player" && h.status === "pending")),
    loot, log: ((log ?? []) as unknown as LogDb[]).map(toLog), shops,
  };
}

/** Small summary for the Campaign and Session screens: open shops, and (DM) waiting homebrew requests. */
export async function itemsSummary(db: DB, campaignId: string, isDm: boolean) {
  const [{ data: open }, pending] = await Promise.all([
    db.from("shops").select("id, name").eq("campaign_id", campaignId).eq("is_open", true).order("name"),
    isDm ? db.from("campaign_items").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("status", "pending") : Promise.resolve({ count: 0 }),
  ]);
  return { openShops: (open ?? []) as { id: string; name: string }[], pending: pending.count ?? 0 };
}
