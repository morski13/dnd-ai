"use client";
// Add monsters / NPCs: search the SRD library, reuse your campaign's monsters, or make a custom one.
import { useState, useTransition } from "react";
import type { MonsterStats } from "@/lib/encounter/build";
import type { SavedEntry } from "@/lib/fights-data";
import { getMonster, searchMonsters, type MonsterHit } from "../../actions";

type Add = (e: Omit<SavedEntry, "id">) => void;
const ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;

export function AddMonsters({ campaignMonsters, partyLevel, onAdd }: {
  campaignMonsters: { id: string; name: string; stats: MonsterStats }[]; partyLevel: number; onAdd: Add;
}) {
  const [tab, setTab] = useState<"srd" | "campaign" | "custom">("srd");
  const [side, setSide] = useState<"enemy" | "ally">("enemy");
  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-4">
      <p className="font-semibold">Add to the fight</p>
      <div className="mt-2 grid grid-cols-2 rounded-xl bg-bg p-1">
        {(["enemy", "ally"] as const).map((s) => (
          <button key={s} type="button" onClick={() => setSide(s)}
            className={`h-10 rounded-lg text-sm ${side === s ? "bg-surface font-bold" : "text-muted"}`}>
            {s === "enemy" ? "As enemy" : "As ally (NPC)"}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        {([["srd", "Monster library"], ["campaign", "Your monsters"], ["custom", "Custom"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`h-10 flex-1 rounded-lg border text-sm ${tab === k ? "border-[#8A5A24] font-bold" : "border-line text-soft"}`}>{l}</button>
        ))}
      </div>
      {tab === "srd" && <SrdSearch partyLevel={partyLevel} onAdd={(stats) => onAdd({ source: "srd", ref: stats.name, stats, count: 1, side })} />}
      {tab === "campaign" && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {campaignMonsters.length === 0 && <li className="text-sm text-muted">Monsters you add in Session mode (from the library) show up here.</li>}
          {campaignMonsters.map((m) => (
            <li key={m.id} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2">
              <div className="min-w-0 flex-1"><p className="truncate font-semibold">{m.name}</p><p className="text-xs text-muted">AC {m.stats.ac} · HP {m.stats.hp}</p></div>
              <button type="button" onClick={() => onAdd({ source: "campaign", ref: m.id, stats: m.stats, count: 1, side })} className="h-11 rounded-xl border border-line px-3 text-sm">Add</button>
            </li>
          ))}
        </ul>
      )}
      {tab === "custom" && <CustomForm onAdd={(stats) => onAdd({ source: "custom", ref: "custom", stats, count: 1, side })} />}
      <p className="mt-3 text-[11px] text-muted">Monster stat blocks: SRD 5.2.1 by Wizards of the Coast LLC, CC-BY-4.0.</p>
    </div>
  );
}

function SrdSearch({ partyLevel, onAdd }: { partyLevel: number; onAdd: (s: MonsterStats) => void }) {
  const [query, setQuery] = useState("");
  const [capped, setCapped] = useState(true);
  const [hits, setHits] = useState<MonsterHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const maxCr = capped ? Math.max(1, partyLevel + 3) : null;

  function search(q = query, cap = capped) {
    start(async () => {
      const res = await searchMonsters(q, cap ? Math.max(1, partyLevel + 3) : null);
      if ("error" in res) setError(res.error); else { setError(null); setHits(res); }
    });
  }
  return (
    <div className="mt-3">
      <form onSubmit={(e) => { e.preventDefault(); search(); }} className="flex gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ogre, goblin, dragon…"
          className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-[15px] outline-none focus:border-accent" />
        <button type="submit" disabled={busy} className="h-11 rounded-xl bg-accent px-4 text-sm font-bold text-accent-text disabled:opacity-60">Search</button>
      </form>
      <label className="mt-1 flex min-h-11 items-center gap-3 text-sm text-soft">
        <input type="checkbox" checked={capped} onChange={(e) => { setCapped(e.target.checked); search(query, e.target.checked); }} className="h-5 w-5 accent-[#E0913A]" />
        Only CR {maxCr ?? partyLevel + 3} and lower (sensible for level {partyLevel})
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      {hits && (
        <ul className="mt-1 flex max-h-80 flex-col gap-1.5 overflow-y-auto">
          {hits.length === 0 && <li className="text-sm text-muted">No monsters found.</li>}
          {hits.map((h) => (
            <li key={h.name} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{h.name}</p>
                <p className="text-xs text-muted">CR {h.cr} · AC {h.ac} · HP {h.hp} · {h.size_type.split(",")[0]}</p>
              </div>
              <button type="button" disabled={busy}
                onClick={() => start(async () => { const m = await getMonster(h.name); if ("error" in m) setError(m.error); else onAdd(m); })}
                className="h-11 shrink-0 rounded-xl border border-line px-3 text-sm">Add</button>
            </li>
          ))}
        </ul>
      )}
      {!hits && <p className="text-xs text-muted">Search by name, or press Search to browse by challenge rating.</p>}
    </div>
  );
}

function CustomForm({ onAdd }: { onAdd: (s: MonsterStats) => void }) {
  const [f, setF] = useState({
    name: "", ac: "13", hp: "30", init: "1", attackName: "Attack", bonus: "4", damage: "1d8+2", attacks: "1",
    area: false, areaName: "Breath", ability: "DEX", dc: "12", areaDamage: "4d6", targets: "2", recharge: true, xp: "",
  });
  const set = (k: keyof typeof f, v: string | boolean) => setF({ ...f, [k]: v });
  const input = "h-11 min-w-0 w-full rounded-xl border border-line bg-bg px-3 text-[15px] outline-none focus:border-accent";
  const num = (k: keyof typeof f, label: string) => (
    <label className="text-xs text-muted">{label}
      <input inputMode="numeric" value={String(f[k])} onChange={(e) => set(k, e.target.value.replace(/[^\d-]/g, ""))} className={`${input} mt-1`} />
    </label>
  );
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return;
    const n = Math.max(1, Number(f.attacks) || 1);
    const stats: MonsterStats = {
      name: f.name.trim(), ac: Number(f.ac) || 10, hp: Number(f.hp) || 1, init: Number(f.init) || 0, xp: Number(f.xp) || 0,
      abilities: Object.fromEntries(ABILITIES.map((a) => [a, { mod: a === "DEX" ? Number(f.init) || 0 : 0, save: a === "DEX" ? Number(f.init) || 0 : 0 }])),
      actions: [
        { name: f.attackName || "Attack", kind: "attack", bonus: Number(f.bonus) || 0, damage: f.damage || "1d6" },
        ...(f.area ? [{ name: f.areaName || "Area attack", kind: "save", save_ability: f.ability as (typeof ABILITIES)[number], dc: Number(f.dc) || 12, damage: f.areaDamage || "4d6", half: true, targets: Number(f.targets) || 2, recharge: f.recharge ? 5 : undefined }] : []),
      ],
      multiattack: n > 1 ? { count: n, uses: [f.attackName || "Attack"] } : undefined,
    };
    onAdd(stats);
    setF({ ...f, name: "" });
  }
  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-2">
      <input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Name, e.g. Kessa Nightvane" required className={input} />
      <div className="grid grid-cols-4 gap-2">{num("ac", "AC")}{num("hp", "HP")}{num("init", "Init +")}{num("xp", "XP")}</div>
      <div className="grid grid-cols-[1fr_4rem_6rem_4rem] gap-2">
        <label className="text-xs text-muted">Attack<input value={f.attackName} onChange={(e) => set("attackName", e.target.value)} className={`${input} mt-1`} /></label>
        {num("bonus", "To hit +")}
        <label className="text-xs text-muted">Damage<input value={f.damage} onChange={(e) => set("damage", e.target.value)} className={`${input} mt-1`} /></label>
        {num("attacks", "Per turn")}
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm text-soft">
        <input type="checkbox" checked={f.area} onChange={(e) => set("area", e.target.checked)} className="h-5 w-5 accent-[#E0913A]" />
        Also has an area attack (breath, fireball…)
      </label>
      {f.area && (
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-line p-2">
          <label className="text-xs text-muted">Name<input value={f.areaName} onChange={(e) => set("areaName", e.target.value)} className={`${input} mt-1`} /></label>
          <label className="text-xs text-muted">Save
            <select value={f.ability} onChange={(e) => set("ability", e.target.value)} className={`${input} mt-1`}>
              {ABILITIES.map((a) => <option key={a}>{a}</option>)}
            </select>
          </label>
          {num("dc", "DC")}
          <label className="text-xs text-muted">Damage<input value={f.areaDamage} onChange={(e) => set("areaDamage", e.target.value)} className={`${input} mt-1`} /></label>
          {num("targets", "Hits how many")}
          <label className="flex items-end gap-2 pb-3 text-xs text-soft">
            <input type="checkbox" checked={f.recharge} onChange={(e) => set("recharge", e.target.checked)} className="h-5 w-5 accent-[#E0913A]" /> Recharge 5–6
          </label>
        </div>
      )}
      <button type="submit" className="h-11 rounded-xl bg-accent text-sm font-bold text-accent-text">Add custom</button>
    </form>
  );
}
