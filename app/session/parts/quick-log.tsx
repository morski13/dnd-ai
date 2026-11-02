"use client";
// DM quick log: for tables that roll without phones. Who → what → the number(s) → target → Save, a few taps a line.
// It writes normal roll events and HP changes, so the recap and stats work. "Repeat last" and "Undo" for the newest line.
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { QuickKind, QuickLine, Who } from "@/lib/quick-log";
import { quickLog, undoQuickLog } from "../moderator-actions";

type Person = { key: string; name: string; who: Who };
const KINDS: { k: QuickKind; label: string }[] = [
  { k: "attack", label: "Attack" }, { k: "spell", label: "Spell" }, { k: "save", label: "Save" }, { k: "heal", label: "Heal" }, { k: "took", label: "Took damage" },
];
const KEY = "dm-quick-log";

export function QuickLog({ party, monsters }: { party: { id: string; name: string }[]; monsters: { id: string; name: string }[] }) {
  const router = useRouter();
  const people: Person[] = [
    ...party.map((c) => ({ key: `c:${c.id}`, name: c.name, who: { characterId: c.id } })),
    ...monsters.map((m) => ({ key: `m:${m.id}`, name: m.name, who: { monsterId: m.id } })),
  ];
  const [who, setWho] = useState<string>("");
  const [kind, setKind] = useState<QuickKind>("attack");
  const [label, setLabel] = useState("");
  const [num, setNum] = useState("");
  const [hit, setHit] = useState<boolean | null>(true);
  const [target, setTarget] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [last, setLast] = useState<{ line: QuickLine; keys: { who: string; target: string }; rollIds: string[]; effectIds: string[]; text: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // the last choices, remembered on this device
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as { who?: string; kind?: QuickKind; target?: string } | null;
      if (s) { if (s.who) setWho(s.who); if (s.kind) setKind(s.kind); if (s.target) setTarget(s.target); } // eslint-disable-line react-hooks/set-state-in-effect -- read once from this device
    } catch { /* fine */ }
  }, []);
  const find = (k: string) => people.find((p) => p.key === k)?.who ?? null;
  const needsTarget = kind === "attack" || kind === "spell" || kind === "heal";
  const needsNum = kind === "attack" || kind === "spell" || kind === "save";

  function save(line?: QuickLine, keys?: { who: string; target: string }) {
    const l: QuickLine = line ?? {
      who: find(who) ?? {}, kind, label, number: num === "" ? null : Number(num), hit: kind === "heal" || kind === "took" ? null : hit,
      target: needsTarget && target ? find(target) : null, amount: amount === "" ? null : Number(amount),
    };
    setMsg(null);
    start(async () => {
      const r = await quickLog(l);
      if ("error" in r) return setMsg(r.error);
      const k = keys ?? { who, target };
      setLast({ line: l, keys: k, rollIds: r.rollIds, effectIds: r.effectIds, text: r.text });
      try { localStorage.setItem(KEY, JSON.stringify({ who: k.who, kind: l.kind, target: k.target })); } catch { /* fine */ }
      setNum(""); setAmount("");
      setMsg(`✓ ${people.find((p) => p.key === k.who)?.name ?? ""}: ${r.text}`);
      router.refresh();
    });
  }
  function undo() {
    if (!last) return;
    start(async () => {
      const r = await undoQuickLog(last.rollIds, last.effectIds);
      if ("error" in r) return setMsg(r.error);
      setMsg("Undone."); setLast(null); router.refresh();
    });
  }

  const chip = (on: boolean) => `h-10 shrink-0 rounded-full border px-3 text-sm ${on ? "border-accent bg-accent-surface font-bold text-accent" : "border-line text-soft"}`;
  const field = "h-12 w-full rounded-xl border border-line bg-bg px-3 text-lg font-bold outline-none focus:border-accent";
  return (
    <details className="rounded-2xl border border-line bg-surface p-4">
      <summary className="cursor-pointer font-semibold">Quick log <span className="text-sm font-normal text-muted">· for rolls made without phones</span></summary>
      <p className="mt-2 text-xs uppercase tracking-[0.12em] text-muted">Who</p>
      <div className="mt-1 flex flex-wrap gap-1.5">{people.map((p) => <button key={p.key} type="button" onClick={() => setWho(p.key)} className={chip(who === p.key)}>{p.name}</button>)}</div>
      <p className="mt-3 text-xs uppercase tracking-[0.12em] text-muted">What</p>
      <div className="mt-1 flex flex-wrap gap-1.5">{KINDS.map((x) => <button key={x.k} type="button" onClick={() => setKind(x.k)} className={chip(kind === x.k)}>{x.label}</button>)}</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {needsNum && <label className="text-xs text-muted">{kind === "save" ? "Save roll" : "Attack roll"} (total)<input inputMode="numeric" value={num} onChange={(e) => setNum(e.target.value.replace(/[^\d-]/g, "").slice(0, 3))} className={field} /></label>}
        <label className="text-xs text-muted">{kind === "heal" ? "Healing" : kind === "took" ? "Damage taken" : kind === "save" ? "Damage taken (if any)" : "Damage (if it hit)"}
          <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 4))} className={field} /></label>
      </div>
      {needsNum && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setHit(true)} className={chip(hit === true)}>{kind === "save" ? "Made it" : "Hit"}</button>
          <button type="button" onClick={() => setHit(false)} className={chip(hit === false)}>{kind === "save" ? "Failed" : "Miss"}</button>
        </div>
      )}
      {needsTarget && (
        <>
          <p className="mt-3 text-xs uppercase tracking-[0.12em] text-muted">{kind === "heal" ? "Who is healed (empty: themselves)" : "Target"}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">{people.filter((p) => p.key !== who || kind === "heal").map((p) => <button key={p.key} type="button" onClick={() => setTarget(target === p.key ? "" : p.key)} className={chip(target === p.key)}>{p.name}</button>)}</div>
        </>
      )}
      <label className="mt-3 block text-xs text-muted">Name (optional)<input value={label} onChange={(e) => setLabel(e.target.value.slice(0, 60))} placeholder={kind === "spell" ? "Fireball" : kind === "attack" ? "Greataxe" : ""} className="mt-1 h-11 w-full rounded-xl border border-line bg-bg px-3 text-[15px] outline-none focus:border-accent" /></label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => save()} disabled={pending || !who} className="h-12 flex-1 rounded-xl bg-accent font-bold text-accent-text disabled:opacity-40">{pending ? "Saving…" : "Save line"}</button>
        {last && <button type="button" onClick={() => save(last.line, last.keys)} disabled={pending} className="h-12 rounded-xl border border-line px-3 text-sm font-semibold text-soft">Repeat last</button>}
        {last && <button type="button" onClick={undo} disabled={pending} className="h-12 rounded-xl border border-line px-3 text-sm font-semibold text-soft">Undo</button>}
      </div>
      {msg && <p className="mt-2 text-sm text-soft" role="status">{msg}</p>}
    </details>
  );
}
