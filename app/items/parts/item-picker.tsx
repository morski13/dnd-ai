"use client";
// Search the item library (2014 / 2024 SRD) and the campaign's own items, then pick one.
import { useEffect, useState } from "react";
import { formatCp } from "@/lib/items/money";
import type { LibItem } from "@/lib/items/types";
import { SearchIcon } from "../../components/icons";
import { searchItems } from "../actions";
import { ItemMeta } from "./ui";

const KINDS = [
  { v: "", label: "All" }, { v: "weapon", label: "Weapons" }, { v: "armor", label: "Armor" }, { v: "magic", label: "Magic" },
  { v: "gear", label: "Gear" }, { v: "tool", label: "Tools" }, { v: "ammo", label: "Ammo" }, { v: "pack", label: "Packs" },
];

export function ItemPicker({ rules: initialRules = "2024", onPick, allowName = true, autoFocus = false, placeholder = "Search 1,000+ items…" }: {
  rules?: "2014" | "2024" | "both"; onPick: (item: LibItem | null, name: string) => void; allowName?: boolean; autoFocus?: boolean; placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [rules, setRules] = useState(initialRules);
  const [found, setFound] = useState<{ key: string; items: LibItem[] } | null>(null);
  const key = `${q}|${kind}|${rules}`;
  const items = found?.items ?? null;
  const loading = found?.key !== key;

  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      const r = await searchItems(q, { rules, kind });
      if (live) setFound({ key: `${q}|${kind}|${rules}`, items: r });
    }, q ? 220 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [q, kind, rules]);

  return (
    <div>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-bg px-3 focus-within:border-accent">
        <SearchIcon className="h-5 w-5 shrink-0 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus={autoFocus} placeholder={placeholder} aria-label="Search items"
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted" />
        <select value={rules} onChange={(e) => setRules(e.target.value as typeof rules)} aria-label="Rules" className="h-8 rounded-lg bg-surface px-1.5 text-xs text-soft outline-none">
          <option value="2024">2024</option><option value="2014">2014</option><option value="both">Both</option>
        </select>
      </div>
      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1" role="radiogroup" aria-label="Kind">
        {KINDS.map((k) => (
          <button key={k.v} type="button" role="radio" aria-checked={kind === k.v} onClick={() => setKind(k.v)}
            className={`h-8 shrink-0 rounded-full border px-3 text-xs ${kind === k.v ? "border-accent bg-accent-surface font-bold text-accent" : "border-line text-soft"}`}>{k.label}</button>
        ))}
      </div>
      <ul className={`mt-2 divide-y divide-line rounded-2xl border border-line bg-surface transition-opacity ${loading ? "opacity-60" : ""}`} aria-label="Items found" aria-busy={loading}>
        {allowName && q.trim() && !items?.some((i) => i.name.toLowerCase() === q.trim().toLowerCase()) && (
          <li>
            <button type="button" onClick={() => onPick(null, q.trim())} className="flex w-full items-center gap-2 px-4 py-3 text-left">
              <span className="text-accent">+</span><span className="min-w-0 flex-1 truncate">Just write “{q.trim()}”</span>
            </button>
          </li>
        )}
        {(items ?? []).map((i) => (
          <li key={i.ref}>
            <button type="button" onClick={() => onPick(i, i.name)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{i.name}</span>
                <ItemMeta item={i} />
              </span>
              {i.costCp != null && <span className="shrink-0 text-xs text-soft">{formatCp(i.costCp)}</span>}
            </button>
          </li>
        ))}
        {items && items.length === 0 && !loading && <li className="px-4 py-5 text-center text-sm text-muted">Nothing found.</li>}
        {!items && <li className="px-4 py-5 text-center text-sm text-muted">Loading…</li>}
      </ul>
    </div>
  );
}
