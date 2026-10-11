// Shared shapes for items (library, campaign items, inventory, shops, loot). No server code here.

/** Points at an item: "srd:2024:longsword" (library) or "item:<uuid>" (the campaign's own items). */
export type ItemRef = string;

export type LibItem = {
  ref: ItemRef; name: string; kind: string; category: string | null; rarity: string | null; attunement: boolean;
  costCp: number | null; bundle: number | null; weight: number | null; summary: string | null;
  custom: boolean; rules: string | null; status?: string;
};

export type ItemInfo = LibItem & { description: string; contents?: { name: string; qty: number }[]; variants?: string[] };

export type GearRow = {
  id: string; name: string; qty: number; equipped: boolean; attuned: boolean; note: string | null; source: string;
  ref: ItemRef | null; kind: string; summary: string | null; rarity: string | null; needsAttunement: boolean; custom: boolean;
};

export type Homebrew = {
  id: string; name: string; kind: string; rarity: string | null; attunement: boolean; costCp: number | null; summary: string | null;
  description: string; status: "approved" | "pending" | "rejected"; dmNote: string | null; source: "dm" | "player";
  by: string | null; forCharacter: string | null; createdAt: string;
};

export type LogRow = { id: string; kind: string; text: string; cpDelta: number | null; at: string; character: string | null };

export const KIND_LABEL: Record<string, string> = {
  gear: "Gear", weapon: "Weapon", armor: "Armor", ammo: "Ammunition", tool: "Tool", pack: "Pack", mount: "Mount & vehicle",
  magic: "Magic item", potion: "Potion", treasure: "Treasure", other: "Other",
};
export const HOMEBREW_KINDS = ["weapon", "armor", "magic", "potion", "gear", "tool", "treasure", "other"] as const;
export const RARITIES = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact"] as const;

export const refOf = (r: { srd_id?: string | null; item_id?: string | null }): ItemRef | null =>
  r.item_id ? `item:${r.item_id}` : r.srd_id ? `srd:${r.srd_id}` : null;

export function parseRef(ref: string): { srdId: string | null; itemId: string | null } {
  if (/^srd:(2014|2024):[a-z0-9-]+$/.test(ref)) return { srdId: ref.slice(4), itemId: null };
  if (/^item:[0-9a-f-]{36}$/.test(ref)) return { srdId: null, itemId: ref.slice(5) };
  return { srdId: null, itemId: null };
}

/** Rarity colour class (a word, never colour alone: the rarity is always written out too). */
export function rarityTone(r: string | null | undefined) {
  const x = (r ?? "").toLowerCase();
  if (x.startsWith("legendary") || x.startsWith("artifact")) return "text-[#e0913a]";
  if (x.startsWith("very rare")) return "text-[#b9a6f0]";
  if (x.startsWith("rare")) return "text-[#8fb8f0]";
  if (x.startsWith("uncommon")) return "text-[#9fd49a]";
  return "text-muted";
}
