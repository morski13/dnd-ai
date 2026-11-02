"use client";
// The homebrew editor: a list per kind, a form for each, the DM's request queue (approve / reject with a note).
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { FeatForm, HomebrewKind, HomebrewRow, MonsterForm, SpellForm, SubclassForm } from "@/lib/campaign-homebrew";
import { ABILITIES, type Ability } from "@/lib/rules";
import { deleteHomebrew, deleteMonster, reviewHomebrew, saveHomebrew, saveMonster } from "./actions";

export type MonsterRow = { id: string; name: string; ac: number | null; hp_max: number | null; stat_block: unknown };
type Row = HomebrewRow & { by: string | null };
type Tab = HomebrewKind | "monster";
const TABS: { t: Tab; label: string }[] = [{ t: "spell", label: "Spells" }, { t: "feat", label: "Feats" }, { t: "subclass", label: "Subclasses" }, { t: "monster", label: "Monsters" }];
const SCHOOLS = ["Abjuration", "Conjuration", "Divination", "Enchantment", "Evocation", "Illusion", "Necromancy", "Transmutation"];
const CASTERS = ["Bard", "Cleric", "Druid", "Paladin", "Ranger", "Sorcerer", "Warlock", "Wizard"];
const field = "mt-1 w-full rounded-xl border border-line bg-bg px-3 text-[15px] outline-none focus:border-accent";
const blankSpell = (): SpellForm => ({ name: "", level: 1, school: "Evocation", classes: [], casting_time: "Action", range: "60 feet", duration: "Instantaneous", components: "V, S",
  concentration: false, ritual: false, description: "", higher_levels: "", roll: { kind: "none", damage: "", damage_type: "", save_ability: "", half_on_save: true, per_level: "" } });
const blankFeat = (): FeatForm => ({ name: "", category: "General", prereq: "", text: "" });
const blankSub = (cls: string): SubclassForm => ({ cls, name: "", flavor: "", text: "", features: [{ level: 3, name: "", text: "" }] });
const blankMonster = (): MonsterForm => ({ name: "", ac: 13, hp: 20, init: 0, cr: "1", size_type: "", multiattack: 1, actions: [{ name: "", kind: "attack", bonus: 4, dc: 13, ability: "DEX", damage: "1d8+2", damage_type: "slashing" }] });

export function HomebrewEditor({ isDm, userId, rulesList, classes, rows, monsters, needsSql }: {
  isDm: boolean; userId: string; rulesList: ("2014" | "2024")[]; classes: Record<string, string[]>; rows: Row[]; monsters: MonsterRow[]; needsSql: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("spell");
  const [rules, setRules] = useState(rulesList[0]);
  const [editing, setEditing] = useState<{ id: string | null; form: SpellForm | FeatForm | SubclassForm | MonsterForm } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const pendingRows = rows.filter((r) => r.status === "pending");
  const list = tab === "monster" ? [] : rows.filter((r) => r.kind === tab);
  const run = (fn: () => Promise<{ error: string } | object>, ok: string) => start(async () => {
    setMsg(null);
    const r = await fn();
    if ("error" in r) return setMsg(r.error as string);
    setMsg(ok); setEditing(null); router.refresh();
  });
  const fresh = (t: Tab) => (t === "spell" ? blankSpell() : t === "feat" ? blankFeat() : t === "subclass" ? blankSub(classes[rules][0]) : blankMonster());

  if (needsSql) return <p className="mt-4 rounded-xl border border-accent-line bg-accent-surface p-3 text-sm text-soft">Run <b>supabase/31-campaign-homebrew.sql</b> in the Supabase SQL Editor, then come back.</p>;
  return (
    <div className="mt-2">
      <p className="text-sm text-muted">{isDm ? "What you make is in the game at once. Players' requests wait for you here." : "Make a spell, feat or subclass and send it to your DM. Once approved it's in the builder, level-up and your sheet."}</p>

      {isDm && pendingRows.length > 0 && (
        <section className="mt-4 rounded-2xl border border-accent-line bg-accent-surface p-4" aria-label="Requests">
          <p className="font-semibold">Requests from players ({pendingRows.length})</p>
          <ul className="mt-2 flex flex-col gap-2">{pendingRows.map((r) => <Review key={r.id} r={r} pending={pending}
            onReview={(status, note) => run(() => reviewHomebrew(r.id, status, note), status === "approved" ? `${r.name} approved.` : `${r.name} rejected.`)} />)}</ul>
        </section>
      )}

      <div className="mt-4 flex gap-1.5 overflow-x-auto" role="tablist">
        {TABS.filter((x) => x.t !== "monster" || isDm).map((x) => (
          <button key={x.t} type="button" role="tab" aria-selected={tab === x.t} onClick={() => { setTab(x.t); setEditing(null); }}
            className={`h-10 shrink-0 rounded-full border px-4 text-sm ${tab === x.t ? "border-accent bg-accent-surface font-bold text-accent" : "border-line text-soft"}`}>{x.label}</button>
        ))}
        {rulesList.length > 1 && tab !== "monster" && (
          <select value={rules} onChange={(e) => setRules(e.target.value as "2014" | "2024")} aria-label="Rules" className="ml-auto h-10 rounded-xl border border-line bg-bg px-2 text-sm">
            {rulesList.map((r) => <option key={r} value={r}>{r} rules</option>)}
          </select>
        )}
      </div>

      {!editing && (
        <button type="button" onClick={() => setEditing({ id: null, form: fresh(tab) })} className="mt-3 h-12 w-full rounded-xl border border-dashed border-accent-line text-sm font-bold text-accent">
          + New {tab === "subclass" ? "subclass" : tab}{!isDm && tab !== "monster" ? " (request)" : ""}</button>
      )}
      {editing && (
        <div className="mt-3 rounded-2xl border border-line bg-surface p-4">
          {tab === "spell" && <SpellEdit f={editing.form as SpellForm} set={(f) => setEditing({ ...editing, form: f })} />}
          {tab === "feat" && <FeatEdit f={editing.form as FeatForm} set={(f) => setEditing({ ...editing, form: f })} />}
          {tab === "subclass" && <SubEdit f={editing.form as SubclassForm} classes={classes[rules]} set={(f) => setEditing({ ...editing, form: f })} />}
          {tab === "monster" && <MonsterEdit f={editing.form as MonsterForm} set={(f) => setEditing({ ...editing, form: f })} />}
          <div className="mt-4 flex gap-2">
            <button type="button" disabled={pending} onClick={() => run(() => tab === "monster" ? saveMonster(editing.form as MonsterForm, editing.id) : saveHomebrew(tab, editing.form as SpellForm, rules, editing.id), isDm || tab === "monster" ? "Saved." : "Sent to your DM.")}
              className="h-12 flex-1 rounded-xl bg-accent font-bold text-accent-text disabled:opacity-40">{pending ? "Saving…" : isDm || tab === "monster" ? "Save" : "Send to the DM"}</button>
            <button type="button" onClick={() => setEditing(null)} className="h-12 rounded-xl border border-line px-4 text-sm text-soft">Cancel</button>
          </div>
        </div>
      )}
      {msg && <p className="mt-2 text-sm text-soft" role="status">{msg}</p>}

      <ul className="mt-4 flex flex-col gap-2">
        {tab === "monster" ? monsters.map((m) => {
          const st = m.stat_block as { actions?: MonsterForm["actions"]; init?: number; cr?: string; size_type?: string; multiattack?: { count: number } };
          return (
            <li key={m.id} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
              <span className="min-w-0 flex-1"><b>{m.name}</b> <span className="text-sm text-muted">· AC {m.ac} · HP {m.hp_max}{st.cr ? ` · CR ${st.cr}` : ""}</span>
                <span className="block truncate text-xs text-soft">{(st.actions ?? []).map((a) => a.name).join(", ")}</span></span>
              <button type="button" onClick={() => setEditing({ id: m.id, form: { name: m.name, ac: m.ac ?? 13, hp: m.hp_max ?? 10, init: st.init ?? 0, cr: st.cr ?? "", size_type: st.size_type ?? "", multiattack: st.multiattack?.count ?? 1,
                actions: (st.actions ?? []).map((a) => ({ name: a.name, kind: a.kind, bonus: a.bonus ?? 0, dc: a.dc ?? 13, ability: (a.ability ?? "DEX") as Ability, damage: a.damage ?? "", damage_type: a.damage_type ?? "" })) } })}
                className="h-9 rounded-lg border border-line px-2.5 text-xs text-soft">Edit</button>
              <button type="button" onClick={() => confirm(`Delete ${m.name}?`) && run(() => deleteMonster(m.id), "Deleted.")} className="h-9 rounded-lg px-2 text-xs text-muted underline">Delete</button>
            </li>
          );
        }) : list.map((r) => (
          <li key={r.id} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
            <span className="min-w-0 flex-1"><b>{r.name}</b>{r.parent ? <span className="text-sm text-muted"> · {r.parent}</span> : null} <span className="text-xs text-muted">· {r.rules}</span>
              <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] ${r.status === "approved" ? "bg-success-bg text-success" : r.status === "rejected" ? "bg-danger-bg text-danger" : "bg-bg text-muted"}`}>{r.status}</span>
              {r.by && <span className="block text-xs text-muted">by {r.by}</span>}
              {r.dm_note && <span className="block text-xs text-soft">DM: {r.dm_note}</span>}</span>
            {(isDm || (r.requested_by === userId && r.status !== "approved")) && <>
              <button type="button" onClick={() => { setRules(r.rules); setEditing({ id: r.id, form: r.data as SpellForm }); }} className="h-9 rounded-lg border border-line px-2.5 text-xs text-soft">Edit</button>
              <button type="button" onClick={() => confirm(`Delete ${r.name}?`) && run(() => deleteHomebrew(r.id), "Deleted.")} className="h-9 rounded-lg px-2 text-xs text-muted underline">Delete</button>
            </>}
          </li>
        ))}
        {tab !== "monster" && !list.length && <li className="text-sm text-muted">Nothing yet.</li>}
        {tab === "monster" && !monsters.length && <li className="text-sm text-muted">No homebrew monsters yet. They show up in Session mode and the fight planner.</li>}
      </ul>
    </div>
  );
}

function Review({ r, pending, onReview }: { r: Row; pending: boolean; onReview: (s: "approved" | "rejected", note: string) => void }) {
  const [note, setNote] = useState("");
  const d = r.data as { description?: string; text?: string; features?: { level: number; name: string }[] };
  return (
    <li className="rounded-xl bg-bg p-3">
      <p><b>{r.name}</b> <span className="text-sm text-muted">· {r.kind}{r.parent ? ` (${r.parent})` : ""} · by {r.by ?? "a player"}</span></p>
      <p className="mt-1 line-clamp-4 text-sm text-soft">{d.description ?? d.text ?? (d.features ?? []).map((f) => `L${f.level} ${f.name}`).join(", ")}</p>
      <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} placeholder="Note for the player (optional)" className={`${field} h-10`} />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" disabled={pending} onClick={() => onReview("approved", note)} className="h-10 rounded-xl bg-accent text-sm font-bold text-accent-text">Approve</button>
        <button type="button" disabled={pending} onClick={() => onReview("rejected", note)} className="h-10 rounded-xl border border-line text-sm font-semibold text-soft">Reject</button>
      </div>
    </li>
  );
}

const L = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="mt-3 block text-xs text-muted">{label}{children}</label>;
const Toggle = ({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) => (
  <label className="mt-3 flex min-h-10 items-center gap-2 text-sm text-soft"><input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="h-5 w-5 accent-accent" />{label}</label>
);

function SpellEdit({ f, set }: { f: SpellForm; set: (f: SpellForm) => void }) {
  const p = (x: Partial<SpellForm>) => set({ ...f, ...x });
  const r = (x: Partial<SpellForm["roll"]>) => set({ ...f, roll: { ...f.roll, ...x } });
  return (
    <div>
      <L label="Name"><input value={f.name} onChange={(e) => p({ name: e.target.value })} className={`${field} h-11`} /></L>
      <div className="grid grid-cols-2 gap-2">
        <L label="Level (0 = cantrip)"><input inputMode="numeric" value={f.level} onChange={(e) => p({ level: Number(e.target.value.replace(/\D/g, "").slice(0, 1) || 0) })} className={`${field} h-11`} /></L>
        <L label="School"><select value={f.school} onChange={(e) => p({ school: e.target.value })} className={`${field} h-11`}>{SCHOOLS.map((s) => <option key={s}>{s}</option>)}</select></L>
        <L label="Casting time"><input value={f.casting_time} onChange={(e) => p({ casting_time: e.target.value })} className={`${field} h-11`} /></L>
        <L label="Range"><input value={f.range} onChange={(e) => p({ range: e.target.value })} className={`${field} h-11`} /></L>
        <L label="Duration"><input value={f.duration} onChange={(e) => p({ duration: e.target.value })} className={`${field} h-11`} /></L>
        <L label="Components"><input value={f.components} onChange={(e) => p({ components: e.target.value })} className={`${field} h-11`} /></L>
      </div>
      <p className="mt-3 text-xs text-muted">Classes that can learn it</p>
      <div className="mt-1 flex flex-wrap gap-1.5">{CASTERS.map((c) => <button key={c} type="button" aria-pressed={f.classes.includes(c)} onClick={() => p({ classes: f.classes.includes(c) ? f.classes.filter((x) => x !== c) : [...f.classes, c] })}
        className={`h-9 rounded-full border px-3 text-xs ${f.classes.includes(c) ? "border-accent bg-accent-surface font-bold text-accent" : "border-line text-soft"}`}>{c}</button>)}</div>
      <Toggle on={f.concentration} set={(v) => p({ concentration: v })} label="Concentration" />
      <Toggle on={f.ritual} set={(v) => p({ ritual: v })} label="Ritual" />
      <L label="What it does"><textarea value={f.description} onChange={(e) => p({ description: e.target.value })} rows={4} className={`${field} py-2`} /></L>
      <L label="At higher levels (optional)"><textarea value={f.higher_levels} onChange={(e) => p({ higher_levels: e.target.value })} rows={2} className={`${field} py-2`} /></L>
      <p className="mt-4 text-sm font-semibold">Rolling it on the sheet</p>
      <L label="Roll"><select value={f.roll.kind} onChange={(e) => r({ kind: e.target.value as SpellForm["roll"]["kind"] })} className={`${field} h-11`}>
        <option value="none">Nothing to roll</option><option value="spell_attack">Spell attack + damage</option><option value="save">Saving throw + damage</option>
        <option value="damage_only">Damage only (no attack or save)</option><option value="heal">Healing</option></select></L>
      {f.roll.kind !== "none" && (
        <div className="grid grid-cols-2 gap-2">
          <L label={f.roll.kind === "heal" ? "Healing dice" : "Damage dice"}><input value={f.roll.damage} onChange={(e) => r({ damage: e.target.value })} placeholder="3d6" className={`${field} h-11`} /></L>
          {f.roll.kind !== "heal" && <L label="Damage type"><input value={f.roll.damage_type} onChange={(e) => r({ damage_type: e.target.value })} placeholder="fire" className={`${field} h-11`} /></L>}
          {f.roll.kind === "save" && <L label="Save"><select value={f.roll.save_ability} onChange={(e) => r({ save_ability: e.target.value as Ability })} className={`${field} h-11`}><option value="">Pick</option>{ABILITIES.map((a) => <option key={a}>{a}</option>)}</select></L>}
          <L label="Extra dice per slot level"><input value={f.roll.per_level} onChange={(e) => r({ per_level: e.target.value })} placeholder="1d6" className={`${field} h-11`} /></L>
        </div>
      )}
      {f.roll.kind === "save" && <Toggle on={f.roll.half_on_save} set={(v) => r({ half_on_save: v })} label="Half damage on a successful save" />}
    </div>
  );
}

function FeatEdit({ f, set }: { f: FeatForm; set: (f: FeatForm) => void }) {
  return (
    <div>
      <L label="Name"><input value={f.name} onChange={(e) => set({ ...f, name: e.target.value })} className={`${field} h-11`} /></L>
      <L label="Kind"><select value={f.category} onChange={(e) => set({ ...f, category: e.target.value })} className={`${field} h-11`}>{["General", "Origin", "Fighting Style", "Epic Boon"].map((c) => <option key={c}>{c}</option>)}</select></L>
      <L label="Needs (optional)"><input value={f.prereq} onChange={(e) => set({ ...f, prereq: e.target.value })} placeholder="Level 4+, STR 13" className={`${field} h-11`} /></L>
      <L label="What it does"><textarea value={f.text} onChange={(e) => set({ ...f, text: e.target.value })} rows={5} className={`${field} py-2`} /></L>
      <p className="mt-2 text-xs text-muted">If it raises a score, write it like the rules do: “Increase your Strength or Dexterity score by 1, to a maximum of 20.” The level-up then asks which.</p>
    </div>
  );
}

function SubEdit({ f, classes, set }: { f: SubclassForm; classes: string[]; set: (f: SubclassForm) => void }) {
  const feat = (i: number, x: Partial<SubclassForm["features"][number]>) => set({ ...f, features: f.features.map((y, j) => (j === i ? { ...y, ...x } : y)) });
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <L label="Class"><select value={f.cls} onChange={(e) => set({ ...f, cls: e.target.value })} className={`${field} h-11`}>{classes.map((c) => <option key={c}>{c}</option>)}</select></L>
        <L label="Name"><input value={f.name} onChange={(e) => set({ ...f, name: e.target.value })} className={`${field} h-11`} /></L>
      </div>
      <L label="One line about it (optional)"><input value={f.flavor} onChange={(e) => set({ ...f, flavor: e.target.value })} className={`${field} h-11`} /></L>
      <p className="mt-4 text-sm font-semibold">Features by level</p>
      {f.features.map((x, i) => (
        <div key={i} className="mt-2 rounded-xl bg-bg p-2">
          <div className="grid grid-cols-[5rem_1fr] gap-2">
            <L label="Level"><input inputMode="numeric" value={x.level} onChange={(e) => feat(i, { level: Number(e.target.value.replace(/\D/g, "").slice(0, 2) || 1) })} className={`${field} h-11`} /></L>
            <L label="Feature name"><input value={x.name} onChange={(e) => feat(i, { name: e.target.value })} className={`${field} h-11`} /></L>
          </div>
          <L label="What it does"><textarea value={x.text} onChange={(e) => feat(i, { text: e.target.value })} rows={3} className={`${field} py-2`} /></L>
          {f.features.length > 1 && <button type="button" onClick={() => set({ ...f, features: f.features.filter((_, j) => j !== i) })} className="mt-1 inline-flex min-h-9 items-center text-xs text-muted underline">Remove</button>}
        </div>
      ))}
      <button type="button" onClick={() => set({ ...f, features: [...f.features, { level: (f.features[f.features.length - 1]?.level ?? 3) + 3, name: "", text: "" }] })} className="mt-2 h-10 rounded-xl border border-line px-3 text-sm text-soft">+ Feature</button>
    </div>
  );
}

function MonsterEdit({ f, set }: { f: MonsterForm; set: (f: MonsterForm) => void }) {
  const p = (x: Partial<MonsterForm>) => set({ ...f, ...x });
  const act = (i: number, x: Partial<MonsterForm["actions"][number]>) => p({ actions: f.actions.map((y, j) => (j === i ? { ...y, ...x } : y)) });
  const num = (v: string) => Number(v.replace(/[^\d-]/g, "").slice(0, 3) || 0);
  return (
    <div>
      <L label="Name"><input value={f.name} onChange={(e) => p({ name: e.target.value })} className={`${field} h-11`} /></L>
      <div className="grid grid-cols-3 gap-2">
        <L label="AC"><input inputMode="numeric" value={f.ac} onChange={(e) => p({ ac: num(e.target.value) })} className={`${field} h-11`} /></L>
        <L label="HP"><input inputMode="numeric" value={f.hp} onChange={(e) => p({ hp: num(e.target.value) })} className={`${field} h-11`} /></L>
        <L label="Initiative"><input inputMode="numeric" value={f.init} onChange={(e) => p({ init: num(e.target.value) })} className={`${field} h-11`} /></L>
        <L label="CR"><input value={f.cr} onChange={(e) => p({ cr: e.target.value })} className={`${field} h-11`} /></L>
        <L label="Attacks a turn"><input inputMode="numeric" value={f.multiattack} onChange={(e) => p({ multiattack: num(e.target.value) || 1 })} className={`${field} h-11`} /></L>
        <L label="Size & type"><input value={f.size_type} onChange={(e) => p({ size_type: e.target.value })} placeholder="Large beast" className={`${field} h-11`} /></L>
      </div>
      <p className="mt-4 text-sm font-semibold">Actions</p>
      {f.actions.map((a, i) => (
        <div key={i} className="mt-2 rounded-xl bg-bg p-2">
          <div className="grid grid-cols-2 gap-2">
            <L label="Name"><input value={a.name} onChange={(e) => act(i, { name: e.target.value })} className={`${field} h-11`} /></L>
            <L label="Kind"><select value={a.kind} onChange={(e) => act(i, { kind: e.target.value as "attack" | "save" })} className={`${field} h-11`}><option value="attack">Attack</option><option value="save">Save (breath, spell)</option></select></L>
            {a.kind === "attack"
              ? <L label="To hit"><input inputMode="numeric" value={a.bonus} onChange={(e) => act(i, { bonus: num(e.target.value) })} className={`${field} h-11`} /></L>
              : <>
                <L label="DC"><input inputMode="numeric" value={a.dc} onChange={(e) => act(i, { dc: num(e.target.value) })} className={`${field} h-11`} /></L>
                <L label="Save"><select value={a.ability} onChange={(e) => act(i, { ability: e.target.value as Ability })} className={`${field} h-11`}>{ABILITIES.map((x) => <option key={x}>{x}</option>)}</select></L>
              </>}
            <L label="Damage"><input value={a.damage} onChange={(e) => act(i, { damage: e.target.value })} placeholder="2d6+3" className={`${field} h-11`} /></L>
            <L label="Damage type"><input value={a.damage_type} onChange={(e) => act(i, { damage_type: e.target.value })} className={`${field} h-11`} /></L>
          </div>
          {f.actions.length > 1 && <button type="button" onClick={() => p({ actions: f.actions.filter((_, j) => j !== i) })} className="mt-1 inline-flex min-h-9 items-center text-xs text-muted underline">Remove</button>}
        </div>
      ))}
      <button type="button" onClick={() => p({ actions: [...f.actions, { name: "", kind: "attack", bonus: 4, dc: 13, ability: "DEX", damage: "", damage_type: "" }] })} className="mt-2 h-10 rounded-xl border border-line px-3 text-sm text-soft">+ Action</button>
      <div className="mt-4 rounded-xl border border-line bg-bg p-3 text-sm" aria-label="Preview">
        <p className="font-heading text-lg font-bold">{f.name || "Your monster"}</p>
        <p className="text-xs text-muted">{f.size_type || "Creature"}{f.cr ? ` · CR ${f.cr}` : ""}</p>
        <p className="mt-1">AC <b>{f.ac}</b> · HP <b>{f.hp}</b> · Init {f.init >= 0 ? `+${f.init}` : f.init}</p>
        <ul className="mt-1 text-soft">{f.actions.filter((a) => a.name).map((a, i) => <li key={i}><b>{a.name}.</b> {a.kind === "attack" ? `+${a.bonus} to hit` : `DC ${a.dc} ${a.ability} save`}, {a.damage} {a.damage_type}</li>)}</ul>
        {f.multiattack > 1 && <p className="text-xs text-muted">Multiattack: {f.multiattack} attacks a turn.</p>}
      </div>
    </div>
  );
}
