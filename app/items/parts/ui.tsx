"use client";
// Small building blocks for items: a bottom sheet, item rows, the item details card, coins.
import { useEffect, useState } from "react";
import { COIN_KEYS, formatCp, type Coins } from "@/lib/items/money";
import { KIND_LABEL, rarityTone, type ItemInfo, type ItemRef, type LibItem } from "@/lib/items/types";
import { itemInfo } from "../actions";

/** A panel that slides up from the bottom. Closes with Esc or a tap outside. */
export function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-black/60 md:items-center md:p-8 animate-[fade-in_180ms_ease-out]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className="animate-sheet flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-[22px] border border-b-0 border-line bg-surface-2 pb-[env(safe-area-inset-bottom)] md:max-h-[80dvh] md:max-w-xl md:rounded-[22px] md:border-b md:pb-0">
        <div className="flex items-center gap-3 border-b border-line px-5 py-3">
          <p className="min-w-0 flex-1 truncate font-heading text-lg font-bold">{title}</p>
          <button type="button" onClick={onClose} className="h-9 rounded-lg bg-surface px-3 text-sm text-soft">Close</button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function RarityText({ rarity, className = "" }: { rarity: string | null | undefined; className?: string }) {
  if (!rarity) return null;
  return <span className={`${rarityTone(rarity)} ${className}`}>{rarity}</span>;
}

/** One line about an item: kind · rarity · summary. */
export function ItemMeta({ item }: { item: Pick<LibItem, "kind" | "rarity" | "summary" | "attunement" | "custom" | "rules"> }) {
  return (
    <span className="block truncate text-xs text-muted">
      {item.custom ? "Homebrew" : KIND_LABEL[item.kind] ?? item.kind}
      {item.rarity && <> · <RarityText rarity={item.rarity} /></>}
      {item.attunement && " · attunement"}
      {item.summary && item.kind !== "magic" && ` · ${item.summary}`}
      {item.rules && <span className="ml-1 rounded border border-line px-1 text-[10px]">{item.rules}</span>}
    </span>
  );
}

/** The full card for an item (loads its text when opened). */
export function ItemDetails({ itemRef, fallbackName, children }: { itemRef: ItemRef | null; fallbackName?: string; children?: React.ReactNode }) {
  const [info, setInfo] = useState<ItemInfo | null | undefined>(itemRef ? undefined : null);
  useEffect(() => {
    let live = true;
    if (itemRef) itemInfo(itemRef).then((i) => live && setInfo(i)).catch(() => live && setInfo(null));
    return () => { live = false; };
  }, [itemRef]);
  if (info === undefined) return <div className="animate-pulse space-y-2"><div className="h-5 w-40 rounded bg-surface" /><div className="h-20 rounded bg-surface" /></div>;
  if (!info) return (
    <div>
      <p className="text-sm text-muted">{fallbackName ? `“${fallbackName}” was written in by hand, so there's no rules text for it.` : "No details for this item."}</p>
      {children}
    </div>
  );
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.12em] text-muted">
        {info.custom ? (info.status === "approved" ? "Homebrew" : "Homebrew · waiting for the DM") : `${info.category ?? KIND_LABEL[info.kind]} · ${info.rules} rules`}
      </p>
      {info.rarity && <p className="mt-1 text-sm"><RarityText rarity={info.rarity} />{info.attunement && <span className="text-muted"> · requires attunement</span>}</p>}
      {info.summary && <p className="mt-2 text-sm font-semibold text-soft">{info.summary}</p>}
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {info.costCp != null && <div><dt className="inline text-muted">Price </dt><dd className="inline">{formatCp(info.costCp)}{info.bundle ? ` for ${info.bundle}` : ""}</dd></div>}
        {info.weight != null && info.weight > 0 && <div><dt className="inline text-muted">Weight </dt><dd className="inline">{info.weight} lb</dd></div>}
      </dl>
      {info.description && (
        <div className="mt-3 space-y-2 text-[14px] leading-relaxed text-soft">
          {info.description.split(/\n+/).map((p, i) => <p key={i}>{p.replace(/\*\*/g, "").replace(/\*/g, "")}</p>)}
        </div>
      )}
      {info.contents && (
        <p className="mt-3 text-sm text-soft"><span className="text-muted">Contains: </span>{info.contents.map((c) => `${c.qty > 1 ? c.qty + " " : ""}${c.name}`).join(", ")}</p>
      )}
      {info.variants && <p className="mt-3 text-sm text-muted">Comes as: {info.variants.join(", ")}</p>}
      {!info.custom && <p className="mt-4 text-[11px] text-muted">From the System Reference Document (CC-BY-4.0).</p>}
      {children}
    </div>
  );
}

const COIN_TONE: Record<keyof Coins, string> = { pp: "text-[#d8dde6]", gp: "text-[#e8c25a]", ep: "text-[#c9c48f]", sp: "text-[#c4c9cf]", cp: "text-[#d08a5c]" };

/** The purse: five coins in a row. */
export function CoinsRow({ coins, bump }: { coins: Coins; bump?: number }) {
  return (
    <div className="grid grid-cols-5 gap-1.5" aria-label="Coins">
      {COIN_KEYS.map((k) => (
        <div key={k + (bump ?? 0)} className={`rounded-xl bg-surface px-1 py-2 text-center ${bump ? "animate-coin" : ""}`}>
          <p className={`text-lg font-bold leading-tight ${coins[k] ? COIN_TONE[k] : "text-muted"}`}>{coins[k].toLocaleString("en-US")}</p>
          <p className="text-[11px] uppercase tracking-wide text-muted">{k}</p>
        </div>
      ))}
    </div>
  );
}

/** − n + stepper. */
export function Stepper({ value, onChange, min = 1, max = 999, label }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string }) {
  return (
    <div className="flex items-center rounded-xl border border-line" role="group" aria-label={label}>
      <button type="button" aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} className="h-11 w-11 text-xl text-soft">−</button>
      <input inputMode="numeric" value={value} aria-label={label}
        onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ""), 10); onChange(Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min); }}
        className="h-11 w-12 bg-transparent text-center font-bold outline-none" />
      <button type="button" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} className="h-11 w-11 text-xl text-soft">+</button>
    </div>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  return error ? <p className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p> : null;
}
