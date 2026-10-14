"use client";
// Gear tab: coins, what you carry (equipped first), homebrew requests and a short history.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Gear } from "@/lib/items-data";
import { COIN_KEYS, COIN_NAME, formatCp, type Coins } from "@/lib/items/money";
import type { GearRow, Homebrew, LibItem } from "@/lib/items/types";
import { BagIcon, PlusIcon } from "../../../components/icons";
import { addGear, deleteHomebrew, dropGear, requestHomebrew, setAttuned, setCoins, setEquipped, setQty, unpack, updateHomebrew } from "../../../items/actions";
import { HomebrewForm } from "../../../items/parts/homebrew-form";
import { ItemPicker } from "../../../items/parts/item-picker";
import { BottomSheet, CoinsRow, ErrorNote, ItemDetails, ItemMeta, Stepper } from "../../../items/parts/ui";
import { Empty } from "./ui";

type Sheet = { kind: "item"; row: GearRow } | { kind: "add" } | { kind: "coins" } | { kind: "homebrew"; hb?: Homebrew } | null;

export function GearTab({ characterId, rules, gear, canEdit }: { characterId: string; rules: "2014" | "2024"; gear: Gear; canEdit: boolean }) {
  const router = useRouter();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [coins, setLocalCoins] = useState<Coins>(gear.coins);
  const [bump, setBump] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [seen, setSeen] = useState(gear.coins);
  if (seen !== gear.coins) { setSeen(gear.coins); setLocalCoins(gear.coins); }

  const equipped = gear.rows.filter((r) => r.equipped);
  const bag = gear.rows.filter((r) => !r.equipped);
  const attuned = gear.rows.filter((r) => r.attuned).length;
  const close = () => setSheet(null);

  function act(fn: () => Promise<{ error: string } | unknown>, after?: () => void) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r && typeof r === "object" && "error" in r) return setError((r as { error: string }).error);
      after?.();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {gear.openShops.length > 0 && (
        <div className="animate-rise rounded-2xl border border-accent-line bg-accent-surface p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-accent">Open now</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {gear.openShops.map((s) => (
              <Link key={s.id} href={`/shop/${s.id}`} className="flex h-10 items-center gap-2 rounded-xl bg-accent px-3 text-sm font-bold text-accent-text">
                <BagIcon className="h-4 w-4" />{s.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      <section aria-label="Coins">
        <div className="flex items-baseline justify-between">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">Coins</p>
          {canEdit && <button type="button" onClick={() => setSheet({ kind: "coins" })} className="text-sm text-accent underline">Change</button>}
        </div>
        <div className="mt-2"><CoinsRow coins={coins} bump={bump} /></div>
      </section>

      <GearList title="Equipped" rows={equipped} onOpen={(row) => setSheet({ kind: "item", row })} extra={attuned > 0 ? `Attuned ${attuned}/3` : undefined} />
      <GearList title={equipped.length ? "In the bag" : "Gear"} rows={bag} onOpen={(row) => setSheet({ kind: "item", row })}
        empty={equipped.length ? undefined : canEdit ? "Nothing here yet. Add what you carry." : "No gear yet."} />

      {canEdit && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setSheet({ kind: "add" })} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-bold text-accent-text">
            <PlusIcon className="h-5 w-5" />Add item
          </button>
          <button type="button" onClick={() => setSheet({ kind: "homebrew" })} className="h-12 rounded-xl border border-line text-sm font-semibold text-soft">Homebrew item</button>
        </div>
      )}
      <ErrorNote error={sheet ? null : error} />

      {gear.homebrew.length > 0 && (
        <section aria-label="Homebrew requests">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">Your homebrew</p>
          <ul className="mt-2 flex flex-col gap-2">
            {gear.homebrew.map((h) => (
              <li key={h.id}>
                <button type="button" onClick={() => setSheet({ kind: "homebrew", hb: h })} className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{h.name}</span>
                    {h.dmNote && <span className="block truncate text-xs text-muted">DM: {h.dmNote}</span>}
                  </span>
                  <StatusChip status={h.status} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {gear.log.length > 0 && (
        <details className="rounded-2xl border border-line bg-surface px-4 py-3">
          <summary className="cursor-pointer text-sm text-soft">History</summary>
          <ul className="mt-2 space-y-1.5 text-sm">
            {gear.log.map((l) => (
              <li key={l.id} className="flex gap-2">
                <span className="w-14 shrink-0 text-xs text-muted">{new Date(l.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                <span className="min-w-0 flex-1 text-soft">{l.text}</span>
                {l.cpDelta ? <span className={`shrink-0 text-xs font-semibold ${l.cpDelta > 0 ? "text-success" : "text-danger"}`}>{l.cpDelta > 0 ? "+" : "−"}{formatCp(Math.abs(l.cpDelta))}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      )}

      {sheet?.kind === "item" && (
        <ItemSheet row={sheet.row} canEdit={canEdit} attunedCount={attuned} pending={pending} error={error} onClose={close}
          onQty={(n) => act(() => setQty(sheet.row.id, n), close)}
          onEquip={(on) => act(() => setEquipped(sheet.row.id, on), close)}
          onAttune={(on) => act(() => setAttuned(sheet.row.id, on), close)}
          onUnpack={() => act(() => unpack(sheet.row.id), close)}
          onDrop={() => act(() => dropGear(sheet.row.id), close)} />
      )}
      {sheet?.kind === "add" && <AddSheet rules={rules} pending={pending} error={error} onClose={close} onAdd={(item, name, qty) => act(() => addGear(characterId, item?.ref ?? null, name, qty), close)} />}
      {sheet?.kind === "coins" && (
        <CoinsSheet coins={coins} pending={pending} error={error} onClose={close}
          onSave={(c) => act(async () => { const r = await setCoins(characterId, c); if (!("error" in r)) { setLocalCoins(r.coins); setBump((b) => b + 1); } return r; }, close)} />
      )}
      {sheet?.kind === "homebrew" && (
        <BottomSheet title={sheet.hb ? sheet.hb.name : "New homebrew item"} onClose={close}>
          {sheet.hb && sheet.hb.status === "approved" ? (
            <ItemDetails itemRef={`item:${sheet.hb.id}`}>
              <p className="mt-4 rounded-xl bg-success-bg px-3 py-2 text-sm text-success">Approved by the DM. You can add it from “Add item”.</p>
            </ItemDetails>
          ) : (
            <>
              {sheet.hb?.status === "rejected" && <p className="mb-3 rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">Not approved{sheet.hb.dmNote ? `: ${sheet.hb.dmNote}` : "."} Change it and send it again.</p>}
              <HomebrewForm initial={sheet.hb} submitLabel={sheet.hb ? "Send to the DM again" : "Ask the DM"}
                note={sheet.hb ? undefined : "Your DM has to approve a homebrew item before you can use it. You'll see their answer here."}
                onSubmit={async (f) => { const r = sheet.hb ? await updateHomebrew(sheet.hb.id, f) : await requestHomebrew(characterId, f); if (!("error" in r)) { close(); router.refresh(); } return r; }}
                onCancel={close} />
              {sheet.hb && (
                <button type="button" onClick={() => act(() => deleteHomebrew(sheet.hb!.id), close)} className="mt-3 w-full text-center text-sm text-muted underline">Withdraw this request</button>
              )}
            </>
          )}
        </BottomSheet>
      )}
    </div>
  );
}

export function StatusChip({ status }: { status: Homebrew["status"] }) {
  const s = status === "approved" ? ["Approved", "bg-success-bg text-success"] : status === "rejected" ? ["Not approved", "bg-danger-bg text-danger"] : ["Waiting for DM", "bg-accent-surface text-accent"];
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${s[1]}`}>{s[0]}</span>;
}

function GearList({ title, rows, onOpen, empty, extra }: { title: string; rows: GearRow[]; onOpen: (r: GearRow) => void; empty?: string; extra?: string }) {
  if (!rows.length && !empty) return null;
  return (
    <section aria-label={title}>
      <div className="flex items-baseline justify-between">
        <p className="text-xs uppercase tracking-[0.12em] text-muted">{title}</p>
        {extra && <p className="text-xs text-muted">{extra}</p>}
      </div>
      {rows.length === 0 ? <div className="mt-2"><Empty text={empty!} /></div> : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {rows.map((r, i) => (
            <li key={r.id} className="animate-rise" style={{ "--i": Math.min(i, 8) } as React.CSSProperties}>
              <button type="button" onClick={() => onOpen(r)} className="flex w-full items-center gap-3 rounded-xl bg-surface px-4 py-2.5 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">
                    {r.name}{r.qty > 1 && <span className="font-normal text-muted"> ×{r.qty}</span>}
                  </span>
                  {r.ref ? <ItemMeta item={{ kind: r.kind, rarity: r.rarity, summary: r.summary, attunement: false, custom: r.custom, rules: null }} />
                    : r.note ? <span className="block truncate text-xs text-muted">{r.note}</span> : null}
                </span>
                {r.attuned && <span className="shrink-0 rounded-full bg-accent-surface px-2 py-0.5 text-[10px] font-bold text-accent">Attuned</span>}              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ItemSheet({ row, canEdit, attunedCount, pending, error, onClose, onQty, onEquip, onAttune, onUnpack, onDrop }: {
  row: GearRow; canEdit: boolean; attunedCount: number; pending: boolean; error: string | null; onClose: () => void;
  onQty: (n: number) => void; onEquip: (on: boolean) => void; onAttune: (on: boolean) => void; onUnpack: () => void; onDrop: () => void;
}) {
  const [qty, setQ] = useState(row.qty);
  const [sure, setSure] = useState(false);
  return (
    <BottomSheet title={row.name} onClose={onClose}>
      <ItemDetails itemRef={row.ref} fallbackName={row.name} />
      {canEdit && (
        <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4">
          <div className="flex items-center gap-2">
            <Stepper value={qty} onChange={setQ} min={1} max={99999} label="How many" />
            <button type="button" disabled={pending || qty === row.qty} onClick={() => onQty(qty)} className="h-11 flex-1 rounded-xl border border-line text-sm font-semibold text-soft">Save amount</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={pending} onClick={() => onEquip(!row.equipped)} aria-pressed={row.equipped}
              className={`h-11 rounded-xl text-sm font-bold ${row.equipped ? "border border-line text-soft" : "bg-accent text-accent-text"}`}>{row.equipped ? "Unequip" : "Equip"}</button>
            {row.needsAttunement ? (
              <button type="button" disabled={pending || (!row.attuned && attunedCount >= 3)} onClick={() => onAttune(!row.attuned)} aria-pressed={row.attuned}
                className="h-11 rounded-xl border border-line text-sm font-semibold text-soft">{row.attuned ? "End attunement" : attunedCount >= 3 ? "Attuned to 3 already" : "Attune"}</button>
            ) : row.kind === "pack" ? (
              <button type="button" disabled={pending} onClick={onUnpack} className="h-11 rounded-xl border border-line text-sm font-semibold text-soft">Unpack</button>
            ) : <span />}
          </div>
          <button type="button" disabled={pending} onClick={() => (sure ? onDrop() : setSure(true))}
            className={`h-11 rounded-xl text-sm font-semibold ${sure ? "bg-danger-bg text-danger" : "text-muted underline"}`}>{sure ? `Yes, remove ${row.name}` : "Remove from gear"}</button>
          <ErrorNote error={error} />
        </div>
      )}
    </BottomSheet>
  );
}

function AddSheet({ rules, pending, error, onClose, onAdd }: {
  rules: "2014" | "2024"; pending: boolean; error: string | null; onClose: () => void; onAdd: (item: LibItem | null, name: string, qty: number) => void;
}) {
  const [picked, setPicked] = useState<{ item: LibItem | null; name: string } | null>(null);
  const [qty, setQ] = useState(1);
  return (
    <BottomSheet title={picked ? picked.name : "Add item"} onClose={onClose}>
      {!picked ? (
        <ItemPicker rules={rules} autoFocus onPick={(item, name) => { setPicked({ item, name }); setQ(item?.bundle ?? 1); }} />
      ) : (
        <div>
          <ItemDetails itemRef={picked.item?.ref ?? null} fallbackName={picked.name} />
          <div className="mt-5 flex items-center gap-2 border-t border-line pt-4">
            <Stepper value={qty} onChange={setQ} min={1} max={9999} label="How many" />
            <button type="button" disabled={pending} onClick={() => onAdd(picked.item, picked.name, qty)} className="h-11 flex-1 rounded-xl bg-accent font-bold text-accent-text">
              {pending ? "Adding…" : "Add to gear"}
            </button>
          </div>
          <button type="button" onClick={() => setPicked(null)} className="mt-3 text-sm text-muted underline">← Back to search</button>
          <ErrorNote error={error} />
        </div>
      )}
    </BottomSheet>
  );
}

function CoinsSheet({ coins, pending, error, onClose, onSave }: { coins: Coins; pending: boolean; error: string | null; onClose: () => void; onSave: (c: Coins) => void }) {
  const [c, setC] = useState(coins);
  return (
    <BottomSheet title="Coins" onClose={onClose}>
      <p className="text-sm text-muted">Change what you carry. The DM sees every change in the history.</p>
      <div className="mt-3 flex flex-col gap-2">
        {COIN_KEYS.map((k) => (
          <label key={k} className="flex items-center gap-3 rounded-xl bg-surface px-4 py-2">
            <span className="flex-1 text-sm text-soft">{COIN_NAME[k]} <span className="text-muted">({k})</span></span>
            <input inputMode="numeric" value={c[k]} aria-label={COIN_NAME[k]}
              onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ""), 10); setC({ ...c, [k]: Number.isFinite(n) ? n : 0 }); }}
              className="h-10 w-28 rounded-lg border border-line bg-bg px-2 text-right font-bold outline-none focus:border-accent" />
          </label>
        ))}
      </div>
      <button type="button" disabled={pending} onClick={() => onSave(c)} className="mt-4 h-12 w-full rounded-xl bg-accent font-bold text-accent-text">{pending ? "Saving…" : "Save coins"}</button>
      <ErrorNote error={error} />
    </BottomSheet>
  );
}
