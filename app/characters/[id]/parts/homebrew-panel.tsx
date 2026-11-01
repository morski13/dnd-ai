"use client";
// "Own rules" on the Features tab: rules from other books / homebrew that only THIS character has.
// Crit range and extra crit dice (Auto = from the classes), toggles ("Flaming Tongue ignited: +2d6 fire"),
// the character's own actions (they show up on the Attacks tab and roll like everything else), and extra uses.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Resource } from "@/lib/character-data";
import { autoCrit, CUSTOM_KINDS, DAMAGE_TYPES, isDice, type CustomKind, type Homebrew, type HomebrewToggle } from "@/lib/homebrew";
import { ABILITIES, type Attack, type ClassLevel, type TableRow } from "@/lib/rules";
import { isWildSoul } from "@/lib/presets/wild-soul";
import { BottomSheet } from "../../../items/parts/ui";
import { applySubclassPreset, deleteCustomAction, saveCustomAction, saveCustomResource, saveHomebrew } from "../actions";
import { ACTION_LABEL } from "./ui";

const field = "h-11 w-full rounded-xl border border-line bg-bg px-3 text-[15px] outline-none focus:border-accent";
const label = "block text-sm text-soft";

export function HomebrewPanel({ characterId, name, homebrew, setHomebrew, attacks, resources, setResources, classLevels, ruleSet }: {
  characterId: string; name: string; homebrew: Homebrew; setHomebrew: (h: Homebrew) => void;
  attacks: Attack[]; resources: Resource[]; setResources: (r: Resource[]) => void;
  classLevels: ClassLevel[]; ruleSet?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Attack | "new" | null>(null);
  const [toggle, setToggle] = useState<HomebrewToggle | "new" | null>(null);
  const [addUses, setAddUses] = useState(false);
  const auto = autoCrit(classLevels, ruleSet);
  const custom = attacks.filter((a) => a.custom);
  const customUses = resources.filter((r) => (r as Resource & { custom?: boolean }).custom);
  const wildSoul = classLevels.find((x) => /^barbarian$/i.test(x.class) && isWildSoul(x.subclass));
  const [presetDone, setPresetDone] = useState<string | null>(null);
  const presetIn = custom.some((a) => a.name === "Wild Surge");

  function save(next: Homebrew) {
    setError(null);
    setHomebrew(next);
    start(async () => {
      const r = await saveHomebrew(characterId, next);
      if ("error" in r) setError(r.error); else setHomebrew(r.homebrew);
    });
  }

  return (
    <section className="mb-5 rounded-2xl border border-accent-line bg-surface-2 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">{name}&apos;s own rules</p>
      <p className="mt-1 text-sm text-muted">For things from other books or homebrew. Only {name} gets them.</p>
      {error && <p className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

      {wildSoul && (
        <div className="mt-4 rounded-xl border border-line bg-surface p-3">
          <p className="text-sm font-bold">Path of the Wild Soul</p>
          <p className="mt-1 text-xs text-muted">
            {presetIn ? `Set up. Tap again after a level-up to get the new level's features (Barbarian ${wildSoul.level} now).`
              : `Adds everything up to Barbarian ${wildSoul.level}: Wild Surge (rolled by itself when you rage), its 8 effects, Magic Reserves, Arcane Rebuke, Lingering Magic and their uses.`}
          </p>
          {presetDone && <p className="mt-2 text-xs text-success">{presetDone}</p>}
          <button type="button" disabled={pending}
            onClick={() => start(async () => {
              setError(null);
              const r = await applySubclassPreset(characterId);
              if ("error" in r) return setError(r.error);
              setResources(r.resources);
              setPresetDone(`Added: ${r.added.join(", ")}.`);
              router.refresh();
            })}
            className="mt-2 h-10 w-full rounded-lg bg-accent text-sm font-bold text-accent-text disabled:opacity-50">
            {pending ? "Adding…" : presetIn ? "Update Wild Soul rules" : "Add Wild Soul rules"}
          </button>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className={label}>Crits on
          <select className={`${field} mt-1`} disabled={pending} value={homebrew.crit_range ?? ""}
            onChange={(e) => save({ ...homebrew, crit_range: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Auto ({auto.range === 20 ? "20" : `${auto.range}–20`})</option>
            {[20, 19, 18, 17].map((n) => <option key={n} value={n}>{n === 20 ? "20 only" : `${n}–20`}</option>)}
          </select>
        </label>
        <label className={label}>Extra crit dice
          <select className={`${field} mt-1`} disabled={pending} value={homebrew.extra_crit_dice ?? ""}
            onChange={(e) => save({ ...homebrew, extra_crit_dice: e.target.value === "" ? null : Number(e.target.value) })}>
            <option value="">Auto ({auto.extra})</option>
            {[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <p className="mt-1 text-xs text-muted">Extra crit dice: more of the weapon&apos;s own dice on a melee crit, like Brutal Critical.</p>

      <Heading title="Toggles" hint="Switched on and off on the Attacks tab" onAdd={() => setToggle("new")} />
      {(homebrew.toggles ?? []).map((t) => (
        <Row key={t.id} title={t.name} sub={`+${t.damage}${t.damage_type ? ` ${t.damage_type}` : ""} · ${t.applies_to === "*" ? "every weapon" : t.applies_to}`} onEdit={() => setToggle(t)} />
      ))}

      <Heading title="Actions" hint="Shown on the Attacks tab and rolled like the rest" onAdd={() => setEditing("new")} />
      {custom.map((a) => (
        <Row key={a.name} title={a.name} sub={[CUSTOM_KINDS[a.kind as CustomKind], a.damage, a.damage_type, a.resource ? `uses ${a.resource}` : null].filter(Boolean).join(" · ")} onEdit={() => setEditing(a)} />
      ))}

      <Heading title="Extra uses" hint="Limited uses, come back on a rest" onAdd={() => setAddUses(true)} />
      {customUses.map((r) => (
        <Row key={r.name} title={`${r.name} · ${r.max}`} sub={r.recharge ? `back on a ${r.recharge}` : ""} actionLabel="Remove"
          onEdit={() => start(async () => { const res = await saveCustomResource(characterId, null, r.name); if ("error" in res) setError(res.error); else setResources(res.resources); })} />
      ))}

      {toggle && (
        <ToggleForm initial={toggle === "new" ? null : toggle} attacks={attacks} onClose={() => setToggle(null)}
          onSave={(t) => {
            const list = homebrew.toggles ?? [];
            save({ ...homebrew, toggles: toggle === "new" ? [...list, t] : list.map((x) => (x.id === t.id ? t : x)) });
            setToggle(null);
          }}
          onDelete={toggle === "new" ? undefined : () => { save({ ...homebrew, toggles: (homebrew.toggles ?? []).filter((x) => x.id !== (toggle as HomebrewToggle).id) }); setToggle(null); }} />
      )}

      {editing && (
        <ActionForm initial={editing === "new" ? null : editing} resources={resources.map((r) => r.name)} onClose={() => setEditing(null)}
          onSave={async (a) => {
            const r = await saveCustomAction(characterId, a, editing === "new" ? null : editing.name);
            if ("error" in r) return r.error;
            setEditing(null); router.refresh(); return null;
          }}
          onDelete={editing === "new" ? undefined : async () => {
            const r = await deleteCustomAction(characterId, (editing as Attack).name);
            if ("error" in r) return r.error;
            setEditing(null); router.refresh(); return null;
          }} />
      )}

      {addUses && (
        <UsesForm onClose={() => setAddUses(false)} onSave={async (u) => {
          const r = await saveCustomResource(characterId, u);
          if ("error" in r) return r.error;
          setResources(r.resources); setAddUses(false); return null;
        }} />
      )}
    </section>
  );
}

function Heading({ title, hint, onAdd }: { title: string; hint: string; onAdd: () => void }) {
  return (
    <div className="mt-5 flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{title}</p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <button type="button" onClick={onAdd} className="h-9 shrink-0 rounded-lg border border-accent-line px-3 text-sm font-semibold text-accent">+ Add</button>
    </div>
  );
}

function Row({ title, sub, onEdit, actionLabel = "Edit" }: { title: string; sub: string; onEdit: () => void; actionLabel?: string }) {
  return (
    <div className="mt-2 flex items-center gap-3 rounded-xl bg-surface px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{title}</p>
        {sub && <p className="truncate text-xs text-muted">{sub}</p>}
      </div>
      <button type="button" onClick={onEdit} className="h-9 shrink-0 rounded-lg px-3 text-sm text-soft">{actionLabel}</button>
    </div>
  );
}

function FormButtons({ busy, onDelete, saveLabel = "Save" }: { busy: boolean; onDelete?: () => void; saveLabel?: string }) {
  return (
    <div className="mt-5 flex gap-2">
      {onDelete && <button type="button" disabled={busy} onClick={onDelete} className="h-11 rounded-xl border border-danger-line px-4 text-sm text-danger">Delete</button>}
      <button type="submit" disabled={busy} className="h-11 flex-1 rounded-xl bg-accent text-sm font-bold text-accent-text disabled:opacity-50">{busy ? "Saving…" : saveLabel}</button>
    </div>
  );
}

function TypeSelect({ value, onChange, none = "No type" }: { value: string; onChange: (v: string) => void; none?: string }) {
  return (
    <select className={`${field} mt-1`} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{none}</option>
      {DAMAGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
    </select>
  );
}

function ToggleForm({ initial, attacks, onSave, onDelete, onClose }: {
  initial: HomebrewToggle | null; attacks: Attack[]; onSave: (t: HomebrewToggle) => void; onDelete?: () => void; onClose: () => void;
}) {
  const [t, setT] = useState<HomebrewToggle>(() => initial ?? { id: Math.random().toString(36).slice(2, 10), name: "", on: false, applies_to: "*", damage: "", damage_type: "" });
  const [err, setErr] = useState<string | null>(null);
  const weapons = attacks.filter((a) => a.kind === "weapon");
  return (
    <BottomSheet title={initial ? `Edit ${initial.name}` : "New toggle"} onClose={onClose}>
      <form onSubmit={(e) => {
        e.preventDefault();
        if (!t.name.trim()) return setErr("Give it a name, like “Flaming Tongue ignited”.");
        if (!isDice(t.damage)) return setErr("Extra damage: dice like 2d6.");
        onSave({ ...t, name: t.name.trim(), damage: t.damage.replace(/\s/g, "") });
      }}>
        <label className={label}>Name<input className={`${field} mt-1`} value={t.name} maxLength={50} placeholder="Flaming Tongue ignited" onChange={(e) => setT({ ...t, name: e.target.value })} /></label>
        <label className={`${label} mt-3`}>Works on
          <select className={`${field} mt-1`} value={t.applies_to} onChange={(e) => setT({ ...t, applies_to: e.target.value })}>
            <option value="*">Every weapon attack</option>
            {weapons.map((w) => <option key={w.name} value={w.name}>{w.name}</option>)}
            {t.applies_to !== "*" && !weapons.some((w) => w.name === t.applies_to) && <option value={t.applies_to}>{t.applies_to}</option>}
          </select>
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className={label}>Extra damage<input className={`${field} mt-1`} value={t.damage} placeholder="2d6" onChange={(e) => setT({ ...t, damage: e.target.value })} /></label>
          <label className={label}>Type<TypeSelect value={t.damage_type ?? ""} onChange={(v) => setT({ ...t, damage_type: v })} /></label>
        </div>
        {err && <p className="mt-3 text-sm text-danger">{err}</p>}
        <FormButtons busy={false} onDelete={onDelete} />
      </form>
    </BottomSheet>
  );
}

function UsesForm({ onSave, onClose }: { onSave: (u: { name: string; max: number; recharge: string }) => Promise<string | null>; onClose: () => void }) {
  const [u, setU] = useState({ name: "", max: 1, recharge: "long rest" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <BottomSheet title="New limited uses" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); start(async () => setErr(await onSave(u))); }}>
        <label className={label}>Name<input className={`${field} mt-1`} value={u.name} maxLength={40} placeholder="Arcane Rebuke" onChange={(e) => setU({ ...u, name: e.target.value })} /></label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className={label}>Uses<input type="number" min={1} max={99} className={`${field} mt-1`} value={u.max} onChange={(e) => setU({ ...u, max: Number(e.target.value) })} /></label>
          <label className={label}>Come back on
            <select className={`${field} mt-1`} value={u.recharge} onChange={(e) => setU({ ...u, recharge: e.target.value })}>
              <option value="short rest">a short rest</option><option value="long rest">a long rest</option><option value="dawn">dawn</option><option value="never">never (by hand)</option>
            </select>
          </label>
        </div>
        {err && <p className="mt-3 text-sm text-danger">{err}</p>}
        <FormButtons busy={busy} saveLabel="Add" />
      </form>
    </BottomSheet>
  );
}

type Draft = {
  name: string; kind: CustomKind; action: string; damage: string; damage_type: string; ability: string; add_mod: boolean;
  bonus: number; ranged: boolean; save_ability: string; half_on_save: boolean; damage_bonus: number; applies: string;
  once_per_turn: boolean; gives_advantage: boolean; resource: string; range: string; note: string;
  trigger_on: string; many: boolean; dc_ability: string; spend_rolled: boolean;
  temp_hp: string; self_damage_x: number; self_damage_type: string; table: TableRow[];
};

function ActionForm({ initial, resources, onSave, onDelete, onClose }: {
  initial: Attack | null; resources: string[]; onSave: (a: Attack) => Promise<string | null>; onDelete?: () => Promise<string | null>; onClose: () => void;
}) {
  const [d, setD] = useState<Draft>({
    name: initial?.name ?? "", kind: (initial?.kind as CustomKind) ?? "damage_only", action: initial?.action ?? "action",
    damage: initial?.damage ?? "", damage_type: initial?.damage_type ?? "", ability: String(initial?.ability ?? ""), add_mod: !!initial?.add_mod,
    bonus: initial?.bonus ?? 0, ranged: !!initial?.ranged, save_ability: initial?.save_ability ?? "DEX", half_on_save: !!initial?.half_on_save,
    damage_bonus: initial?.damage_bonus ?? 0, applies: initial?.applies ?? "weapon", once_per_turn: !!initial?.once_per_turn,
    gives_advantage: !!initial?.gives_advantage, resource: initial?.resource ?? "", range: initial?.range ?? "", note: initial?.note ?? "",
    trigger_on: initial?.trigger_on ?? "", many: !!initial?.many, dc_ability: initial?.dc_ability ?? "", spend_rolled: !!initial?.spend_rolled,
    temp_hp: initial?.then?.temp_hp ?? "", self_damage_x: initial?.then?.self_damage_x ?? 0, self_damage_type: initial?.then?.self_damage_type ?? "",
    table: initial?.table ?? [],
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const set = (p: Partial<Draft>) => setD({ ...d, ...p });
  const k = d.kind;
  const check = (text: string, on: boolean, onChange: (v: boolean) => void) => (
    <label className="mt-3 flex min-h-10 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 accent-[var(--color-accent)]" checked={on} onChange={(e) => onChange(e.target.checked)} />{text}</label>
  );

  return (
    <BottomSheet title={initial ? `Edit ${initial.name}` : "New action"} onClose={onClose}>
      <form onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        const then = { temp_hp: d.temp_hp || undefined, self_damage_x: d.self_damage_x || undefined, self_damage_type: d.self_damage_type || undefined };
        start(async () => setErr(await onSave({ ...d, kind: k, then } as unknown as Attack)));
      }}>
        <label className={label}>Name<input className={`${field} mt-1`} value={d.name} maxLength={50} placeholder="Wild Surge" onChange={(e) => set({ name: e.target.value })} /></label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className={label}>What it is
            <select className={`${field} mt-1`} value={k} onChange={(e) => set({ kind: e.target.value as CustomKind, action: e.target.value === "boost" ? "free" : d.action, add_mod: e.target.value === "weapon" ? true : d.add_mod })}>
              {Object.entries(CUSTOM_KINDS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </label>
          <label className={label}>Takes
            <select className={`${field} mt-1`} value={d.action} onChange={(e) => set({ action: e.target.value })}>
              {(["action", "bonus", "reaction", "free", "other"] as const).map((a) => <option key={a} value={a}>{a === "free" ? "Free / no action" : ACTION_LABEL[a] ?? a}</option>)}
            </select>
          </label>
        </div>

        {k === "table" ? (
          <div className="mt-3">
            <label className={label}>Table die<input className={`${field} mt-1`} value={d.damage} placeholder="1d8" onChange={(e) => set({ damage: e.target.value })} /></label>
            <RowsEditor rows={d.table} sides={Number(d.damage.match(/^1d(\d+)$/i)?.[1] ?? 0)} onChange={(table) => set({ table })} />
          </div>
        ) : k === "boost" ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className={label}>Extra dice per hit<input className={`${field} mt-1`} value={d.damage} placeholder="1d6" onChange={(e) => set({ damage: e.target.value })} /></label>
            <label className={label}>Or flat extra<input type="number" min={0} max={20} className={`${field} mt-1`} value={d.damage_bonus} onChange={(e) => set({ damage_bonus: Number(e.target.value) })} /></label>
            <label className={`${label} col-span-2`}>Works on
              <select className={`${field} mt-1`} value={d.applies} onChange={(e) => set({ applies: e.target.value })}>
                <option value="weapon">Weapon attacks</option><option value="str_weapon">Strength weapon attacks</option>
                <option value="finesse_ranged">Finesse or ranged weapons</option><option value="attack">Any attack</option>
              </select>
            </label>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className={label}>{k === "heal" ? "Heals" : "Damage"}<input className={`${field} mt-1`} value={d.damage} placeholder={k === "heal" ? "2d8" : "1d10"} onChange={(e) => set({ damage: e.target.value })} /></label>
            {k !== "heal" && <label className={label}>Type<TypeSelect value={d.damage_type} onChange={(v) => set({ damage_type: v })} /></label>}
          </div>
        )}
        {d.damage && !isDice(d.damage.replace(/\s/g, "")) && <p className="mt-1 text-xs text-danger">Write dice like 1d10 or 2d6+3.</p>}

        {k === "weapon" && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className={label}>Uses
              <select className={`${field} mt-1`} value={d.ability || "STR"} onChange={(e) => set({ ability: e.target.value })}>
                <option value="STR">Strength</option><option value="DEX">Dexterity</option><option value="finesse">Better of the two</option>
              </select>
            </label>
            <label className={label}>Magic bonus<input type="number" min={-5} max={5} className={`${field} mt-1`} value={d.bonus} onChange={(e) => set({ bonus: Number(e.target.value) })} /></label>
          </div>
        )}
        {k === "save" && (
          <label className={`${label} mt-3`}>Targets save with
            <select className={`${field} mt-1`} value={d.save_ability} onChange={(e) => set({ save_ability: e.target.value })}>
              {ABILITIES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
        )}
        {(k === "damage_only" || k === "heal" || k === "roll") && (
          <label className={`${label} mt-3`}>Add a modifier
            <select className={`${field} mt-1`} value={d.add_mod ? d.ability : ""} onChange={(e) => set({ ability: e.target.value, add_mod: !!e.target.value })}>
              <option value="">No</option>{ABILITIES.map((a) => <option key={a} value={a}>{a}</option>)}<option value="spell">Spellcasting ability</option>
            </select>
          </label>
        )}
        {k === "weapon" && check("Add the ability modifier to damage", d.add_mod, (v) => set({ add_mod: v }))}
        {k === "weapon" && check("Ranged weapon", d.ranged, (v) => set({ ranged: v }))}
        {(k === "spell_attack" || k === "save") && check("Add the spellcasting modifier to damage", d.add_mod, (v) => set({ add_mod: v }))}
        {k === "save" && check("Half damage on a successful save", d.half_on_save, (v) => set({ half_on_save: v }))}
        {k === "boost" && check("Once per turn", d.once_per_turn, (v) => set({ once_per_turn: v }))}
        {k === "boost" && check("Gives advantage", d.gives_advantage, (v) => set({ gives_advantage: v }))}
        {(k === "damage_only" || k === "save" || k === "heal") && check("Hits several creatures (an area)", d.many, (v) => set({ many: v }))}
        {(k === "save" || k === "table") && (
          <label className={`${label} mt-3`}>Save DC uses
            <select className={`${field} mt-1`} value={d.dc_ability} onChange={(e) => set({ dc_ability: e.target.value })}>
              <option value="">Spellcasting ability</option>{ABILITIES.map((a) => <option key={a} value={a}>8 + proficiency + {a}</option>)}
            </select>
          </label>
        )}

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className={label}>Spends
            <select className={`${field} mt-1`} value={d.resource} onChange={(e) => set({ resource: e.target.value })}>
              <option value="">Nothing</option>{resources.map((r) => <option key={r} value={r}>a use of {r}</option>)}
            </select>
          </label>
          <label className={label}>Range / area<input className={`${field} mt-1`} value={d.range} maxLength={30} placeholder="30 ft around me" onChange={(e) => set({ range: e.target.value })} /></label>
        </div>
        {(k === "roll" || k === "damage_only" || k === "heal") && d.resource && check("Spends as many uses as the roll shows", d.spend_rolled, (v) => set({ spend_rolled: v }))}
        <label className={`${label} mt-3`}>Rolls by itself when
          <select className={`${field} mt-1`} value={d.trigger_on} onChange={(e) => set({ trigger_on: e.target.value })}>
            <option value="">Only when I tap it</option>{resources.map((r) => <option key={r} value={r}>a use of {r} is spent</option>)}
          </select>
        </label>
        {k !== "table" && k !== "boost" && (
          <details className="mt-3 rounded-xl border border-line px-3 py-2">
            <summary className="cursor-pointer text-sm text-soft">Afterwards, to me…</summary>
            <div className="mt-2 grid grid-cols-2 gap-3 pb-1">
              <label className={`${label} col-span-2`}>Temp HP
                <select className={`${field} mt-1`} value={d.temp_hp} onChange={(e) => set({ temp_hp: e.target.value })}>
                  <option value="">None</option><option value="dealt">Equal to the damage dealt</option><option value="rolled">Equal to the roll</option>
                </select>
              </label>
              <label className={label}>I take damage: roll ×<input type="number" min={0} max={10} className={`${field} mt-1`} value={d.self_damage_x} onChange={(e) => set({ self_damage_x: Number(e.target.value) })} /></label>
              <label className={label}>Type<TypeSelect value={d.self_damage_type} onChange={(v) => set({ self_damage_type: v })} /></label>
            </div>
          </details>
        )}
        <label className={`${label} mt-3`}>Note<input className={`${field} mt-1`} value={d.note} maxLength={200} placeholder="You gain temp HP equal to the damage dealt" onChange={(e) => set({ note: e.target.value })} /></label>
        {(k === "save" || k === "spell_attack") && <p className="mt-2 text-xs text-muted">Save DC and spell attack use the spellcasting ability on the Spells tab.</p>}

        {err && <p className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{err}</p>}
        <FormButtons busy={busy} onDelete={onDelete ? () => start(async () => setErr(await onDelete())) : undefined} />
      </form>
    </BottomSheet>
  );
}

const ROW_KINDS: Record<string, string> = { "": "Nothing to roll", damage_only: "Damage", save: "Saving throw", heal: "Healing", roll: "Just a roll" };

/** The rows of a roll table: numbers, a name, what happens, and (optionally) what to roll when it comes up. */
function RowsEditor({ rows, sides, onChange }: { rows: TableRow[]; sides: number; onChange: (rows: TableRow[]) => void }) {
  const set = (i: number, p: Partial<TableRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const setEffect = (i: number, p: Partial<NonNullable<TableRow["effect"]>>) => {
    const cur = rows[i].effect ?? { kind: "damage_only" as const };
    const next = { ...cur, ...p };
    set(i, { effect: next.kind ? next : null });
  };
  const nextMin = rows.length ? Math.max(...rows.map((r) => r.max)) + 1 : 1;
  return (
    <div className="mt-3 space-y-2">
      <p className="text-sm text-soft">Rows {sides ? `(1–${sides}, every number once)` : ""}</p>
      {rows.map((r, i) => (
        <div key={i} className="rounded-xl border border-line p-2">
          <div className="grid grid-cols-[3.5rem_3.5rem_1fr_auto] gap-2">
            <input aria-label="From" type="number" min={1} className={field} value={r.min} onChange={(e) => set(i, { min: Number(e.target.value) })} />
            <input aria-label="To" type="number" min={1} className={field} value={r.max} onChange={(e) => set(i, { max: Number(e.target.value) })} />
            <input aria-label="Row name" className={field} value={r.name} maxLength={40} placeholder="Name" onChange={(e) => set(i, { name: e.target.value })} />
            <button type="button" aria-label="Remove row" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="h-11 px-2 text-danger">✕</button>
          </div>
          <textarea aria-label="What happens" className="mt-2 min-h-16 w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
            maxLength={300} placeholder="What happens" value={r.text ?? ""} onChange={(e) => set(i, { text: e.target.value })} />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <select aria-label="Roll" className={field} value={r.effect?.kind ?? ""} onChange={(e) => (e.target.value ? setEffect(i, { kind: e.target.value as NonNullable<TableRow["effect"]>["kind"] }) : set(i, { effect: null }))}>
              {Object.entries(ROW_KINDS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
            {r.effect && <input aria-label="Dice" className={field} value={r.effect.damage ?? ""} placeholder="2d8" onChange={(e) => setEffect(i, { damage: e.target.value })} />}
            {r.effect && r.effect.kind !== "heal" && r.effect.kind !== "roll" && <TypeSelect value={r.effect.damage_type ?? ""} onChange={(v) => setEffect(i, { damage_type: v })} />}
            {r.effect?.kind === "save" && (
              <select aria-label="Save" className={field} value={r.effect.save_ability ?? "DEX"} onChange={(e) => setEffect(i, { save_ability: e.target.value as NonNullable<TableRow["effect"]>["save_ability"] })}>
                {ABILITIES.map((a) => <option key={a} value={a}>{a} save</option>)}
              </select>
            )}
          </div>
          {r.effect && (
            <div className="mt-1 flex flex-wrap gap-x-4">
              <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={!!r.effect.many} onChange={(e) => setEffect(i, { many: e.target.checked })} />Area</label>
              {r.effect.kind === "save" && <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={!!r.effect.half_on_save} onChange={(e) => setEffect(i, { half_on_save: e.target.checked })} />Half on a save</label>}
              {r.effect.kind === "damage_only" && <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={r.effect.then?.temp_hp === "dealt"} onChange={(e) => setEffect(i, { then: e.target.checked ? { temp_hp: "dealt" } : undefined })} />Temp HP = damage dealt</label>}
            </div>
          )}
        </div>
      ))}
      {(!sides || nextMin <= sides) && (
        <button type="button" onClick={() => onChange([...rows, { min: nextMin, max: nextMin, name: "", text: "", effect: null }])}
          className="h-10 w-full rounded-lg border border-dashed border-line text-sm text-soft">+ Row</button>
      )}
    </div>
  );
}
