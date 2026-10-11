"use client";
// Shop screen. Players pick a character and buy (coins are paid and change is given automatically).
// The DM stocks the shop, sets prices, and opens it for the players when the party walks in.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { StockRow } from "@/lib/items-data";
import { formatCp, magicPrice, parsePrice, type Coins } from "@/lib/items/money";
import type { LibItem } from "@/lib/items/types";
import { BagIcon, EyeIcon, LockIcon, PlusIcon } from "../../components/icons";
import { addStock, buy, deleteShop, removeStock, setShopOpen, updateShop, updateStock } from "../../items/actions";
import { ItemPicker } from "../../items/parts/item-picker";
import { BottomSheet, CoinsRow, ErrorNote, ItemDetails, ItemMeta, Stepper } from "../../items/parts/ui";

type Buyer = { id: string; name: string; coins: Coins; mine: boolean };
type Shop = { id: string; name: string; keeper: string | null; blurb: string | null; isOpen: boolean; pricePct: number };
type Sheet = { kind: "stock"; row: StockRow } | { kind: "add" } | { kind: "edit" } | null;

const priceOf = (row: StockRow, pct: number) => Math.round((row.priceCp * pct) / 100);

export function ShopView({ isDm, shop, stock, buyers }: { isDm: boolean; shop: Shop; stock: StockRow[]; buyers: Buyer[] }) {
  const router = useRouter();
  const [buyerId, setBuyerId] = useState(buyers.find((b) => b.mine)?.id ?? buyers[0]?.id ?? null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ text: string; n: number } | null>(null);
  const [pending, start] = useTransition();
  const buyer = buyers.find((b) => b.id === buyerId) ?? null;
  const close = () => { setSheet(null); setError(null); };

  function act(fn: () => Promise<{ error: string } | unknown>, after?: (r: unknown) => void) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r && typeof r === "object" && "error" in r) return setError((r as { error: string }).error);
      after?.(r);
      router.refresh();
    });
  }

  return (
    <>
      <header>
        <Link href={isDm ? "/items?tab=shops" : "/session"} className="text-xs uppercase tracking-[0.12em] text-muted">← {isDm ? "Shops" : "Session"}</Link>
        <div className="mt-1 flex items-start gap-3">
          <BagIcon className="mt-1 h-8 w-8 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-3xl font-bold leading-tight">{shop.name}</h1>
            {shop.keeper && <p className="text-sm text-soft">Run by {shop.keeper}</p>}
          </div>
          {isDm && (
            <span className={`mt-1 flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${shop.isOpen ? "bg-success-bg text-success" : "bg-surface text-muted"}`}>
              {shop.isOpen ? <EyeIcon className="h-3.5 w-3.5" /> : <LockIcon className="h-3.5 w-3.5" />}{shop.isOpen ? "Open" : "Secret"}
            </span>
          )}
        </div>
        {shop.blurb && <p className="mt-2 text-sm text-soft">{shop.blurb}</p>}
      </header>

      {isDm && (
        <section className="mt-4 rounded-2xl border border-line bg-surface p-3">
          <p className="text-sm text-soft">
            {shop.isOpen ? "Players can see this shop and buy from it right now." : "Only you can see this shop. Open it when the party walks in."}
            {shop.pricePct !== 100 && <> Prices are at <b>{shop.pricePct}%</b>.</>}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" disabled={pending} onClick={() => act(() => setShopOpen(shop.id, !shop.isOpen))}
              className={`h-11 rounded-xl text-sm font-bold ${shop.isOpen ? "border border-line text-soft" : "bg-accent text-accent-text"}`}>
              {shop.isOpen ? "Close shop" : "Open for players"}
            </button>
            <button type="button" onClick={() => setSheet({ kind: "edit" })} className="h-11 rounded-xl border border-line text-sm font-semibold text-soft">Shop details</button>
          </div>
        </section>
      )}

      {!isDm && !shop.isOpen && <p className="mt-4 rounded-xl bg-surface px-3 py-2 text-sm text-muted">This shop is closed.</p>}

      {buyers.length > 0 && shop.isOpen && (
        <section className="mt-5" aria-label="Your purse">
          {buyers.length > 1 && (
            <div className="mb-2 flex gap-1.5 overflow-x-auto" role="radiogroup" aria-label="Buying for">
              {buyers.map((b) => (
                <button key={b.id} type="button" role="radio" aria-checked={b.id === buyerId} onClick={() => setBuyerId(b.id)}
                  className={`h-9 shrink-0 rounded-full border px-3 text-sm ${b.id === buyerId ? "border-accent bg-accent-surface font-bold text-accent" : "border-line text-soft"}`}>{b.name}</button>
              ))}
            </div>
          )}
          {buyer && (
            <>
              <p className="text-xs uppercase tracking-[0.12em] text-muted">{buyer.name}&apos;s purse</p>
              <div className="mt-2"><CoinsRow coins={buyer.coins} bump={done?.n} /></div>
            </>
          )}
        </section>
      )}
      {done && <p className="animate-pop mt-3 rounded-xl bg-success-bg px-3 py-2 text-sm text-success" role="status">{done.text}</p>}

      <section className="mt-5" aria-label="For sale">
        <div className="flex items-baseline justify-between">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">For sale</p>
          {isDm && <button type="button" onClick={() => setSheet({ kind: "add" })} className="flex items-center gap-1 text-sm font-semibold text-accent"><PlusIcon className="h-4 w-4" />Add items</button>}
        </div>
        {stock.length === 0 ? (
          <p className="mt-2 rounded-2xl border border-dashed border-line p-5 text-center text-sm text-muted">{isDm ? "Nothing for sale yet. Add items from the library or your own." : "The shelves are empty."}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {stock.map((r, i) => {
              const out = r.qty === 0;
              return (
                <li key={r.id} className="animate-rise" style={{ "--i": Math.min(i, 8) } as React.CSSProperties}>
                  <button type="button" onClick={() => setSheet({ kind: "stock", row: r })} className={`flex w-full items-center gap-3 rounded-xl bg-surface px-4 py-2.5 text-left ${out ? "opacity-60" : ""}`}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{r.name}{r.bundle ? <span className="font-normal text-muted"> ×{r.bundle}</span> : null}</span>
                      {r.item && <ItemMeta item={{ ...r.item, rules: null }} />}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-bold">{formatCp(priceOf(r, shop.pricePct))}</span>
                      <span className="block text-[11px] text-muted">{out ? "Sold out" : r.qty != null ? `${r.qty} left` : ""}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {isDm && <p className="mt-6 text-center text-xs text-muted">Players never see secret shops, prices or stock until you open the shop.</p>}

      {sheet?.kind === "stock" && (
        <StockSheet row={sheet.row} pct={shop.pricePct} isDm={isDm} buyer={shop.isOpen ? buyer : null} pending={pending} error={error} onClose={close}
          onBuy={(qty) => act(() => buy(sheet.row.id, buyer!.id, qty), (r) => {
            const paid = (r as { paid: number }).paid;
            setDone({ text: `${buyer!.name} bought ${qty > 1 ? qty + "× " : ""}${sheet.row.name} for ${formatCp(paid)}. It's in the Gear tab.`, n: Date.now() });
            close();
          })}
          onSave={(p) => act(() => updateStock(sheet.row.id, p), close)}
          onRemove={() => act(() => removeStock(sheet.row.id), close)} />
      )}
      {sheet?.kind === "add" && <AddStockSheet pending={pending} error={error} onClose={close} onAdd={(item, name, price, qty) => act(() => addStock(shop.id, item?.ref ?? null, name, price, qty), close)} />}
      {sheet?.kind === "edit" && (
        <EditShopSheet shop={shop} pending={pending} error={error} onClose={close}
          onSave={(p) => act(() => updateShop(shop.id, p), close)}
          onDelete={() => act(() => deleteShop(shop.id), () => router.push("/items?tab=shops"))} />
      )}
    </>
  );
}

function StockSheet({ row, pct, isDm, buyer, pending, error, onClose, onBuy, onSave, onRemove }: {
  row: StockRow; pct: number; isDm: boolean; buyer: Buyer | null; pending: boolean; error: string | null; onClose: () => void;
  onBuy: (qty: number) => void; onSave: (p: { priceCp?: number; qty?: number | null }) => void; onRemove: () => void;
}) {
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(formatCp(row.priceCp).replace("Free", "0"));
  const [left, setLeft] = useState(row.qty == null ? "" : String(row.qty));
  const each = priceOf(row, pct);
  const max = Math.max(1, Math.min(999, row.qty ?? 999));
  return (
    <BottomSheet title={row.name} onClose={onClose}>
      <ItemDetails itemRef={row.ref} fallbackName={row.name} />
      {buyer && row.qty !== 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <div className="flex items-center gap-2">
            <Stepper value={qty} onChange={setQty} min={1} max={max} label="How many" />
            <button type="button" disabled={pending} onClick={() => onBuy(qty)} className="h-11 flex-1 rounded-xl bg-accent font-bold text-accent-text">
              {pending ? "Buying…" : `Buy for ${formatCp(each * qty)}`}
            </button>
          </div>
          {row.bundle ? <p className="mt-2 text-xs text-muted">Each one is a bundle of {row.bundle}.</p> : null}
        </div>
      )}
      {isDm && (
        <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">DM: price and stock</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm text-soft">Price<input value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-line bg-bg px-3 outline-none focus:border-accent" /></label>
            <label className="text-sm text-soft">In stock<input value={left} onChange={(e) => setLeft(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Unlimited" className="mt-1 h-11 w-full rounded-xl border border-line bg-bg px-3 outline-none focus:border-accent" /></label>
          </div>
          <button type="button" disabled={pending} onClick={() => { const p = parsePrice(price); onSave({ priceCp: p ?? row.priceCp, qty: left === "" ? null : Number(left) }); }}
            className="h-11 rounded-xl border border-line text-sm font-semibold text-soft">Save</button>
          <button type="button" disabled={pending} onClick={onRemove} className="text-sm text-muted underline">Take it off the shelf</button>
        </div>
      )}
      <ErrorNote error={error} />
    </BottomSheet>
  );
}

function AddStockSheet({ pending, error, onClose, onAdd }: {
  pending: boolean; error: string | null; onClose: () => void; onAdd: (item: LibItem | null, name: string, priceCp: number | null, qty: number | null) => void;
}) {
  const [picked, setPicked] = useState<{ item: LibItem | null; name: string } | null>(null);
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");
  function pick(item: LibItem | null, name: string) {
    setPicked({ item, name });
    const suggested = item?.costCp ?? (item?.kind === "magic" || item?.custom ? magicPrice(item.rarity, /potion|scroll/i.test(item.name)) : null);
    setPrice(suggested != null ? formatCp(suggested).replace("Free", "0") : "");
  }
  return (
    <BottomSheet title={picked ? picked.name : "Add to the shop"} onClose={onClose}>
      {!picked ? <ItemPicker rules="both" autoFocus onPick={pick} /> : (
        <div>
          <ItemDetails itemRef={picked.item?.ref ?? null} fallbackName={picked.name} />
          <div className="mt-5 grid grid-cols-2 gap-2 border-t border-line pt-4">
            <label className="text-sm text-soft">Price<input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 50 gp" autoFocus className="mt-1 h-11 w-full rounded-xl border border-line bg-bg px-3 outline-none focus:border-accent" /></label>
            <label className="text-sm text-soft">How many<input value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Unlimited" className="mt-1 h-11 w-full rounded-xl border border-line bg-bg px-3 outline-none focus:border-accent" /></label>
          </div>
          {picked.item?.kind === "magic" && <p className="mt-2 text-xs text-muted">Suggested price from the item&apos;s rarity. Change it to anything you like.</p>}
          <button type="button" disabled={pending} onClick={() => onAdd(picked.item, picked.name, parsePrice(price), qty === "" ? null : Number(qty))}
            className="mt-3 h-12 w-full rounded-xl bg-accent font-bold text-accent-text">{pending ? "Adding…" : "Put it on the shelf"}</button>
          <button type="button" onClick={() => setPicked(null)} className="mt-3 text-sm text-muted underline">← Back to search</button>
          <ErrorNote error={error} />
        </div>
      )}
    </BottomSheet>
  );
}

function EditShopSheet({ shop, pending, error, onClose, onSave, onDelete }: {
  shop: Shop; pending: boolean; error: string | null; onClose: () => void;
  onSave: (p: { name: string; keeper: string; blurb: string; pricePct: number }) => void; onDelete: () => void;
}) {
  const [name, setName] = useState(shop.name);
  const [keeper, setKeeper] = useState(shop.keeper ?? "");
  const [blurb, setBlurb] = useState(shop.blurb ?? "");
  const [pct, setPct] = useState(shop.pricePct);
  const [sure, setSure] = useState(false);
  const f = "mt-1 h-11 w-full rounded-xl border border-line bg-bg px-3 outline-none focus:border-accent";
  return (
    <BottomSheet title="Shop details" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="text-sm text-soft">Name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={f} /></label>
        <label className="text-sm text-soft">Shopkeeper<input value={keeper} onChange={(e) => setKeeper(e.target.value)} maxLength={80} className={f} placeholder="Pell the fence" /></label>
        <label className="text-sm text-soft">What players see<textarea value={blurb} onChange={(e) => setBlurb(e.target.value)} maxLength={500} rows={3} className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 outline-none focus:border-accent" placeholder="A cramped pawn shop that smells of oil and old rope." /></label>
        <div>
          <p className="text-sm text-soft">Prices: <b>{pct}%</b> {pct > 100 ? "(expensive)" : pct < 100 ? "(a bargain)" : "(normal)"}</p>
          <input type="range" min={50} max={300} step={10} value={pct} onChange={(e) => setPct(Number(e.target.value))} aria-label="Price level" className="mt-2 w-full accent-[#e0913a]" />
        </div>
        <button type="button" disabled={pending} onClick={() => onSave({ name, keeper, blurb, pricePct: pct })} className="h-12 rounded-xl bg-accent font-bold text-accent-text">Save</button>
        <button type="button" disabled={pending} onClick={() => (sure ? onDelete() : setSure(true))} className={`h-11 rounded-xl text-sm ${sure ? "bg-danger-bg font-semibold text-danger" : "text-muted underline"}`}>{sure ? "Yes, delete this shop" : "Delete shop"}</button>
        <ErrorNote error={error} />
      </div>
    </BottomSheet>
  );
}
