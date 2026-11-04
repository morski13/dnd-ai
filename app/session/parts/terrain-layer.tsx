"use client";
// Terrain on the battle map: what each painted square looks like (the DM's own pictures from /public/terrain
// when they're there, colours until then), heights; and the DM's paint tools.
import { useState } from "react";
import { DEFAULT_TALL, KINDS, KIND_LIST, type Kind, type TerrainData } from "@/lib/engine/terrain";
export { describeSquare } from "@/lib/engine/terrain";
import { terrainOf } from "@/lib/engine/space";
import { lightMap } from "@/lib/engine/vision";

/**
 * Pictures in /public/terrain/<name>.png that are there (the DM's own). Grass, water, fire, lava and smoke stay
 * plain colours on purpose; everything else uses its colour until its picture is added here.
 */
export const TERRAIN_PICTURES = new Set<string>(["barrel", "rocks", "boulder", "bush", "crate", "torch", "wall", "tree", "grass", "water-shallow", "water-deep"]);

export type Brush = { kind: Kind | "clear" | null; height: number | null; size: 1 | 3 };

/** Draws the terrain (grid units). */
export function TerrainLayer({ data }: { data: TerrainData }) {
  const cells = Object.entries(data.cells).filter(([, c]) => c.k !== "smoke" && c.k !== "darkness");
  return (
    <g aria-hidden>
      <defs>
        <pattern id="t-hatch" width={0.25} height={0.25} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={0.25} stroke="#C9A05A" strokeWidth={0.06} />
        </pattern>
      </defs>
      {cells.map(([k, c]) => {
        const [x, y] = k.split(",").map(Number);
        const r = KINDS[c.k];
        const pic = r.image && TERRAIN_PICTURES.has(r.image) ? r.image : null;
        return (
          <g key={k} data-terrain={c.k}>
            {c.k === "difficult" ? <rect x={x} y={y} width={1} height={1} fill="url(#t-hatch)" opacity={0.75} />
              : pic ? <image href={`/terrain/${r.image}.png`} x={x} y={y} width={1} height={1} preserveAspectRatio="xMidYMid slice" style={{ imageRendering: "pixelated" }} />
              : c.k !== "ground" ? <rect x={x} y={y} width={1} height={1} fill={r.color} opacity={r.blocksMove ? 0.85 : 0.5} stroke={r.blocksMove ? "#00000066" : "none"} strokeWidth={0.03} /> : null}
            {!pic && c.k !== "ground" && c.k !== "difficult" && c.k !== "wall" && (
              <text x={x + 0.5} y={y + 0.5} dy="0.35em" textAnchor="middle" fontSize={0.42} opacity={0.9}>{GLYPH[c.k] ?? ""}</text>
            )}
            {!!c.h && (
              <>
                <rect x={x} y={y} width={1} height={1} fill={c.h > 0 ? "#ffffff" : "#000000"} opacity={Math.min(0.35, Math.abs(c.h) / 60)} />
                <text x={x + 0.94} y={y + 0.24} textAnchor="end" fontSize={0.22} fontWeight={700} fill="#fff" stroke="#000" strokeWidth={0.04} paintOrder="stroke">{c.h > 0 ? `+${c.h}` : c.h}</text>
              </>
            )}
          </g>
        );
      })}
      {/* objects: one picture over all the squares they take (a 10-ft tree is 2×2) */}
      {(data.objects ?? []).map((o) => {
        const r = KINDS[o.k];
        const pic = r.image && TERRAIN_PICTURES.has(r.image) ? r.image : null;
        return (
          <g key={`o${o.id}`} data-object={o.k} data-size={o.size}>
            {pic
              ? <image href={`/terrain/${r.image}.png`} x={o.x} y={o.y} width={o.size} height={o.size} preserveAspectRatio="xMidYMid meet" style={{ imageRendering: "pixelated" }} />
              : <>
                <circle cx={o.x + o.size / 2} cy={o.y + o.size / 2} r={o.size * 0.46} fill={r.color} opacity={0.85} stroke="#00000066" strokeWidth={0.04} />
                <text x={o.x + o.size / 2} y={o.y + o.size / 2} dy="0.35em" textAnchor="middle" fontSize={0.42 * o.size}>{GLYPH[o.k] ?? ""}</text>
              </>}
            {/* how tall it is (for flying over it) */}
            {(o.tall ?? DEFAULT_TALL[o.k] ?? 0) > 0 && (
              <text x={o.x + o.size - 0.06} y={o.y + o.size - 0.08} textAnchor="end" fontSize={Math.min(0.32, 0.2 + o.size * 0.02)} fontWeight={700}
                fill="#fff" stroke="#000" strokeWidth={0.05} paintOrder="stroke" data-tall="">{o.tall ?? DEFAULT_TALL[o.k]} ft</text>
            )}
          </g>
        );
      })}
      <HeightEdges data={data} />
    </g>
  );
}

const GLYPH: Partial<Record<Kind, string>> = {
  tree: "🌳", boulder: "🪨", bush: "🌿", grass: "🌾", rocks: "·", water: "≈", "deep-water": "≋", barrel: "🛢", crate: "📦",
  fire: "🔥", lava: "🌋", spikes: "✴", acid: "☣",
};

/**
 * Light and fog on top of everything (grid units): dim squares a little darker, dark squares much darker,
 * smoke grey; with fog of war, what the player's characters can't see is black.
 */
export function LightLayer({ data, cols, rows, visible }: { data: TerrainData; cols: number; rows: number; visible: Set<string> | null }) {
  const t = terrainOf(data);
  const light = lightMap(t, cols, rows);
  const out: React.ReactNode[] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const k = `${x},${y}`;
    if (visible && !visible.has(k)) { out.push(<rect key={`f${k}`} x={x} y={y} width={1.02} height={1.02} fill="#050403" opacity={0.94} data-fog="" />); continue; }
    if (t.heavy.has(k)) out.push(<rect key={`s${k}`} x={x} y={y} width={1} height={1} fill={t.magicDark.has(k) ? "#000" : "#b8bec4"} opacity={t.magicDark.has(k) ? 0.92 : 0.7} data-smoke="" />);
    else if (light.get(k) === "dark") out.push(<rect key={`d${k}`} x={x} y={y} width={1} height={1} fill="#000" opacity={0.62} data-dark="" />);
    else if (light.get(k) === "dim") out.push(<rect key={`m${k}`} x={x} y={y} width={1} height={1} fill="#000" opacity={0.32} data-dim="" />);
  }
  return <g aria-hidden pointerEvents="none">{out}</g>;
}

/** DM: the map's light and fog of war. */
export function LightTools({ light, fog, pending, onChange }: { light: "bright" | "dim" | "dark"; fog: boolean; pending: boolean; onChange: (light: "bright" | "dim" | "dark", fog: boolean) => void }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2" aria-label="Light and fog of war">
      <p className="text-sm font-semibold">Light (DM)</p>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Light on the map">
        {([["bright", "Bright (day)"], ["dim", "Dim (dusk, cave)"], ["dark", "Dark (night)"]] as const).map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={light === k} disabled={pending} onClick={() => light !== k && onChange(k, fog)}
            className={`min-h-10 rounded-lg border px-1.5 text-xs ${light === k ? "border-accent bg-accent-surface font-bold text-accent" : "border-line text-soft"}`}>{label}</button>
        ))}
      </div>
      <button type="button" role="switch" aria-checked={fog} disabled={pending} onClick={() => onChange(light, !fog)}
        className="mt-2 flex w-full items-center justify-between gap-3 text-left">
        <span>
          <span className="block text-sm font-semibold">Fog of war</span>
          <span className="block text-xs text-muted">Players see only what their characters see (light, darkvision, walls, smoke)</span>
        </span>
        <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${fog ? "bg-accent" : "bg-line"}`}>
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-text shadow transition-[left] duration-200 ${fog ? "left-6" : "left-1"}`} />
        </span>
      </button>
      <p className="mt-1 text-[11px] text-muted">Paint Light (torch), Smoke / fog and Magical darkness with the brush below.</p>
    </div>
  );
}

/** Placed as objects (any size), not painted square by square. */
const OBJECT_ONLY = new Set<Kind>(["tree", "boulder", "bush", "barrel", "crate", "torch"]);

/**
 * Edges between ground of different heights: a line where the ground steps up or down, thicker for bigger steps,
 * with a light side on the higher ground (ledges, cliffs, pit edges).
 */
function HeightEdges({ data }: { data: TerrainData }) {
  const h = (x: number, y: number) => data.cells[`${x},${y}`]?.h ?? 0;
  const seen = new Set<string>();
  const lines: React.ReactNode[] = [];
  for (const k of Object.keys(data.cells)) {
    if (!data.cells[k].h) continue;
    const [x, y] = k.split(",").map(Number);
    // the four sides of this square; each side once
    for (const [nx, ny, x1, y1, x2, y2] of [[x + 1, y, x + 1, y, x + 1, y + 1], [x - 1, y, x, y, x, y + 1], [x, y + 1, x, y + 1, x + 1, y + 1], [x, y - 1, x, y, x + 1, y]] as const) {
      if (nx < 0 || ny < 0) continue;
      const step = h(x, y) - h(nx, ny);
      if (!step) continue;
      const id = `${Math.min(x1, x2)},${Math.min(y1, y2)},${x1 === x2 ? "v" : "h"}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const w = Math.min(0.16, 0.05 + Math.abs(step) / 150);
      lines.push(
        <g key={id} data-ledge={Math.abs(step)}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#000" strokeOpacity={0.75} strokeWidth={w + 0.06} strokeLinecap="round" />
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#f3e2b8" strokeWidth={w} strokeLinecap="round" />
        </g>,
      );
    }
  }
  return <g aria-hidden pointerEvents="none">{lines}</g>;
}


/** The DM's paint tools: what to paint, a height, brush size. */
export function PaintTools({ brush, setBrush }: { brush: Brush | null; setBrush: (b: Brush | null) => void }) {
  const [h, setH] = useState("10");
  const b: Brush = brush ?? { kind: null, height: null, size: 1 };
  const pick = (next: Partial<Brush>) => setBrush({ ...b, ...next });
  const on = !!brush;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2" aria-label="Paint the map">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Paint the map (DM)</p>
        {on && <button type="button" onClick={() => setBrush(null)} className="h-9 rounded-lg bg-accent px-3 text-xs font-bold text-accent-text">Done</button>}
      </div>
      <p className="text-xs text-muted">Pick what to paint, then drag a finger over the map (two fingers zoom). Trees, boulders, bushes, barrels, crates and lights are objects: place them with Objects. {on ? "" : "Tap a kind to start."}</p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Terrain">
        {KIND_LIST.filter((k) => k !== "ground" && !OBJECT_ONLY.has(k)).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={b.kind === k && on} onClick={() => pick({ kind: k, height: null })}
            className={`flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-xs ${b.kind === k && on ? "border-accent bg-accent-surface font-bold text-accent" : "border-line text-soft"}`}>
            <span aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ background: KINDS[k].color === "transparent" ? "none" : KINDS[k].color }} />{KINDS[k].label}
          </button>
        ))}
        <button type="button" role="radio" aria-checked={b.kind === "clear" && on} onClick={() => pick({ kind: "clear", height: null })}
          className={`h-9 rounded-full border px-2.5 text-xs ${b.kind === "clear" && on ? "border-danger-line bg-danger-bg font-bold text-danger" : "border-line text-soft"}`}>Erase</button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>Height</span>
        <input inputMode="numeric" value={h} onChange={(e) => setH(e.target.value.replace(/[^\d-]/g, "").slice(0, 4))} aria-label="Height in feet"
          className="h-9 w-16 rounded-lg border border-line bg-bg px-2 text-sm text-text" />
        <span>ft</span>
        <button type="button" aria-pressed={b.height !== null && on} onClick={() => pick({ height: Number(h) || 0, kind: b.kind === "clear" ? null : b.kind })}
          className={`h-9 rounded-full border px-2.5 ${b.height !== null && on ? "border-accent bg-accent-surface font-bold text-accent" : "border-line text-soft"}`}>Paint height</button>
        <span className="ml-auto">Brush</span>
        {([1, 3] as const).map((n) => (
          <button key={n} type="button" aria-pressed={b.size === n} onClick={() => pick({ size: n })}
            className={`h-9 w-11 rounded-lg border ${b.size === n ? "border-accent font-bold text-accent" : "border-line text-soft"}`}>{n}×{n}</button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-muted">
        Walls, trees and boulders block moving (trees and boulders: up to three-quarters cover). Bushes, barrels and crates: half cover.
        Grass, rocks, water and bushes: difficult terrain. Fire, lava, spikes and acid hurt. Height: climbing costs extra; higher ground blocks the view from below.
      </p>
    </div>
  );
}
