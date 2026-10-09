"use client";
// The 3D dice overlay. Any screen can call `useDice().show(result)` after the server rolled:
// the dice tumble across the screen and land on exactly that result.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { diceToThrow } from "@/lib/dice3d/shapes";
import { DEFAULT_SKIN, sanitizeSkin, type DiceSkin } from "@/lib/dice3d/skin";
import type { DiceStage } from "@/lib/dice3d/stage";
import { createClient } from "@/lib/supabase/client";

export type ShownRoll = {
  expression: string;
  diceAll: number[];
  dice: number[];
  total: number | null;
  isCrit?: boolean;
  isFumble?: boolean;
  label?: string;
  tone?: "heal" | "damage" | "plain";
};

export type DiceSettings = { enabled: boolean; sound: boolean };

type Ctx = {
  show: (r: ShownRoll, opts?: { skin?: DiceSkin; force?: boolean }) => Promise<void>;
  settings: DiceSettings;
  setSettings: (s: DiceSettings) => void;
  skin: DiceSkin;
  setSkin: (s: DiceSkin) => void; // after saving in the workshop
  loadStage: () => Promise<typeof import("@/lib/dice3d/stage")>;
};

const DiceContext = createContext<Ctx | null>(null);

export function useDice() {
  const c = useContext(DiceContext);
  if (!c) throw new Error("useDice must be used inside <DiceProvider>");
  return c;
}

const KEY = "dice-settings";
const SERVER_SETTINGS: DiceSettings = { enabled: true, sound: true };
let cached: DiceSettings | null = null;
const listeners = new Set<() => void>();
function readSettings(): DiceSettings {
  if (cached) return cached;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const fallback = { enabled: !reduce, sound: true };
  try {
    const raw = localStorage.getItem(KEY);
    cached = raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch { cached = fallback; }
  return cached!;
}
function writeSettings(s: DiceSettings) {
  cached = s;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
  listeners.forEach((f) => f());
}
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

let stageModule: Promise<typeof import("@/lib/dice3d/stage")> | null = null;
const loadStage = () => (stageModule ??= import("@/lib/dice3d/stage"));

type Phase = "idle" | "rolling" | "landed";

export function DiceProvider({ children }: { children: React.ReactNode }) {
  const settings = useSyncExternalStore(subscribe, readSettings, () => SERVER_SETTINGS);
  const [skin, setSkin] = useState<DiceSkin>(DEFAULT_SKIN);
  const [phase, setPhase] = useState<Phase>("idle");
  const [roll, setRoll] = useState<ShownRoll | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<DiceStage | null>(null);
  const skinLoaded = useRef(false);
  const close = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setSettings = useCallback((s: DiceSettings) => writeSettings(s), []);

  // Your active dice, loaded the first time you roll.
  const ensureSkin = useCallback(async () => {
    if (skinLoaded.current) return;
    skinLoaded.current = true;
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getClaims();
      const uid = auth?.claims?.sub;
      if (!uid) return;
      const { data } = await supabase.from("dice_skins").select("data").eq("user_id", uid).eq("is_active", true).maybeSingle();
      const s = sanitizeSkin(data?.data);
      if (s) setSkin(s);
    } catch { /* keep the default dice */ }
  }, []);

  const skinRef = useRef(skin);
  useEffect(() => { skinRef.current = skin; }, [skin]);

  const finish = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setPhase("idle");
    const c = close.current;
    close.current = null;
    c?.();
  }, []);

  const show = useCallback(async (r: ShownRoll, opts?: { skin?: DiceSkin; force?: boolean }) => {
    const dice = diceToThrow(r.expression, r.diceAll, r.dice);
    if ((!settings.enabled && !opts?.force) || !dice.length || typeof window === "undefined") return;
    if (close.current) finish(); // a roll is still on screen: end it first
    try {
      await ensureSkin();
      const mod = await loadStage();
      if (!stage.current && host.current) stage.current = new mod.DiceStage(host.current);
      const st = stage.current;
      if (!st) return;
      setRoll(r);
      setPhase("rolling");
      await st.useSkin(opts?.skin ?? skinRef.current);
      await new Promise<void>((resolve) => {
        close.current = resolve;
        // Never leave the overlay stuck: if anything goes wrong it closes by itself.
        const safety = setTimeout(finish, 12000);
        const landed = async () => {
          clearTimeout(safety);
          setPhase("landed");
          if (r.isCrit || r.isFumble) {
            navigator.vibrate?.(r.isCrit ? [25, 40, 70] : [120]);
            if (settings.sound) (await import("@/lib/dice3d/sound")).playCue(r.isCrit ? "crit" : "fumble");
          } else navigator.vibrate?.(12);
          // (tests can set window.__diceHold to keep the result up until tapped)
          if (!(window as unknown as { __diceHold?: boolean }).__diceHold) timer.current = setTimeout(finish, r.isCrit || r.isFumble ? 1900 : 1150);
        };
        // let the overlay appear first so the canvas has its size
        let started = false;
        const start = () => {
          if (started) return;
          started = true;
          try {
            st.play(dice, { sound: settings.sound }).then(landed, (e) => { console.warn("dice", e); finish(); });
          } catch (e) { console.warn("dice", e); finish(); }
        };
        requestAnimationFrame(start);
        setTimeout(start, 60);
      });
    } catch (e) {
      // No WebGL or something went wrong: just skip the animation.
      console.warn("3D dice unavailable", e);
      setPhase("idle");
    }
  }, [settings, ensureSkin, finish]);

  // Keep the canvas sized to the screen
  useEffect(() => {
    const onResize = () => stage.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onTap = () => {
    if (phase === "rolling") stage.current?.skip();
    else if (phase === "landed") finish();
  };

  const value = useMemo<Ctx>(() => ({
    show, settings, setSettings, skin,
    setSkin: (s) => { skinLoaded.current = true; setSkin(s); },
    loadStage,
  }), [show, settings, setSettings, skin]);

  const visible = phase !== "idle";
  const kind = roll?.isCrit ? "crit" : roll?.isFumble ? "fumble" : roll?.tone === "heal" ? "heal" : "plain";

  return (
    <DiceContext.Provider value={value}>
      {children}
      <div
        className={`dice-overlay fixed inset-0 z-[60] ${visible ? "is-open" : "pointer-events-none"}`}
        aria-hidden={!visible}
        onClick={onTap}
        data-phase={phase}
      >
        <div className="dice-backdrop absolute inset-0" />
        <div ref={host} className="absolute inset-0" />
        {roll && phase === "landed" && (
          <div className={`dice-result dice-result--${kind} pointer-events-none absolute inset-x-0 top-[16%] flex flex-col items-center text-center`} role="status">
            {roll.label && <p className="text-xs font-bold uppercase tracking-[0.16em] text-soft drop-shadow">{roll.label}</p>}
            <p className="dice-total font-heading font-bold leading-none">{roll.total}</p>
            {kind === "crit" && <p className="mt-1 font-heading text-xl font-bold text-accent">Natural 20!</p>}
            {kind === "fumble" && <p className="mt-1 font-heading text-xl font-bold text-danger">Natural 1…</p>}
            {kind === "crit" && <Sparks />}
          </div>
        )}
        {phase === "rolling" && <p className="pointer-events-none absolute inset-x-0 bottom-8 text-center text-xs text-muted">Tap to skip</p>}
      </div>
    </DiceContext.Provider>
  );
}

function Sparks() {
  return (
    <div className="dice-sparks" aria-hidden>
      {Array.from({ length: 18 }, (_, i) => (
        <span key={i} style={{ "--a": `${i * 20}deg`, "--d": `${70 + (i % 4) * 22}px`, "--t": `${(i % 5) * 40}ms` } as React.CSSProperties} />
      ))}
    </div>
  );
}

/** A saved character roll, ready for the overlay. */
export function asShown(r: { label: string; rollType: string; expression: string; total: number | null; dice: number[]; diceAll: number[]; isCrit: boolean; isFumble: boolean }): ShownRoll {
  return {
    expression: r.expression, total: r.total, dice: r.dice, diceAll: r.diceAll, isCrit: r.isCrit, isFumble: r.isFumble,
    label: r.label, tone: r.rollType === "heal" ? "heal" : r.rollType === "damage" ? "damage" : "plain",
  };
}
