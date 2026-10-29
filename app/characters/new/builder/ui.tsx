"use client";
// Small pieces the builder's steps share: tappable cards, chips, "read more" text, and a spell picker.
import { useEffect, useState } from "react";
import { spellList } from "../builder-actions";

export function StepTitle({ title, help }: { title: string; help?: string }) {
  return (
    <div>
      <h2 className="font-heading text-2xl font-bold leading-tight">{title}</h2>
      {help && <p className="mt-1 text-[15px] text-muted">{help}</p>}
    </div>
  );
}

export function Label({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-3">
      <p className="text-xs uppercase tracking-[0.12em] text-muted">{children}</p>
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}

/** A big tappable card with a title, a line under it and an optional badge. */
export function PickCard({ on, onClick, title, sub, badge, children }: {
  on: boolean; onClick: () => void; title: string; sub?: string; badge?: string; children?: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`flex min-h-16 w-full flex-col items-start rounded-2xl border px-4 py-3 text-left ${on ? "border-accent-strong bg-accent-surface" : "border-line bg-surface"}`}>
      <span className="flex w-full items-start gap-2">
        <span className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold ${on ? "border-accent bg-accent text-accent-text" : "border-line"}`} aria-hidden>{on ? "✓" : ""}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold leading-tight">{title}</span>
          {sub && <span className="mt-0.5 block text-sm text-muted">{sub}</span>}
        </span>
        {badge && <span className="shrink-0 rounded-full bg-bg px-2 py-0.5 text-xs text-soft">{badge}</span>}
      </span>
      {children}
    </button>
  );
}

export function Chip({ on, onClick, children, disabled, locked }: { on: boolean; onClick?: () => void; children: React.ReactNode; disabled?: boolean; locked?: boolean }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} disabled={disabled || locked}
      className={`h-10 rounded-full border px-3 text-sm disabled:opacity-100 ${locked ? "border-success-line bg-success-bg text-success" : on ? "border-accent bg-accent-surface font-bold text-accent" : disabled ? "border-line text-muted opacity-50" : "border-line text-soft"}`}>
      {locked ? "✓ " : ""}{children}
    </button>
  );
}

/** A list of chips where you pick up to `choose`; `locked` ones are already yours. */
export function ChipPicker({ options, picked, choose, onChange, locked = new Map(), label }: {
  options: string[]; picked: string[]; choose: number; onChange: (v: string[]) => void; locked?: Map<string, string>; label: string;
}) {
  const toggle = (o: string) => {
    if (picked.includes(o)) onChange(picked.filter((x) => x !== o));
    else if (choose === 1) onChange([o]);
    else if (picked.length < choose) onChange([...picked, o]);
  };
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map((o) => locked.has(o)
        ? <Chip key={o} on locked>{o} <span className="text-xs font-normal">· {locked.get(o)}</span></Chip>
        : <Chip key={o} on={picked.includes(o)} disabled={!picked.includes(o) && choose > 1 && picked.length >= choose} onClick={() => toggle(o)}>{o}</Chip>)}
    </div>
  );
}

export function Count({ have, need }: { have: number; need: number }) {
  const done = have >= need;
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${done ? "bg-success-bg text-success" : "bg-surface text-muted"}`}>{done ? "✓ done" : `${have}/${need}`}</span>;
}

/** Rules text that starts short and opens on a tap. */
export function MoreText({ text, max = 180 }: { text: string; max?: number }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const long = text.length > max;
  return (
    <span className="mt-1 block text-sm leading-relaxed text-soft">
      <span className="whitespace-pre-line">{open || !long ? text : `${text.slice(0, max).trimEnd()}…`}</span>
      {long && (
        <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setOpen(!open); } }}
          className="ml-1 inline-flex min-h-8 items-center text-accent underline">{open ? "less" : "read all"}</span>
      )}
    </span>
  );
}

export function TraitList({ traits }: { traits: { name: string; text: string }[] }) {
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {traits.map((t) => (
        <li key={t.name} className="rounded-xl border border-line bg-surface px-3 py-2">
          <p className="font-semibold">{t.name}</p>
          <MoreText text={t.text} />
        </li>
      ))}
    </ul>
  );
}

type SpellOpt = { name: string; level: number; text: string; tags: string[] };
const cache = new Map<string, Promise<SpellOpt[]>>();

/** Pick spells from a class list (loaded from the server once per list). */
export function SpellPicker({ rules, list, level, choose, picked, onChange, exclude = [], label }: {
  rules: string; list: string; level: number; choose: number; picked: string[]; onChange: (v: string[]) => void; exclude?: string[]; label: string;
}) {
  const [spells, setSpells] = useState<SpellOpt[] | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const k = `${rules}|${list}`;
    if (!cache.has(k)) cache.set(k, spellList(rules, list, 1));
    cache.get(k)!.then((s) => { if (live) setSpells(s); }).catch(() => { if (live) setSpells([]); });
    return () => { live = false; };
  }, [rules, list]);
  const opts = (spells ?? []).filter((s) => s.level === level && !exclude.includes(s.name) && (!q || s.name.toLowerCase().includes(q.toLowerCase())));
  const toggle = (n: string) => {
    if (picked.includes(n)) onChange(picked.filter((x) => x !== n));
    else if (choose === 1) onChange([n]);
    else if (picked.length < choose) onChange([...picked, n]);
  };
  return (
    <div className="mt-2" aria-label={label}>
      {!spells && <p className="text-sm text-muted">Loading the {list} spells…</p>}
      {spells && opts.length > 8 && (
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search spells" aria-label={`Search ${label}`}
          className="mb-2 h-11 w-full rounded-xl border border-line bg-bg px-3 text-[15px] outline-none focus:border-accent" />
      )}
      <ul className="flex max-h-[22rem] flex-col gap-1.5 overflow-y-auto pr-1">
        {[...opts].sort((a, b) => Number(picked.includes(b.name)) - Number(picked.includes(a.name))).map((s) => {
          const on = picked.includes(s.name);
          const full = !on && choose > 1 && picked.length >= choose;
          return (
            <li key={s.name} className={`rounded-xl border ${on ? "border-accent-strong bg-accent-surface" : "border-line bg-surface"} ${full ? "opacity-50" : ""}`}>
              <div className="flex items-start">
                <button type="button" disabled={full} onClick={() => toggle(s.name)} aria-pressed={on} className="flex min-h-12 min-w-0 flex-1 items-start gap-3 px-3 py-2 text-left">
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold ${on ? "border-accent bg-accent text-accent-text" : "border-line"}`} aria-hidden>{on ? "✓" : ""}</span>
                  <span className="min-w-0"><span className="block font-semibold leading-tight">{s.name}</span><span className="block text-xs text-muted">{s.tags.join(" · ")}</span></span>
                </button>
                <button type="button" onClick={() => setOpen(open === s.name ? null : s.name)} aria-expanded={open === s.name} aria-label={`What does ${s.name} do?`}
                  className="h-12 shrink-0 px-3 text-sm text-accent">{open === s.name ? "Hide" : "Info"}</button>
              </div>
              {open === s.name && <p className="whitespace-pre-line border-t border-line px-3 py-2 text-sm leading-relaxed text-soft">{s.text}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export const mod = (n: number) => Math.floor((n - 10) / 2);
export const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
