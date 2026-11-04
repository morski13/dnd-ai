"use client";
// Terrain on the battle map: what each painted square looks like (the DM's own pictures from /public/terrain
// when they're there, colours until then), heights, doors and windows; and the DM's paint tools.
import { useState } from "react";
import { KINDS, KIND_LIST, type Kind, type TerrainData } from "@/lib/engine/terrain";

/**
 * Pictures in /public/terrain/<name>.png that are there (the DM's own). Grass, water, fire, lava and smoke stay
 * plain colours on purpose; everything else uses its colour until its picture is added here.
 */
export const TERRAIN_PICTURES = new Set<string>(["barrel", "rocks", "crate", "torch", "wall", "tree"]);

export type Brush = { kind: Kind | "clear" | null; height: number | null; door: "door" | "window" | null; size: 1 | 3 };

/** Draws the terrain (grid units). */
export function TerrainLayer({ data }: { data: TerrainData }) {
  const cells = Object.entries(data.cells);
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
      {Object.entries(data.doors).map(([k, d]) => {
        const [x, y] = k.split(",").map(Number);
        const name = d.window ? "window" : d.open ? "door-open" : "door-closed";
        const pic = TERRAIN_PICTURES.has(name) ? name : null;
        return pic
          ? <image key={`door${k}`} href={`/terrain/${pic}.png`} x={x} y={y} width={1} height={1} data-door={d.open ? "open" : "closed"} style={{ imageRendering: "pixelated" }} />
          : (
            <g key={`door${k}`} data-door={d.window ? "window" : d.open ? "open" : "closed"}>
              <rect x={x + 0.08} y={y + 0.08} width={0.84} height={0.84} rx={0.08} fill={d.window ? "#9fd3ef" : d.open ? "none" : "#7a4a22"} fillOpacity={d.window ? 0.55 : 1}
                stroke={d.window ? "#d9f1ff" : "#c08a52"} strokeWidth={0.07} strokeDasharray={d.open ? "0.15 0.1" : undefined} />
              {!d.window && !d.open && <circle cx={x + 0.72} cy={y + 0.5} r={0.06} fill="#e5c07b" />}
            </g>
          );
      })}
    </g>
  );
}

const GLYPH: Partial<Record<Kind, string>> = {
  tree: "🌳", boulder: "🪨", bush: "🌿", grass: "🌾", rocks: "·", water: "≈", "deep-water": "≋", barrel: "🛢", crate: "📦",
  fire: "🔥", lava: "🌋", spikes: "✴", acid: "☣",
};

/** The DM's paint tools: what to paint, a height, doors and windows, brush size. */
export function PaintTools({ brush, setBrush }: { brush: Brush | null; setBrush: (b: Brush | null) => void }) {
  const [h, setH] = useState("10");
  const b: Brush = brush ?? { kind: null, height: null, door: null, size: 1 };
  const pick = (next: Partial<Brush>) => setBrush({ ...b, ...next });
  const on = !!brush;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2" aria-label="Paint the map">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Paint the map (DM)</p>
        {on && <button type="button" onClick={() => setBrush(null)} className="h-9 rounded-lg bg-accent px-3 text-xs font-bold text-accent-text">Done</button>}
      </div>
      <p className="text-xs text-muted">Pick what to paint, then drag a finger over the map (two fingers zoom). {on ? "" : "Tap a kind to start."}</p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Terrain">
        {KIND_LIST.filter((k) => k !== "ground").map((k) => (
          <button key={k} type="button" role="radio" aria-checked={b.kind === k && on} onClick={() => pick({ kind: k, door: null, height: null })}
            className={`flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-xs ${b.kind === k && on ? "border-accent bg-accent-surface font-bold text-accent" : "border-line text-soft"}`}>
            <span aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ background: KINDS[k].color === "transparent" ? "none" : KINDS[k].color }} />{KINDS[k].label}
          </button>
        ))}
        <button type="button" role="radio" aria-checked={b.door === "door" && on} onClick={() => pick({ kind: null, door: "door", height: null })}
          className={`h-9 rounded-full border px-2.5 text-xs ${b.door === "door" && on ? "border-accent bg-accent-surface font-bold text-accent" : "border-line text-soft"}`}>Door</button>
        <button type="button" role="radio" aria-checked={b.door === "window" && on} onClick={() => pick({ kind: null, door: "window", height: null })}
          className={`h-9 rounded-full border px-2.5 text-xs ${b.door === "window" && on ? "border-accent bg-accent-surface font-bold text-accent" : "border-line text-soft"}`}>Window</button>
        <button type="button" role="radio" aria-checked={b.kind === "clear" && on} onClick={() => pick({ kind: "clear", door: null, height: null })}
          className={`h-9 rounded-full border px-2.5 text-xs ${b.kind === "clear" && on ? "border-danger-line bg-danger-bg font-bold text-danger" : "border-line text-soft"}`}>Erase</button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>Height</span>
        <input inputMode="numeric" value={h} onChange={(e) => setH(e.target.value.replace(/[^\d-]/g, "").slice(0, 4))} aria-label="Height in feet"
          className="h-9 w-16 rounded-lg border border-line bg-bg px-2 text-sm text-text" />
        <span>ft</span>
        <button type="button" aria-pressed={b.height !== null && on} onClick={() => pick({ height: Number(h) || 0, kind: b.kind === "clear" ? null : b.kind, door: null })}
          className={`h-9 rounded-full border px-2.5 ${b.height !== null && on ? "border-accent bg-accent-surface font-bold text-accent" : "border-line text-soft"}`}>Paint height</button>
        <span className="ml-auto">Brush</span>
        {([1, 3] as const).map((n) => (
          <button key={n} type="button" aria-pressed={b.size === n} onClick={() => pick({ size: n })}
            className={`h-9 w-11 rounded-lg border ${b.size === n ? "border-accent font-bold text-accent" : "border-line text-soft"}`}>{n}×{n}</button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-muted">
        Walls, trees and boulders block moving (trees and boulders: up to three-quarters cover). Bushes, barrels, crates and windows: half cover.
        Grass, rocks, water and bushes: difficult terrain. Fire, lava, spikes and acid hurt. Height: climbing costs extra; higher ground blocks the view from below.
      </p>
    </div>
  );
}
