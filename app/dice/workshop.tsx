"use client";
// The dice workshop screen.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { roll } from "@/lib/dice";
import type { DieType } from "@/lib/dice3d/shapes";
import { DEFAULT_SKIN, FINISHES, FONTS, PATTERNS, PRESETS, type DiceSkin, type Pattern } from "@/lib/dice3d/skin";
import { paintPattern, TEX } from "@/lib/dice3d/textures";
import { useDice } from "../components/dice/dice-provider";
import { deleteSkin, saveSkin } from "./actions";
import { Pictures } from "./parts/pictures";
import { DicePreview, PREVIEW_TYPES } from "./parts/preview";

export type SavedSkin = { id: string; skin: DiceSkin; active: boolean };

const FINISH_LABEL: Record<string, string> = { glossy: "Glossy", matte: "Matte", metal: "Metal", pearl: "Pearl", crystal: "Crystal" };
const FONT_LABEL: Record<string, string> = { classic: "Classic", modern: "Modern", storybook: "Storybook", typewriter: "Typewriter" };
const FONT_CSS: Record<string, string> = { classic: "var(--font-spectral)", modern: "var(--font-manrope)", storybook: "Georgia, serif", typewriter: "'Courier New', monospace" };
const TESTS = ["1d20", "2d20kh1", "1d4", "1d6", "1d8", "1d10", "1d12", "1d100", "8d6"];

export function Workshop({ sets }: { sets: SavedSkin[] }) {
  const router = useRouter();
  const dice = useDice();
  const active = sets.find((s) => s.active) ?? null;
  const [editingId, setEditingId] = useState<string | null>(active?.id ?? null);
  const [draft, setDraft] = useState<DiceSkin>(active?.skin ?? DEFAULT_SKIN);
  const [view, setView] = useState<DieType | "all">("d20");
  const [msg, setMsg] = useState<{ text: string; tone: "ok" | "err" } | null>(null);
  const [pending, start] = useTransition();
  const set = (s: Partial<DiceSkin>) => setDraft((d) => ({ ...d, ...s }));
  const saved = sets.find((s) => s.id === editingId);
  const dirty = !saved || JSON.stringify(saved.skin) !== JSON.stringify(draft);

  function pick(id: string | null, skin: DiceSkin) {
    setEditingId(id);
    setDraft(skin);
    setMsg(null);
  }

  function save(asNew: boolean) {
    setMsg(null);
    start(async () => {
      const res = await saveSkin(asNew ? null : editingId, draft);
      if ("error" in res) return setMsg({ text: res.error, tone: "err" });
      setEditingId(res.id);
      setDraft(res.skin);
      dice.setSkin(res.skin);
      setMsg({ text: "Saved. You roll with these dice now.", tone: "ok" });
      router.refresh();
    });
  }

  function testThrow(expr: string) {
    const r = roll(expr);
    void dice.show({ ...r, label: `Test: ${expr.replace("2d20kh1", "advantage")}` }, { skin: draft, force: true });
  }

  return (
    <>
      <header className="flex items-end justify-between gap-3">
        <div>
          <Link href="/" className="text-xs uppercase tracking-[0.12em] text-muted">← Home</Link>
          <h1 className="mt-1 font-heading text-3xl font-bold">Dice workshop</h1>
        </div>
        {active && <p className="pb-1 text-right text-xs text-muted">Rolling with<br /><span className="font-semibold text-soft">{active.skin.name}</span></p>}
      </header>

      <div className="mt-5">
        <DicePreview skin={draft} view={view} />
        <div className="-mx-5 mt-2 flex gap-1.5 overflow-x-auto px-5 pb-1">
          {[...PREVIEW_TYPES, "all" as const].map((t) => (
            <button key={t} type="button" onClick={() => setView(t)}
              className={`h-9 shrink-0 rounded-full border px-3.5 text-xs font-bold ${view === t ? "border-accent bg-accent-surface text-accent" : "border-line text-soft"}`}>
              {t === "all" ? "All" : t}
            </button>
          ))}
        </div>
      </div>

      {/* Test throws: not saved anywhere */}
      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <p className="text-sm font-bold">Test throw</p>
        <p className="text-xs text-muted">Throws these dice across the screen. Test throws aren&apos;t saved.</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TESTS.map((t) => (
            <button key={t} type="button" onClick={() => testThrow(t)} className="h-9 rounded-lg border border-line bg-bg px-3 text-xs font-semibold text-soft">
              {t === "2d20kh1" ? "d20 adv" : t === "8d6" ? "Fireball 8d6" : t.replace(/^1/, "")}
            </button>
          ))}
        </div>
      </section>

      {/* Sets */}
      <Section title="Your dice sets">
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
          {sets.map((s) => (
            <SetChip key={s.id} skin={s.skin} on={editingId === s.id} badge={s.active ? "rolling" : undefined} onClick={() => pick(s.id, s.skin)} />
          ))}
          <button type="button" onClick={() => pick(null, { ...draft, name: "New dice", images: {} })}
            className="flex h-[74px] w-20 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-line text-xs text-muted">
            <span className="text-xl leading-none">+</span>New
          </button>
        </div>
        <p className="mt-3 text-xs text-muted">Start from a ready-made look:</p>
        <div className="-mx-5 mt-1.5 flex gap-2 overflow-x-auto px-5 pb-1">
          {PRESETS.map((p) => (
            <SetChip key={p.name} skin={p} on={false} onClick={() => setDraft((d) => ({ ...p, name: editingId ? d.name : p.name, images: d.images, numbersOnPictures: d.numbersOnPictures, allOpacity: d.allOpacity }))} />
          ))}
        </div>
      </Section>

      <Section title="Look">
        <label className="block text-sm">
          <span className="text-muted">Name</span>
          <input value={draft.name} onChange={(e) => set({ name: e.target.value.slice(0, 40) })} maxLength={40}
            className="mt-1 h-11 w-full rounded-xl border border-line bg-bg px-3 text-[15px] outline-none focus:border-accent" />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Color label="Dice color" value={draft.body} onChange={(v) => set({ body: v })} />
          <Color label="Second color" value={draft.accent} onChange={(v) => set({ accent: v })} />
          <Color label="Numbers" value={draft.ink} onChange={(v) => set({ ink: v })} />
          <Color label="Number outline" value={draft.outline} onChange={(v) => set({ outline: v })} />
        </div>

        <p className="mt-4 text-sm text-muted">Pattern</p>
        <div className="mt-1.5 grid grid-cols-5 gap-2">
          {PATTERNS.map((p) => (
            <button key={p} type="button" onClick={() => set({ pattern: p })} aria-pressed={draft.pattern === p}
              className={`overflow-hidden rounded-xl border-2 ${draft.pattern === p ? "border-accent" : "border-transparent"}`}>
              <Swatch skin={draft} pattern={p} />
              <span className="block bg-surface-2 py-1 text-[10px] font-semibold capitalize text-soft">{p}</span>
            </button>
          ))}
        </div>

        <p className="mt-4 text-sm text-muted">Finish</p>
        <Chips options={FINISHES} value={draft.finish} label={(f) => FINISH_LABEL[f]} onChange={(f) => set({ finish: f })} />

        <p className="mt-4 text-sm text-muted">Number style</p>
        <div className="mt-1.5 grid grid-cols-4 gap-2">
          {FONTS.map((f) => (
            <button key={f} type="button" onClick={() => set({ font: f })} aria-pressed={draft.font === f}
              className={`rounded-xl border py-2 ${draft.font === f ? "border-accent bg-accent-surface" : "border-line"}`}>
              <span className="block text-2xl font-bold" style={{ fontFamily: FONT_CSS[f] }}>20</span>
              <span className="block text-[10px] text-muted">{FONT_LABEL[f]}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Your pictures">
        <p className="-mt-1 mb-3 text-xs text-muted">PNG with a see-through background works best. Pictures are shrunk to fit.</p>
        <Pictures skin={draft} set={set} onError={(e) => setMsg({ text: e, tone: "err" })} />
      </Section>

      <Settings />

      {/* Save bar */}
      <div className="sticky bottom-20 z-10 mt-6 rounded-2xl border border-line bg-surface-2/95 p-3 backdrop-blur">
        {msg && <p className={`mb-2 text-sm ${msg.tone === "ok" ? "text-success" : "text-danger"}`} role="status">{msg.text}</p>}
        <div className="flex gap-2">
          <button type="button" disabled={pending || (!dirty && saved?.active)} onClick={() => save(false)}
            className="h-12 flex-1 rounded-xl bg-accent text-[15px] font-bold text-accent-text">
            {pending ? "Saving…" : editingId ? (dirty ? "Save & roll with these" : saved?.active ? "Rolling with these" : "Roll with these") : "Save & roll with these"}
          </button>
          {editingId && (
            <button type="button" disabled={pending} onClick={() => save(true)} className="h-12 rounded-xl border border-line px-3 text-sm font-semibold text-soft">Save as new</button>
          )}
        </div>
        {editingId && (
          <button type="button" disabled={pending} onClick={() => {
            if (!confirm(`Delete "${draft.name}"?`)) return;
            start(async () => {
              const r = await deleteSkin(editingId);
              if ("error" in r) return setMsg({ text: r.error, tone: "err" });
              pick(null, DEFAULT_SKIN);
              router.refresh();
            });
          }} className="mt-2 w-full text-center text-xs text-muted underline">Delete this set</button>
        )}
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 font-heading text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex h-12 cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-3 text-sm">
      <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full border border-white/20" style={{ background: value }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={label} />
      </span>
      <span className="text-soft">{label}</span>
    </label>
  );
}

function Chips<T extends string>({ options, value, label, onChange }: { options: readonly T[]; value: T; label: (t: T) => string; onChange: (t: T) => void }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)} aria-pressed={value === o}
          className={`h-10 rounded-full border px-4 text-sm font-semibold ${value === o ? "border-accent bg-accent-surface text-accent" : "border-line text-soft"}`}>
          {label(o)}
        </button>
      ))}
    </div>
  );
}

/** A little square showing what a pattern looks like in your colors. */
function Swatch({ skin, pattern }: { skin: DiceSkin; pattern: Pattern }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.save();
    ctx.scale(c.width / TEX, c.height / TEX);
    paintPattern(ctx, { ...skin, pattern }, 3);
    ctx.restore();
  }, [skin, pattern]);
  return <canvas ref={ref} width={96} height={72} className="block h-12 w-full" aria-hidden />;
}

function SetChip({ skin, on, badge, onClick }: { skin: DiceSkin; on: boolean; badge?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`relative flex h-[74px] w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 bg-surface ${on ? "border-accent" : "border-line"}`}>
      <span className="flex h-9 w-9 items-center justify-center rounded-lg font-heading text-sm font-bold shadow-inner"
        style={{ background: `linear-gradient(135deg, ${skin.body}, ${skin.accent})`, color: skin.ink, textShadow: `0 0 2px ${skin.outline}` }}>20</span>
      <span className="w-full truncate px-1 text-[11px] font-semibold text-soft">{skin.name}</span>
      {badge && <span className="absolute -top-2 rounded-full bg-accent px-1.5 text-[9px] font-bold uppercase text-accent-text">{badge}</span>}
    </button>
  );
}

function Settings() {
  const { settings, setSettings } = useDice();
  return (
    <Section title="Settings on this device">
      <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
        <Toggle label="3D dice" sub="Dice roll across the screen when you roll" on={settings.enabled} onChange={(v) => setSettings({ ...settings, enabled: v })} />
        <Toggle label="Dice sounds" sub="Clatter, plus a chime on a natural 20" on={settings.sound} onChange={(v) => setSettings({ ...settings, sound: v })} />
      </div>
    </Section>
  );
}

function Toggle({ label, sub, on, onChange }: { label: string; sub: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-muted">{sub}</span>
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-line"}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-text shadow transition-[left] duration-200 ${on ? "left-6" : "left-1"}`} />
      </span>
    </button>
  );
}
