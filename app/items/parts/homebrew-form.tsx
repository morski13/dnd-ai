"use client";
// The form for a homebrew item (players ask the DM) or a custom item (the DM makes it).
import { useState, useTransition } from "react";
import { formatCp, parsePrice } from "@/lib/items/money";
import { HOMEBREW_KINDS, KIND_LABEL, RARITIES, type Homebrew } from "@/lib/items/types";
import type { HomebrewForm as Form } from "../actions";
import { ErrorNote } from "./ui";

const field = "h-11 w-full rounded-xl border border-line bg-bg px-3 text-[15px] outline-none focus:border-accent";

export function HomebrewForm({ initial, submitLabel, note, onSubmit, onCancel }: {
  initial?: Partial<Homebrew>; submitLabel: string; note?: string;
  onSubmit: (f: Form) => Promise<{ error: string } | unknown>; onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState(initial?.kind ?? "magic");
  const [rarity, setRarity] = useState(initial?.rarity ?? "Uncommon");
  const [attunement, setAttunement] = useState(initial?.attunement ?? false);
  const [price, setPrice] = useState(initial?.costCp != null ? formatCp(initial.costCp).replace("Free", "0") : "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await onSubmit({ name, kind, rarity, attunement, cost: price.trim() ? parsePrice(price) : null, summary, description });
      if (r && typeof r === "object" && "error" in r) setError((r as { error: string }).error);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {note && <p className="rounded-xl border border-accent-line bg-accent-surface px-3 py-2 text-sm text-soft">{note}</p>}
      <label className="text-sm text-soft">Name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required className={`${field} mt-1`} placeholder="Smoke Dagger" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm text-soft">Type
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={`${field} mt-1`}>
            {HOMEBREW_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label className="text-sm text-soft">Rarity
          <select value={rarity ?? ""} onChange={(e) => setRarity(e.target.value)} className={`${field} mt-1`}>
            <option value="">None</option>
            {RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 items-end gap-2">
        <label className="text-sm text-soft">Price (optional)
          <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 250 gp" className={`${field} mt-1`} />
        </label>
        <label className="flex h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm text-soft">
          <input type="checkbox" checked={attunement} onChange={(e) => setAttunement(e.target.checked)} className="h-5 w-5 accent-accent" />
          Needs attunement
        </label>
      </div>
      <label className="text-sm text-soft">Short line (optional)
        <input value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={200} placeholder="1d4 piercing · Finesse, Light" className={`${field} mt-1`} />
      </label>
      <label className="text-sm text-soft">What it does
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={6000} required rows={5}
          placeholder="Once per day, when you hit with it, you can…" className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-[15px] leading-relaxed outline-none focus:border-accent" />
      </label>
      <ErrorNote error={error} />
      <div className="flex gap-2">
        {onCancel && <button type="button" onClick={onCancel} className="h-12 flex-1 rounded-xl border border-line font-semibold text-soft">Cancel</button>}
        <button disabled={pending} className="h-12 flex-[2] rounded-xl bg-accent font-bold text-accent-text">{pending ? "Saving…" : submitLabel}</button>
      </div>
    </form>
  );
}
