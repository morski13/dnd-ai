"use client";
// The battle map in Session mode: tokens, moving on your turn (the squares you can reach light up first),
// Dash, teleport spells, area spells placed on the map, and the DM's free move / hide tools.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { inRange, place, squaresIn, tokensIn, type Placed } from "@/lib/maps/area";
import { freeAt, reachable, squares } from "@/lib/maps/move";
import type { Battle, BattleToken } from "@/lib/maps-data";
import type { Combatant } from "@/lib/session-data";
import { Board, type Pt } from "../../components/map/board";
import { PortraitButton } from "../../components/map/portrait";
import { castArea, dashToken, moveToken, setTokenHidden, teleportToken } from "../map-actions";
import { useMapAim } from "./map-aim";

export type Teleport = { key: string; name: string; range: number };

const sideColor = (t: BattleToken) => (t.kind === "pc" ? "var(--color-accent)" : t.kind === "npc" ? "#6FB36A" : "#D9534A");

export function BattleMap({ battle, combatants, isDm, teleports = [], teleportCharacterId = null }: {
  battle: Battle; combatants: Combatant[]; isDm: boolean; teleports?: Teleport[]; teleportCharacterId?: string | null;
}) {
  const router = useRouter();
  const ctx = useMapAim();
  const aim = ctx?.aim ?? null;
  const { map, currentCombatantId } = battle;
  const [optimistic, setOptimistic] = useState<Record<string, Pt>>({});
  const [selId, setSelId] = useState<string | null>(null);
  const [free, setFree] = useState(false);
  const [tele, setTele] = useState<Teleport | null>(null);
  const [aimPt, setAimPt] = useState<Pt | null>(null);
  const [hover, setHover] = useState<Pt | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [big, setBig] = useState(false);
  const [hideArea, setHideArea] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const wrap = useRef<HTMLDivElement>(null);

  // fresh data from the server replaces the guesses
  const [seenBattle, setSeenBattle] = useState(battle);
  if (seenBattle !== battle) { setSeenBattle(battle); setOptimistic({}); }
  const tokens = useMemo(() => battle.tokens.map((t) => (optimistic[t.id] ? { ...t, ...optimistic[t.id] } : t)), [battle.tokens, optimistic]);
  const byCombatant = useMemo(() => new Map(combatants.map((c) => [c.id, c])), [combatants]);
  const current = tokens.find((t) => t.combatantId === currentCombatantId) ?? null;

  // On your turn your token is picked for you, so you see where you can go right away (the DM: the monster whose turn it is).
  const [seenTurn, setSeenTurn] = useState<string | null | undefined>(undefined);
  if (seenTurn !== (current?.id ?? null)) {
    setSeenTurn(current?.id ?? null);
    if (current && (current.mine || isDm)) setSelId(current.id);
    setTele(null);
  }

  // an area spell from the turn card: show the map and start fresh
  const [seenAim, setSeenAim] = useState(aim);
  if (seenAim !== aim) { setSeenAim(aim); setAimPt(null); setPicked([]); setError(null); }
  useEffect(() => { if (aim) wrap.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [aim]);

  const sel = tokens.find((t) => t.id === selId) ?? null;
  const isTurnOf = (t: BattleToken) => t.combatantId === currentCombatantId;
  const canStrict = (t: BattleToken) => isTurnOf(t) && (t.mine || isDm);
  const left = sel ? Math.max(0, sel.budget - sel.movedFt) : 0;
  const reach = useMemo(() => {
    if (!sel || aim || tele) return [];
    if (free && isDm) return [];
    if (!canStrict(sel)) return [];
    return reachable(sel, tokens, map.cols, map.rows, left, map.feet);
  }, [sel, tokens, map, left, free, isDm, aim, tele]); // eslint-disable-line react-hooks/exhaustive-deps
  const reachSet = useMemo(() => new Set(reach.map((p) => `${p.x},${p.y}`)), [reach]);
  const myToken = teleportCharacterId ? tokens.find((t) => t.characterId === teleportCharacterId) ?? null : null;
  const teleSquares = useMemo(() => {
    if (!tele || !myToken) return [];
    const out: Pt[] = [];
    for (let y = 0; y < map.rows; y++) for (let x = 0; x < map.cols; x++)
      if ((x !== myToken.x || y !== myToken.y) && squares(myToken, { x, y }) * map.feet <= tele.range && freeAt(myToken, x, y, tokens, map.cols, map.rows)) out.push({ x, y });
    return out;
  }, [tele, myToken, tokens, map]);
  const teleSet = useMemo(() => new Set(teleSquares.map((p) => `${p.x},${p.y}`)), [teleSquares]);

  // ---- area spells ----
  const caster = aim ? tokens.find((t) => t.characterId === aim.characterId) ?? null : null;
  const aimAt = aimPt ?? (aim && caster && (aim.spec.range === null || aim.spec.shape === "targets") ? hover ?? (aim.spec.shape === "targets" ? { x: caster.x, y: caster.y } : null) : hover);
  const placed: Placed | null = aim && caster && aimAt ? place(aim.spec, caster, aimAt, map.feet) : null;
  const okRange = !!(aim && caster && aimAt && inRange(aim.spec, caster, aimAt, map.feet));
  const inside = placed && aim && caster ? tokensIn(placed, tokens, caster.id, aim.spec.shape) : [];
  const areaSquares = useMemo(() => (placed && aim?.spec.shape !== "targets" ? squaresIn(placed, map.cols, map.rows) : []), [placed, aim, map]);
  const choose = aim?.spec.pick === "choose";
  const ready = !!aimPt || aim?.spec.shape === "targets"; // "targets" spells: the area is your range, just pick

  function act<T>(fn: () => Promise<T | { error: string }>, after?: (r: T) => void) {
    setError(null); setNote(null);
    start(async () => {
      const r = await fn();
      if (r && typeof r === "object" && "error" in (r as object)) { setError((r as { error: string }).error); setOptimistic({}); return; }
      after?.(r as T);
      router.refresh();
    });
  }

  function tap(p: Pt) {
    if (Object.keys(optimistic).length) return; // the last move is still on its way
    const sq = { x: Math.floor(p.x), y: Math.floor(p.y) };
    const at = tokens.find((t) => sq.x >= t.x && sq.x < t.x + t.size && sq.y >= t.y && sq.y < t.y + t.size) ?? null;
    if (aim) {
      if (aim.spec.shape === "targets") {
        if (at && inside.includes(at)) togglePick(at.combatantId);
        setAimPt({ x: caster?.x ?? 0, y: caster?.y ?? 0 });
        return;
      }
      const pt = aim.spec.range === null && caster ? p : sq;
      setAimPt(pt);
      // who the spell picks by default: friends for healing, enemies otherwise (up to the spell's limit)
      if (choose && caster) {
        const now = tokensIn(place(aim.spec, caster, pt, map.feet), tokens, caster.id, aim.spec.shape);
        const still = picked.filter((id) => now.some((t) => t.combatantId === id));
        const next = still.length ? still : now.filter((t) => (aim.heal ? t.kind !== "monster" : t.kind === "monster")).map((t) => t.combatantId);
        setPicked(aim.spec.max ? next.slice(0, aim.spec.max) : next);
      }
      return;
    }
    if (tele && myToken) {
      if (!teleSet.has(`${sq.x},${sq.y}`)) return setError(`${tele.name}: pick a lit square (up to ${tele.range} ft, empty).`);
      const t = tele;
      setOptimistic({ [myToken.id]: sq }); setTele(null);
      return act(() => teleportToken(teleportCharacterId!, t.key, sq.x, sq.y), () => setNote(`${t.name}: done.`));
    }
    if (at && at.id !== selId) { setSelId(at.id); setError(null); return; }
    if (at && at.id === selId) { setSelId(null); return; }
    if (!sel) return;
    if (free && isDm) {
      if (!freeAt(sel, sq.x, sq.y, tokens, map.cols, map.rows)) return setError("Someone is already there.");
      setOptimistic({ [sel.id]: sq });
      return act(() => moveToken(sel.id, sq.x, sq.y, true));
    }
    if (!canStrict(sel)) return setError(isTurnOf(sel) ? "That isn't your token." : `${sel.name} can move on their turn.`);
    if (!reachSet.has(`${sq.x},${sq.y}`)) return setError(left > 0 ? `Too far: ${sel.name} has ${left} ft left. Lit squares are in reach.` : "No movement left. Dash to move again.");
    setOptimistic({ [sel.id]: sq });
    act(() => moveToken(sel.id, sq.x, sq.y));
  }

  function togglePick(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : aim?.spec.max && p.length >= aim.spec.max ? p : [...p, id]));
  }

  function cast() {
    if (!aim || !aimAt) return;
    const a = aim;
    act(() => castArea(a.characterId, a.optionKey, aimAt, picked, a.advantage), (res) => { ctx?.setAim(null); a.onDone(res); });
  }

  const visibleArea = battle.lastArea && battle.lastArea.at !== hideArea && !aim ? battle.lastArea : null;
  const lastSquares = useMemo(() => (visibleArea ? squaresIn(visibleArea.placed as Placed, map.cols, map.rows) : []), [visibleArea, map]);
  const heal = aim?.heal;
  const areaColor = heal ? "#5FC46A" : "#F0703C";
  const focusTok = tokens.find((t) => t.mine) ?? current;

  const board = (
    <Board cols={map.cols} rows={map.rows} label={`Battle map: ${map.name}, ${map.cols} by ${map.rows} squares`}
      image={map.image && map.imageW && map.imageH ? { src: map.image, w: map.imageW, h: map.imageH } : null}
      fit={map.crop ? { cols: map.cols, rows: map.rows, crop: map.crop, stretch: map.stretch } : null}
      focus={focusTok ? { x: focusTok.x, y: focusTok.y } : null}
      height={big ? "max(220px, calc(100dvh - 210px))" : "min(64dvh, 520px)"}
      onTap={tap} onHover={aim ? setHover : undefined}>
      {/* the last area spell, for everyone */}
      {lastSquares.map((s) => <rect key={`l${s.x},${s.y}`} x={s.x} y={s.y} width={1} height={1} fill="#F0703C" opacity={0.28} />)}
      {/* squares you can move to */}
      {reach.map((s) => <rect key={`r${s.x},${s.y}`} data-sq={`${s.x},${s.y}`} x={s.x + 0.06} y={s.y + 0.06} width={0.88} height={0.88} rx={0.12} fill="#5FC46A" opacity={0.32} stroke="#9BE39F" strokeWidth={0.03} data-reach="" />)}
      {teleSquares.map((s) => <rect key={`t${s.x},${s.y}`} data-tele={`${s.x},${s.y}`} x={s.x + 0.06} y={s.y + 0.06} width={0.88} height={0.88} rx={0.12} fill="#8A7CF0" opacity={0.3} />)}
      {/* the area being aimed */}
      {aim && caster && aim.spec.range !== null && aim.spec.shape !== "targets" && (
        <circle cx={caster.x + caster.size / 2} cy={caster.y + caster.size / 2} r={aim.spec.range / map.feet + caster.size / 2} fill="none" stroke="#fff" strokeOpacity={0.6} strokeWidth={0.05} strokeDasharray="0.3 0.2" />
      )}
      {aim && placed?.shape === "range" && <circle cx={placed.cx} cy={placed.cy} r={placed.r} fill={areaColor} fillOpacity={0.1} stroke={areaColor} strokeWidth={0.06} strokeDasharray="0.3 0.2" />}
      {areaSquares.map((s) => <rect key={`a${s.x},${s.y}`} x={s.x} y={s.y} width={1} height={1} fill={okRange ? areaColor : "#888"} opacity={0.38} data-area="" />)}
      {placed?.shape === "circle" && aim && <circle cx={placed.cx} cy={placed.cy} r={placed.r} fill="none" stroke={okRange ? areaColor : "#aaa"} strokeWidth={0.07} />}
      {/* tokens */}
      {tokens.map((t) => {
        const c = byCombatant.get(t.combatantId);
        const out = !!c?.out;
        const hit = inside.includes(t);
        const isPicked = choose ? picked.includes(t.combatantId) : hit;
        const r = t.size / 2;
        const initials = t.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
        return (
          <g key={t.id} transform={`translate(${t.x} ${t.y})`} opacity={t.hidden ? 0.5 : out ? 0.55 : 1} data-token={t.name}>
            <title>{`${t.name}${t.hidden ? " (hidden from the players)" : ""}`}</title>
            {isTurnOf(t) && <circle cx={r} cy={r} r={r - 0.02} fill="none" stroke="var(--color-accent)" strokeWidth={0.12} className="animate-pulse" />}
            <circle cx={r} cy={r} r={r - 0.1} fill={out ? "#555" : sideColor(t)} />
            {t.portrait ? <image href={t.portrait} x={0.14} y={0.14} width={t.size - 0.28} height={t.size - 0.28} clipPath="url(#tok-round)" preserveAspectRatio="xMidYMid slice" />
              : <text x={r} y={r} dy="0.35em" textAnchor="middle" fontSize={0.36 * Math.min(2, t.size)} fontWeight={700} fill="#16120e">{initials}</text>}
            {t.id === selId && <circle cx={r} cy={r} r={r - 0.06} fill="none" stroke="#fff" strokeWidth={0.08} />}
            {t.hidden && <circle cx={r} cy={r} r={r - 0.08} fill="none" stroke="#fff" strokeWidth={0.05} strokeDasharray="0.15 0.1" />}
            {aim && hit && <circle cx={r} cy={r} r={r - 0.04} fill="none" stroke={isPicked ? areaColor : "#bbb"} strokeWidth={isPicked ? 0.14 : 0.06} />}
            {out && <text x={r} y={r} dy="0.35em" textAnchor="middle" fontSize={0.7 * t.size} fill="#fff" opacity={0.85}>✕</text>}
          </g>
        );
      })}
      <defs><clipPath id="tok-round" clipPathUnits="objectBoundingBox"><circle cx={0.5} cy={0.5} r={0.5} /></clipPath></defs>
      {hover && !aim && reachSet.has(`${Math.floor(hover.x)},${Math.floor(hover.y)}`) && (
        <rect x={Math.floor(hover.x)} y={Math.floor(hover.y)} width={1} height={1} fill="none" stroke="#fff" strokeWidth={0.06} />
      )}
    </Board>
  );

  const selCombatant = sel ? byCombatant.get(sel.combatantId) : null;
  const canPicture = sel && (isDm || sel.mine);

  return (
    <section ref={wrap} aria-label="Battle map" className={big ? "fixed inset-0 z-50 overflow-y-auto bg-bg px-3 pt-3 pb-6" : "scroll-mt-4"}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-bold">{map.name} <span className="font-normal text-muted">· {map.cols * map.feet} × {map.rows * map.feet} ft</span></p>
        <button type="button" onClick={() => setBig(!big)} className="h-9 shrink-0 rounded-lg border border-line px-3 text-xs font-semibold text-soft">{big ? "Close full screen" : "Full screen"}</button>
      </div>

      {visibleArea && (
        <p className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-[#F0703C]/15 px-3 py-1.5 text-xs">
          <span><strong>{visibleArea.spell}</strong> by {visibleArea.by}</span>
          <button type="button" onClick={() => setHideArea(visibleArea.at)} className="text-muted underline">hide</button>
        </p>
      )}

      {aim && (
        <div className="mb-2 rounded-xl border border-accent-strong bg-accent-surface p-3 text-sm" role="region" aria-label="Aiming">
          <p className="font-bold">{aim.name}: {aim.spec.shape === "targets" ? `tap up to ${aim.spec.max} creatures in range` : aim.spec.range === null ? "tap the direction" : "tap where it goes"}</p>
          {!caster && <p className="mt-1 text-danger">Your token isn&apos;t on the map.</p>}
          {aimAt && !okRange && <p className="mt-1 text-danger">Out of range ({aim.spec.range} ft).</p>}
          {ready && okRange && (
            choose ? (
              <div className="mt-2">
                <p className="text-xs text-muted">{inside.length ? `Pick who it affects${aim.spec.max ? ` (up to ${aim.spec.max})` : ""}:` : "Nobody there yet."}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {inside.map((t) => (
                    <button key={t.id} type="button" aria-pressed={picked.includes(t.combatantId)} onClick={() => togglePick(t.combatantId)}
                      className={`h-9 rounded-full border px-3 text-xs font-semibold ${picked.includes(t.combatantId) ? "border-accent bg-accent text-accent-text" : "border-line text-soft"}`}>
                      {t.mine ? "Me" : t.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-1 text-soft">{inside.length ? <>Inside: {inside.map((t) => (t.mine ? "you" : t.name)).join(", ")}{inside.some((t) => t.kind !== "monster") && !heal && <strong className="text-danger"> (friends too!)</strong>}</> : "Nobody inside."}</p>
            )
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => ctx?.setAim(null)} className="h-11 rounded-xl border border-line font-semibold">Cancel</button>
            <button type="button" disabled={pending || !ready || !okRange || !caster || (choose && picked.length === 0)} onClick={cast}
              className="h-11 rounded-xl bg-accent font-bold text-accent-text disabled:opacity-50">{pending ? "Casting…" : `Cast here`}</button>
          </div>
        </div>
      )}

      {board}

      {error && <p className="mt-2 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      {note && <p className="mt-2 text-sm text-success">{note}</p>}

      {!aim && (
        <div className="mt-2 space-y-2">
          {sel ? (
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
              <PortraitButton key={sel.portrait ?? sel.id} kind={sel.characterId ? "character" : "monster"} id={(sel.characterId ?? sel.monsterId)!} name={sel.name} src={sel.portrait} canEdit={!!canPicture} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{sel.name}{sel.hidden && <span className="font-normal text-muted"> · hidden</span>}{selCombatant?.out && <span className="font-normal text-muted"> · down</span>}</p>
                <p className="text-xs text-muted" aria-live="polite">
                  {isTurnOf(sel) ? `${left} ft of movement left (speed ${sel.speed} ft${sel.dashes ? `, dashed ×${sel.dashes}` : ""})` : `Speed ${sel.speed} ft · not their turn`}
                </p>
              </div>
              {canStrict(sel) && sel.dashes < 2 && (
                <button type="button" disabled={pending} onClick={() => act(() => dashToken(sel.id), () => setNote(`Dash: +${sel.speed} ft.`))}
                  className="h-10 shrink-0 rounded-xl border border-accent-strong px-3 text-sm font-bold text-accent">Dash</button>
              )}
              {isDm && !sel.characterId && (
                <button type="button" disabled={pending} onClick={() => act(() => setTokenHidden(sel.id, !sel.hidden))}
                  className="h-10 shrink-0 rounded-xl border border-line px-3 text-xs font-semibold text-soft">{sel.hidden ? "Show" : "Hide"}</button>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted">Tap a token to see it. Drag to look around, pinch or use + / − to zoom.</p>
          )}
          {sel && canStrict(sel) && !free && <p className="text-xs text-muted">Green squares are where {sel.mine ? "you" : sel.name} can go. Tap one to move.</p>}

          {teleports.length > 0 && myToken && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted">Teleport:</span>
              {teleports.map((t) => (
                <button key={t.key} type="button" aria-pressed={tele?.key === t.key} onClick={() => { setTele(tele?.key === t.key ? null : t); setError(null); }}
                  className={`h-9 rounded-full border px-3 text-xs font-semibold ${tele?.key === t.key ? "border-accent bg-accent text-accent-text" : "border-line text-soft"}`}>
                  {t.name} ({t.range} ft)
                </button>
              ))}
              {tele && <span className="text-xs text-muted">Tap a purple square.</span>}
            </div>
          )}

          {isDm && (
            <button type="button" role="switch" aria-checked={free} onClick={() => setFree(!free)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-left">
              <span>
                <span className="block text-sm font-semibold">Free move (DM)</span>
                <span className="block text-xs text-muted">Move any token anywhere, any time: for setting up</span>
              </span>
              <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${free ? "bg-accent" : "bg-line"}`}>
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-text shadow transition-[left] duration-200 ${free ? "left-6" : "left-1"}`} />
              </span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}
