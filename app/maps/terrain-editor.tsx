"use client";
// Terrain for a battle map, set up when the DM makes the map:
//  - Ground: paint walls, water, grass, hazards, smoke, heights… with a brush
//  - Objects: trees, boulders, bushes, barrels, crates, lights, as big as you want (5 ft to 30 ft) and as tall as you want
//  - Light: bright / dim / dark, and fog of war for the players
// Everything is saved with the map; a fight on the map sees it at once.
import { useState, useTransition } from "react";
import { DEFAULT_TALL, KINDS, OBJECT_KINDS, objectAt, paint, placeObject, removeObject, strokeSquares, type Kind, type MapObject, type TerrainData } from "@/lib/engine/terrain";
import type { GridFit } from "@/lib/maps/grid";
import { Board, type Pt } from "../components/map/board";
import { LightLayer, LightTools, PaintTools, TerrainLayer, type Brush } from "../session/parts/terrain-layer";
import { saveMapTerrain } from "./actions";

const SIZES = [1, 2, 3, 4, 5, 6]; // squares: 5 ft … 30 ft

export function TerrainEditor({ mapId, name, cols, rows, feet, image, fit, initial, onClose }: {
  mapId: string; name: string; cols: number; rows: number; feet: number;
  image: { src: string; w: number; h: number } | null; fit: GridFit | null;
  initial: TerrainData; onClose: () => void;
}) {
  const [t, setT] = useState<TerrainData>(initial);
  const [mode, setMode] = useState<"ground" | "objects" | "light">("objects");
  const [brush, setBrush] = useState<Brush | null>(null);
  const [kind, setKind] = useState<Kind>("tree");
  const [size, setSize] = useState(2);
  const [tall, setTall] = useState<string>(String(DEFAULT_TALL.tree ?? 20));
  const [sel, setSel] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const change = (next: TerrainData) => { setT(next); setDirty(true); setMsg(null); };
  const selected = (t.objects ?? []).find((o) => o.id === sel) ?? null;

  const paintOn = mode === "ground" && !!brush && (!!brush.kind || brush.height !== null);
  function stroke(a: Pt, b: Pt) {
    if (!paintOn || !brush) return;
    const keys = strokeSquares(a, b, brush.size).filter((k) => { const [x, y] = k.split(",").map(Number); return x < cols && y < rows; });
    change(paint(t, keys, { ...(brush.kind ? { kind: brush.kind } : {}), ...(brush.height !== null ? { height: brush.height } : {}) }));
  }
  function tap(p: Pt) {
    if (mode !== "objects") return;
    const x = Math.floor(p.x), y = Math.floor(p.y);
    const hit = objectAt(t, x, y);
    if (hit) { setSel(hit.id === sel ? null : hit.id); return; }
    const o: MapObject = { id: crypto.randomUUID().slice(0, 8), k: kind, x: x - Math.floor((size - 1) / 2), y: y - Math.floor((size - 1) / 2), size, tall: Math.max(0, Number(tall) || 0) };
    change(placeObject(t, o, cols, rows));
    setSel(null);
  }
  function save() {
    start(async () => {
      const r = await saveMapTerrain(mapId, t);
      if ("error" in r) return setMsg(r.error);
      setDirty(false);
      setMsg("Saved. Fights on this map see it now.");
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate font-heading text-xl font-semibold">Terrain · {name}</h2>
        <button type="button" onClick={() => { if (!dirty || confirm("Leave without saving the terrain?")) onClose(); }} className="h-10 shrink-0 px-2 text-sm text-muted underline">Close</button>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5" role="tablist" aria-label="What to edit">
        {([["objects", "Objects"], ["ground", "Ground"], ["light", "Light"]] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => { setMode(k); setSel(null); }}
            className={`h-10 rounded-xl border text-sm ${mode === k ? "border-accent bg-accent-surface font-bold text-accent" : "border-line text-soft"}`}>{label}</button>
        ))}
      </div>

      <div className="mt-2">
        <Board cols={cols} rows={rows} image={image} fit={fit} label={`Terrain of ${name}`} height="min(62dvh, 540px)"
          onTap={tap} onBrush={paintOn ? stroke : undefined}>
          <TerrainLayer data={t} />
          {selected && <rect x={selected.x} y={selected.y} width={selected.size} height={selected.size} fill="none" stroke="#fff" strokeWidth={0.08} strokeDasharray="0.25 0.15" />}
          {mode === "light" && <LightLayer data={t} cols={cols} rows={rows} visible={null} />}
        </Board>
      </div>
      <p className="mt-1 text-xs text-muted">{cols} × {rows} squares · 1 square = {feet} ft</p>

      {mode === "objects" && (
        <div className="mt-2 rounded-xl border border-line bg-surface p-3">
          {selected ? (
            <>
              <p className="text-sm font-semibold">{KINDS[selected.k].label} · {selected.size * feet} ft wide · {selected.tall ?? DEFAULT_TALL[selected.k] ?? 0} ft tall</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <span>Size</span>
                {SIZES.map((n) => (
                  <button key={n} type="button" aria-pressed={selected.size === n} onClick={() => change(placeObject(removeObject(t, selected.id), { ...selected, size: n }, cols, rows))}
                    className={`h-9 min-w-11 rounded-lg border px-1.5 ${selected.size === n ? "border-accent font-bold text-accent" : "border-line text-soft"}`}>{n * feet} ft</button>
                ))}
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs text-muted">Height
                <input inputMode="numeric" defaultValue={String(selected.tall ?? DEFAULT_TALL[selected.k] ?? 0)} key={selected.id}
                  onBlur={(e) => change({ ...t, objects: (t.objects ?? []).map((o) => (o.id === selected.id ? { ...o, tall: Math.max(0, Number(e.target.value) || 0) } : o)) })}
                  className="h-9 w-20 rounded-lg border border-line bg-bg px-2 text-sm text-text" />
                ft (flying over it)
              </label>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => { change(removeObject(t, selected.id)); setSel(null); }} className="h-10 flex-1 rounded-xl border border-danger-line text-sm font-semibold text-danger">Remove</button>
                <button type="button" onClick={() => setSel(null)} className="h-10 flex-1 rounded-xl border border-line text-sm text-soft">Done</button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-muted">Pick an object, its size and height, then tap the map to place it. Tap a placed object to change or remove it.</p>
              <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Object">
                {OBJECT_KINDS.map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => { setKind(k); setTall(String(DEFAULT_TALL[k] ?? 0)); }}
                    className={`h-9 rounded-full border px-3 text-xs ${kind === k ? "border-accent bg-accent-surface font-bold text-accent" : "border-line text-soft"}`}>{KINDS[k].label}</button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <span>Size</span>
                {SIZES.map((n) => (
                  <button key={n} type="button" aria-pressed={size === n} onClick={() => setSize(n)}
                    className={`h-9 min-w-11 rounded-lg border px-1.5 ${size === n ? "border-accent font-bold text-accent" : "border-line text-soft"}`}>{n * feet} ft</button>
                ))}
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs text-muted">Height
                <input inputMode="numeric" value={tall} onChange={(e) => setTall(e.target.value.replace(/\D/g, "").slice(0, 3))} className="h-9 w-20 rounded-lg border border-line bg-bg px-2 text-sm text-text" />
                ft (flying over it)
              </label>
              <p className="mt-1.5 text-[11px] text-muted">{KINDS[kind].label}: {rule(kind)}</p>
            </>
          )}
        </div>
      )}
      {mode === "ground" && <div className="mt-2"><PaintTools brush={brush} setBrush={setBrush} /></div>}
      {mode === "light" && (
        <div className="mt-2">
          <LightTools light={t.light ?? "bright"} fog={!!t.fog} pending={pending} onChange={(l, f) => change({ ...t, light: l, ...(f ? { fog: true } : { fog: undefined }) })} />
          <p className="mt-1 text-xs text-muted">Lights are objects (Objects → Light (torch)). Smoke and magical darkness are painted (Ground).</p>
        </div>
      )}

      <div className="sticky bottom-20 z-10 mt-3 flex items-center gap-2 rounded-xl border border-line bg-surface-2/95 p-2 backdrop-blur">
        <p className="min-w-0 flex-1 px-1 text-xs text-muted" role="status">{msg ?? (dirty ? "Not saved yet" : "Saved")}</p>
        <button type="button" disabled={!dirty || pending} onClick={save} className="h-11 rounded-xl bg-accent px-5 font-bold text-accent-text disabled:opacity-40">{pending ? "Saving…" : "Save terrain"}</button>
      </div>
    </div>
  );
}

function rule(k: Kind) {
  const r = KINDS[k];
  return [
    r.blocksMove ? "blocks moving" : r.difficult ? "difficult terrain" : null,
    r.cover === "three-quarters" ? "up to three-quarters cover" : r.cover === "half" ? "half cover" : null,
    r.lightlyObscured ? "lightly obscured" : null,
    r.light ? `light ${r.light.bright} ft bright + ${r.light.dim} ft dim` : null,
  ].filter(Boolean).join(", ") || "decoration";
}
