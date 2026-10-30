"use client";
// The items hub. Everything that hands out or prices items lives here for the DM.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { LootTable, ShopSummary } from "@/lib/items-data";
import { formatCp, parsePrice, type Coins } from "@/lib/items/money";
import { KIND_LABEL, type Homebrew, type LibItem, type LogRow } from "@/lib/items/types";
import { StatusChip } from "../characters/[id]/parts/gear-tab";
import { BagIcon, EyeIcon, LockIcon, PlusIcon } from "../components/icons";
import {
  addLootRow, createCustomItem, createLootTable, createShop, deleteHomebrew, deleteLootTable, giveCoins, giveItem, giveLoot,
  removeLootRow, requestHomebrew, reviewHomebrew, rollLoot, setShopOpen, updateHomebrew, updateLootTable,
} from "./actions";
import { HomebrewForm } from "./parts/homebrew-form";
import { ItemPicker } from "./parts/item-picker";
import { BottomSheet, ErrorNote, ItemDetails, ItemMeta, RarityText, Stepper } from "./parts/ui";

type Char = { id: string; name: string; mine: boolean; claimed: boolean; coins: Coins };
type Props = { isDm: boolean; tab?: string; characters: Char[]; requests: Homebrew[]; custom: Homebrew[]; loot: LootTable[]; log: LogRow[]; shops: ShopSummary[] };
const TABS = ["requests", "give", "shops", "loot", "items", "history"] as const;
const TAB_LABEL: Record<(typeof TABS)[number], string> = { requests: "Requests", give: "Give", shops: "Shops", loot: "Loot", items: "Custom items", history: "History" };

function useAct() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<unknown>, after?: (r: unknown) => void) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r && typeof r === "object" && "error" in r) return setError((r as { error: string }).error);
      after?.(r);
      router.refresh();
    });
  };
  return { act, error, setError, pending, router };
}

export function ItemsHub(p: Props) {
  if (!p.isDm) return <PlayerHomebrew requests={p.requests} characters={p.characters} />;
  const initial = (TABS as readonly string[]).includes(p.tab ?? "") ? (p.tab as (typeof TABS)[number]) : p.requests.length ? "requests" : "give";
  return <DmHub {...p} initial={initial} />;
}

function DmHub({ initial, characters, requests, custom, loot, log, shops }: Props & { initial: (typeof TABS)[number] }) {
  const [tab, setTab] = useState(initial);
  return (
    <>
      <header>
        <Link href="/campaign" className="text-xs uppercase tracking-[0.12em] text-muted">← Campaign</Link>
        <h1 className="mt-1 font-heading text-3xl font-bold leading-tight">Items &amp; loot</h1>
        <p className="mt-1 text-sm text-muted">Give items and coins during or after a session, run shops, keep loot ready.</p>
      </header>
      <nav className="-mx-5 mt-4 flex gap-1.5 overflow-x-auto px-5 pb-1" role="tablist">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => { setTab(t); history.replaceState(null, "", `/items?tab=${t}`); }}
            className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm ${tab === t ? "border-accent bg-accent-surface font-bold text-accent" : "border-line text-soft"}`}>
            {TAB_LABEL[t]}
            {t === "requests" && requests.length > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-text">{requests.length}</span>}
          </button>
        ))}
      </nav>
      <div className="mt-4">
        {tab === "requests" && <Requests requests={requests} characters={characters} />}
        {tab === "give" && <Give characters={characters} />}
        {tab === "shops" && <Shops shops={shops} />}
        {tab === "loot" && <Loot loot={loot} characters={characters} />}
        {tab === "items" && <CustomItems items={custom} characters={characters} />}
        {tab === "history" && <History log={log} />}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ requests
function Requests({ requests, characters }: { requests: Homebrew[]; characters: Char[] }) {
  if (!requests.length) return <Empty text="No homebrew requests waiting. When a player asks for a homebrew item, it shows up here." />;
  return <ul className="flex flex-col gap-3 md:grid md:grid-cols-2">{requests.map((h, i) => <RequestCard key={h.id} h={h} i={i} who={characters.find((c) => c.id === h.forCharacter)?.name ?? h.by} />)}</ul>;
}

function RequestCard({ h, i, who }: { h: Homebrew; i: number; who: string | null }) {
  const { act, error, pending } = useAct();
  const [note, setNote] = useState("");
  return (
    <li className="animate-rise rounded-2xl border border-line bg-surface p-4" style={{ "--i": i } as React.CSSProperties}>
      <p className="text-xs text-muted">{who ? `${who} asks` : "A player asks"} · {new Date(h.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
      <p className="mt-1 font-heading text-xl font-bold">{h.name}</p>
      <p className="text-sm text-muted">{KIND_LABEL[h.kind] ?? h.kind}{h.rarity && <> · <RarityText rarity={h.rarity} /></>}{h.attunement && " · attunement"}{h.costCp != null && ` · ${formatCp(h.costCp)}`}</p>
      {h.summary && <p className="mt-2 text-sm font-semibold text-soft">{h.summary}</p>}
      <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-soft">{h.description}</p>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Note to the player (optional)" aria-label="Note to the player"
        className="mt-3 h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm outline-none focus:border-accent" />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" disabled={pending} onClick={() => act(() => reviewHomebrew(h.id, "rejected", note))} className="h-11 rounded-xl border border-line text-sm font-semibold text-soft">Say no</button>
        <button type="button" disabled={pending} onClick={() => act(() => reviewHomebrew(h.id, "approved", note))} className="h-11 rounded-xl bg-accent text-sm font-bold text-accent-text">Approve{who ? " & give" : ""}</button>
      </div>
      <ErrorNote error={error} />
    </li>
  );
}

// ------------------------------------------------------------------ give
function WhoPicker({ characters, value, onChange }: { characters: Char[]; value: string[]; onChange: (ids: string[]) => void }) {
  const all = value.length === characters.length;
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Who gets it">
      <button type="button" aria-pressed={all} onClick={() => onChange(all ? [] : characters.map((c) => c.id))}
        className={`h-9 rounded-full border px-3 text-sm ${all ? "border-accent bg-accent-surface font-bold text-accent" : "border-line text-soft"}`}>Whole party</button>
      {characters.map((c) => {
        const on = value.includes(c.id);
        return (
          <button key={c.id} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== c.id) : [...value, c.id])}
            className={`h-9 rounded-full border px-3 text-sm ${on ? "border-accent bg-accent-surface font-bold text-accent" : "border-line text-soft"}`}>{c.name}</button>
        );
      })}
    </div>
  );
}

function Give({ characters }: { characters: Char[] }) {
  const { act, error, pending } = useAct();
  const [who, setWho] = useState<string[]>([]);
  const [mode, setMode] = useState<"item" | "coins">("item");
  const [picked, setPicked] = useState<{ item: LibItem | null; name: string } | null>(null);
  const [qty, setQty] = useState(1);
  const [amount, setAmount] = useState("");
  const [split, setSplit] = useState<"split" | "each">("split");
  const [why, setWhy] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const names = characters.filter((c) => who.includes(c.id)).map((c) => c.name).join(", ");
  const cp = parsePrice(amount) ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <section>
        <p className="text-xs uppercase tracking-[0.12em] text-muted">1 · Who gets it</p>
        <div className="mt-2"><WhoPicker characters={characters} value={who} onChange={setWho} /></div>
      </section>
      <section>
        <p className="text-xs uppercase tracking-[0.12em] text-muted">2 · What</p>
        <div className="mt-2 grid grid-cols-2 rounded-xl border border-line p-1" role="tablist">
          {(["item", "coins"] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
              className={`h-10 rounded-lg text-sm ${mode === m ? "bg-accent font-bold text-accent-text" : "text-soft"}`}>{m === "item" ? "An item" : "Coins"}</button>
          ))}
        </div>
        {mode === "item" ? (
          picked ? (
            <div className="mt-3 rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{picked.name}</p>
                  {picked.item && <ItemMeta item={picked.item} />}
                </div>
                <button type="button" onClick={() => setPicked(null)} className="inline-flex min-h-10 items-center px-1 text-sm text-muted underline">Change</button>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Stepper value={qty} onChange={setQty} max={9999} label="How many" />
                <button type="button" disabled={pending || !who.length} onClick={() => act(() => giveItem(who, picked.item?.ref ?? null, picked.name, qty), () => { setDone(`Gave ${qty > 1 ? qty + "× " : ""}${picked.name} to ${names}.`); setPicked(null); setQty(1); })}
                  className="h-11 flex-1 rounded-xl bg-accent text-sm font-bold text-accent-text">{who.length ? `Give to ${who.length === 1 ? names : who.length + " players"}` : "Pick who first"}</button>
              </div>
            </div>
          ) : <div className="mt-3"><ItemPicker rules="both" onPick={(item, name) => { setPicked({ item, name }); setQty(item?.bundle ?? 1); setDone(null); }} /></div>
        ) : (
          <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
            <label className="text-sm text-soft">Amount
              <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 120 gp or 35 gp 5 sp" className="mt-1 h-11 w-full rounded-xl border border-line bg-bg px-3 outline-none focus:border-accent" />
            </label>
            {who.length > 1 && (
              <div className="grid grid-cols-2 gap-2">
                {(["split", "each"] as const).map((m) => (
                  <button key={m} type="button" aria-pressed={split === m} onClick={() => setSplit(m)}
                    className={`h-10 rounded-xl border text-sm ${split === m ? "border-accent bg-accent-surface font-bold text-accent" : "border-line text-soft"}`}>{m === "split" ? "Share it out" : "Each gets it"}</button>
                ))}
              </div>
            )}
            <input value={why} onChange={(e) => setWhy(e.target.value)} maxLength={80} placeholder="Why (optional): reward from the Abbess" aria-label="Why"
              className="h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm outline-none focus:border-accent" />
            {cp > 0 && who.length > 1 && <p className="text-xs text-muted">{split === "split" ? `About ${formatCp(Math.floor(cp / who.length))} each.` : `${formatCp(cp * who.length)} in total.`}</p>}
            <button type="button" disabled={pending || !who.length || cp <= 0} onClick={() => act(() => giveCoins(who, cp, who.length > 1 ? split : "each", why), () => { setDone(`Gave ${formatCp(cp)}${who.length > 1 ? (split === "split" ? " shared between " : " each to ") : " to "}${names}.`); setAmount(""); setWhy(""); })}
              className="h-12 rounded-xl bg-accent font-bold text-accent-text">Give coins</button>
          </div>
        )}
      </section>
      {done && <p className="animate-pop rounded-xl bg-success-bg px-3 py-2 text-sm text-success" role="status">{done}</p>}
      <ErrorNote error={error} />
      <p className="text-xs text-muted">Works during a session and after it. Players see what they got in their Gear tab.</p>
    </div>
  );
}

// ------------------------------------------------------------------ shops
function Shops({ shops }: { shops: ShopSummary[] }) {
  const { act, error, pending, router } = useAct();
  const [name, setName] = useState("");
  return (
    <div className="flex flex-col gap-3">
      {shops.length === 0 && <Empty text="No shops yet. Shops stay secret until you open them for the players." />}
      <ul className="flex flex-col gap-2">
        {shops.map((s, i) => (
          <li key={s.id} className="animate-rise flex items-stretch gap-2" style={{ "--i": i } as React.CSSProperties}>
            <Link href={`/shop/${s.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-line bg-surface p-3">
              <BagIcon className="h-6 w-6 shrink-0 text-accent" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{s.name}</span>
                <span className="block text-xs text-muted">{s.stock} item{s.stock === 1 ? "" : "s"}{s.keeper ? ` · ${s.keeper}` : ""}{s.pricePct !== 100 ? ` · ${s.pricePct}% prices` : ""}</span>
              </span>
              <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${s.isOpen ? "bg-success-bg text-success" : "bg-bg text-muted"}`}>
                {s.isOpen ? <EyeIcon className="h-3 w-3" /> : <LockIcon className="h-3 w-3" />}{s.isOpen ? "Open" : "Secret"}
              </span>
            </Link>
            <button type="button" disabled={pending} onClick={() => act(() => setShopOpen(s.id, !s.isOpen))} aria-label={s.isOpen ? `Close ${s.name}` : `Open ${s.name}`}
              className={`w-20 shrink-0 rounded-2xl text-xs font-bold ${s.isOpen ? "border border-line text-soft" : "bg-accent text-accent-text"}`}>{s.isOpen ? "Close" : "Open"}</button>
          </li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); act(() => createShop(name), (r) => router.push(`/shop/${(r as { id: string }).id}`)); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="New shop name" aria-label="New shop name"
          className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 outline-none focus:border-accent" />
        <button disabled={pending || !name.trim()} className="flex h-12 items-center gap-1 rounded-xl bg-accent px-4 font-bold text-accent-text"><PlusIcon className="h-5 w-5" />Shop</button>
      </form>
      <ErrorNote error={error} />
      <p className="text-xs text-muted">Open shops close by themselves when you end the session.</p>
    </div>
  );
}

// ------------------------------------------------------------------ loot
function Loot({ loot, characters }: { loot: LootTable[]; characters: Char[] }) {
  const { act, error, pending } = useAct();
  const [name, setName] = useState("");
  return (
    <div className="flex flex-col gap-3">
      {loot.length === 0 && <Empty text="No loot tables yet. Make one per fight or treasure chest, then hand it out in one tap (or roll a random item from it)." />}
      {loot.map((t, i) => <LootCard key={t.id} t={t} i={i} characters={characters} />)}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); act(() => createLootTable(name), () => setName("")); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="New loot table (e.g. Ogre's sack)" aria-label="New loot table name"
          className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 outline-none focus:border-accent" />
        <button disabled={pending || !name.trim()} className="flex h-12 items-center gap-1 rounded-xl bg-accent px-4 font-bold text-accent-text"><PlusIcon className="h-5 w-5" />Table</button>
      </form>
      <ErrorNote error={error} />
    </div>
  );
}

function LootCard({ t, i, characters }: { t: LootTable; i: number; characters: Char[] }) {
  const { act, error, pending } = useAct();
  const [adding, setAdding] = useState(false);
  const [coins, setCoins] = useState(t.coinsCp ? formatCp(t.coinsCp) : "");
  const [to, setTo] = useState(characters[0]?.id ?? "");
  const [rolled, setRolled] = useState<{ rowId: string; name: string; qty: number; roll: number; of: number } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const total = t.rows.reduce((s, r) => s + r.weight, 0);
  const toName = characters.find((c) => c.id === to)?.name ?? "";
  const party = characters.filter((c) => c.claimed).map((c) => c.id);

  return (
    <section className="animate-rise rounded-2xl border border-line bg-surface p-4" style={{ "--i": i } as React.CSSProperties} aria-label={t.name}>
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 font-heading text-xl font-bold">{t.name}</p>
        <button type="button" onClick={() => (sure ? act(() => deleteLootTable(t.id)) : setSure(true))} className={`text-xs ${sure ? "font-bold text-danger" : "text-muted underline"}`}>{sure ? "Sure? Delete" : "Delete"}</button>
      </div>
      <ul className="mt-2 divide-y divide-line">
        {t.rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px]">{r.qty > 1 && <b>{r.qty}× </b>}{r.name}</span>
              {r.item && <ItemMeta item={{ ...r.item, rules: null }} />}
            </span>
            {t.rows.length > 1 && <span className="shrink-0 text-xs text-muted">{Math.round((r.weight / total) * 100)}%</span>}
            <button type="button" disabled={pending || !to} onClick={() => act(() => giveLoot({ rowId: r.id, itemsTo: to }), () => setDone(`${r.name} → ${toName}`))}
              className="h-8 shrink-0 rounded-lg border border-line px-2 text-xs text-soft" aria-label={`Give ${r.name}`}>Give</button>
            <button type="button" disabled={pending} onClick={() => act(() => removeLootRow(r.id))} className="h-8 w-8 shrink-0 text-muted" aria-label={`Remove ${r.name}`}>×</button>
          </li>
        ))}
        {t.rows.length === 0 && <li className="py-2 text-sm text-muted">No items yet.</li>}
      </ul>
      <button type="button" onClick={() => setAdding(true)} className="mt-1 flex items-center gap-1 text-sm font-semibold text-accent"><PlusIcon className="h-4 w-4" />Add item</button>
      <label className="mt-3 flex items-center gap-2 text-sm text-soft">Coins
        <input value={coins} onChange={(e) => setCoins(e.target.value)} onBlur={() => act(() => updateLootTable(t.id, { coinsCp: parsePrice(coins) ?? 0 }))} placeholder="e.g. 40 gp"
          className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 outline-none focus:border-accent" />
      </label>

      <div className="mt-3 border-t border-line pt-3">
        <label className="flex items-center gap-2 text-sm text-soft">Give to
          <select value={to} onChange={(e) => setTo(e.target.value)} className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-bg px-2 outline-none">
            {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" disabled={pending || !t.rows.length} onClick={() => act(() => rollLoot(t.id), (r) => setRolled(r as typeof rolled))}
            className="h-11 rounded-xl border border-line text-sm font-semibold text-soft">Roll one item</button>
          <button type="button" disabled={pending || (!t.rows.length && !t.coinsCp)} onClick={() => act(() => giveLoot({ tableId: t.id, itemsTo: to, coinsTo: party.length ? party : [to] }), () => setDone(`Everything → ${toName}${t.coinsCp ? `, ${formatCp(t.coinsCp)} shared by the party` : ""}`))}
            className="h-11 rounded-xl bg-accent text-sm font-bold text-accent-text">Give it all</button>
        </div>
        {rolled && (
          <div className="animate-pop mt-2 flex items-center gap-2 rounded-xl bg-accent-surface px-3 py-2">
            <span className="min-w-0 flex-1 text-sm">Rolled {rolled.roll} of {rolled.of}: <b>{rolled.qty > 1 ? `${rolled.qty}× ` : ""}{rolled.name}</b></span>
            <button type="button" disabled={pending} onClick={() => act(() => giveLoot({ rowId: rolled.rowId, itemsTo: to }), () => { setDone(`${rolled.name} → ${toName}`); setRolled(null); })}
              className="h-9 rounded-lg bg-accent px-3 text-xs font-bold text-accent-text">Give to {toName}</button>
          </div>
        )}
        {done && <p className="animate-pop mt-2 rounded-xl bg-success-bg px-3 py-2 text-sm text-success" role="status">Given: {done}</p>}
        <ErrorNote error={error} />
      </div>

      {adding && <AddLootSheet onClose={() => setAdding(false)} onAdd={(item, name, qty, weight) => act(() => addLootRow(t.id, item?.ref ?? null, name, qty, weight), () => setAdding(false))} pending={pending} error={error} />}
    </section>
  );
}

function AddLootSheet({ onClose, onAdd, pending, error }: { onClose: () => void; onAdd: (item: LibItem | null, name: string, qty: number, weight: number) => void; pending: boolean; error: string | null }) {
  const [picked, setPicked] = useState<{ item: LibItem | null; name: string } | null>(null);
  const [qty, setQty] = useState(1);
  const [weight, setWeight] = useState(1);
  return (
    <BottomSheet title={picked ? picked.name : "Add loot"} onClose={onClose}>
      {!picked ? <ItemPicker rules="both" autoFocus onPick={(item, name) => setPicked({ item, name })} /> : (
        <div>
          <ItemDetails itemRef={picked.item?.ref ?? null} fallbackName={picked.name} />
          <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4">
            <div className="flex items-center justify-between gap-2"><span className="text-sm text-soft">How many</span><Stepper value={qty} onChange={setQty} max={9999} label="How many" /></div>
            <div className="flex items-center justify-between gap-2"><span className="text-sm text-soft">Chance when rolling<br /><span className="text-xs text-muted">higher = more likely</span></span><Stepper value={weight} onChange={setWeight} max={100} label="Chance" /></div>
            <button type="button" disabled={pending} onClick={() => onAdd(picked.item, picked.name, qty, weight)} className="h-12 rounded-xl bg-accent font-bold text-accent-text">Add to the table</button>
            <button type="button" onClick={() => setPicked(null)} className="text-sm text-muted underline">← Back to search</button>
            <ErrorNote error={error} />
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

// ------------------------------------------------------------------ custom items
function CustomItems({ items, characters }: { items: Homebrew[]; characters: Char[] }) {
  const { act, error, pending, router } = useAct();
  const [open, setOpen] = useState<Homebrew | "new" | null>(null);
  const [editing, setEditing] = useState(false);
  const [who, setWho] = useState<string[]>([]);
  const close = () => { setOpen(null); setEditing(false); setWho([]); };
  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={() => setOpen("new")} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-accent font-bold text-accent-text"><PlusIcon className="h-5 w-5" />New custom item</button>
      {items.length === 0 ? <Empty text="Your own items live here: a cursed crown, a family sword, a strange key. They stay secret until you give them or put them in an open shop." /> : (
        <ul className="flex flex-col gap-1.5">
          {items.map((h, i) => (
            <li key={h.id} className="animate-rise" style={{ "--i": Math.min(i, 8) } as React.CSSProperties}>
              <button type="button" onClick={() => setOpen(h)} className="flex w-full items-center gap-3 rounded-xl bg-surface px-4 py-2.5 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{h.name}</span>
                  <span className="block truncate text-xs text-muted">{h.source === "player" ? `Homebrew by ${h.by ?? "a player"}` : KIND_LABEL[h.kind] ?? h.kind}{h.rarity && <> · <RarityText rarity={h.rarity} /></>}</span>
                </span>
                {h.source === "player" && <StatusChip status={h.status} />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open === "new" && (
        <BottomSheet title="New custom item" onClose={close}>
          <HomebrewForm submitLabel="Make item" note="Only you can see it until you give it to someone or sell it in an open shop."
            onSubmit={async (f) => { const r = await createCustomItem(f); if (!("error" in r)) { close(); router.refresh(); } return r; }} onCancel={close} />
        </BottomSheet>
      )}
      {open && open !== "new" && (
        <BottomSheet title={open.name} onClose={close}>
          {editing ? (
            <HomebrewForm initial={open} submitLabel="Save" onSubmit={async (f) => { const r = await updateHomebrew(open.id, f); if (!("error" in r)) { close(); router.refresh(); } return r; }} onCancel={() => setEditing(false)} />
          ) : (
            <>
              {open.status === "rejected" && <p className="mb-3 rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">You said no{open.dmNote ? `: ${open.dmNote}` : "."}</p>}
              <ItemDetails itemRef={`item:${open.id}`} />
              {open.status === "approved" && (
                <div className="mt-5 border-t border-line pt-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted">Give it to</p>
                  <div className="mt-2"><WhoPicker characters={characters} value={who} onChange={setWho} /></div>
                  <button type="button" disabled={pending || !who.length} onClick={() => act(() => giveItem(who, `item:${open.id}`, open.name, 1), close)} className="mt-3 h-12 w-full rounded-xl bg-accent font-bold text-accent-text">Give</button>
                </div>
              )}
              {open.status === "rejected" && <button type="button" disabled={pending} onClick={() => act(() => reviewHomebrew(open.id, "approved", ""), close)} className="mt-4 h-11 w-full rounded-xl border border-line text-sm font-semibold text-soft">Approve after all</button>}
              <div className="mt-4 flex justify-between text-sm">
                <button type="button" onClick={() => setEditing(true)} className="text-accent underline">Edit</button>
                <button type="button" disabled={pending} onClick={() => act(() => deleteHomebrew(open.id), close)} className="text-muted underline">Delete item</button>
              </div>
              <ErrorNote error={error} />
            </>
          )}
        </BottomSheet>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ history
function History({ log }: { log: LogRow[] }) {
  if (!log.length) return <Empty text="Nothing yet. Every item given, bought or removed and every coin change shows up here." />;
  return (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
      {log.map((l) => (
        <li key={l.id} className="flex gap-3 px-4 py-2.5 text-sm">
          <span className="w-16 shrink-0 text-xs text-muted">{new Date(l.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
          <span className="min-w-0 flex-1"><b className="font-semibold">{l.character ?? "Party"}</b> <span className="text-soft">{l.text}</span></span>
          {l.cpDelta ? <span className={`shrink-0 text-xs font-semibold ${l.cpDelta > 0 ? "text-success" : "text-danger"}`}>{l.cpDelta > 0 ? "+" : "−"}{formatCp(Math.abs(l.cpDelta))}</span> : null}
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ players
function PlayerHomebrew({ requests, characters }: { requests: Homebrew[]; characters: Char[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<Homebrew | "new" | null>(null);
  const me = characters[0];
  const close = () => setOpen(null);
  return (
    <>
      <header>
        <Link href={me ? `/characters/${me.id}` : "/campaign"} className="text-xs uppercase tracking-[0.12em] text-muted">← {me ? me.name : "Campaign"}</Link>
        <h1 className="mt-1 font-heading text-3xl font-bold leading-tight">Homebrew items</h1>
        <p className="mt-1 text-sm text-muted">Invent an item and send it to your DM. Once approved it goes straight into your gear.</p>
      </header>
      <button type="button" onClick={() => setOpen("new")} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent font-bold text-accent-text"><PlusIcon className="h-5 w-5" />New homebrew item</button>
      <ul className="mt-4 flex flex-col gap-2">
        {requests.map((h) => (
          <li key={h.id}>
            <button type="button" onClick={() => setOpen(h)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left">
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{h.name}</span>{h.dmNote && <span className="block truncate text-xs text-muted">DM: {h.dmNote}</span>}</span>
              <StatusChip status={h.status} />
            </button>
          </li>
        ))}
        {requests.length === 0 && <Empty text="You haven't made any homebrew items yet." />}
      </ul>
      {open && (
        <BottomSheet title={open === "new" ? "New homebrew item" : open.name} onClose={close}>
          {open !== "new" && open.status === "approved" ? <ItemDetails itemRef={`item:${open.id}`} /> : (
            <>
              {open !== "new" && open.status === "rejected" && <p className="mb-3 rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">Not approved{open.dmNote ? `: ${open.dmNote}` : "."}</p>}
              <HomebrewForm initial={open === "new" ? undefined : open} submitLabel={open === "new" ? "Ask the DM" : "Send to the DM again"}
                onSubmit={async (f) => { const r = open === "new" ? await requestHomebrew(me?.id ?? null, f) : await updateHomebrew(open.id, f); if (!("error" in r)) { close(); router.refresh(); } return r; }} onCancel={close} />
            </>
          )}
        </BottomSheet>
      )}
    </>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-line p-5 text-center text-sm text-muted">{text}</p>;
}
